/*
 * Author boo1ean
 * (https://github.com/boo1ean/apiapi)
 * MIT Licensed
 */

const Debug = require('debug')
const _ = require('lodash')
const axios = require('axios')
const rateLimit = require('axios-rate-limit')
const parseQueryString = require('shitty-qs')

const debug = Debug('apiapi')

_.templateSettings.interpolate = /{([\s\S]+?)}/g

/**
 * @type {rateLimitOptions}
 */
const rateLimitDefaultOptions = { maxRPS: 7 }

/**
 * @param {import('index').IApiClientOptions} opts
 * @constructor
 */
function ApiClient(opts) {
  assertOptions(opts)

  const rateLimitOptions = opts.rateLimitOptions || rateLimitDefaultOptions

  this.request = rateLimit(axios.create(opts.axiosOptions), rateLimitOptions)
  this.baseUrl = opts.baseUrl || ''
  this.headers = opts.headers || {}
  this.transformResponse = opts.transformResponse
  this.transformRequest = opts.transformRequest
  this.required = opts.required
  this.errorHandler = opts.errorHandler
  this.responseType = opts.responseType
  this.rawResponse = opts.rawResponse
  this.query = opts.query || {}
  this.body = opts.body || {}

  for (const methodName in opts.methods) {
    this[methodName] = this._composeMethod(opts.methods[methodName], methodName)
  }

  debug('client is instantiated')

  function assertOptions(opts) {
    if (!opts.baseUrl) {
      throw new Error('Missing baseUrl option')
    }

    if (!opts.methods || !_.isObject(opts.methods)) {
      throw new Error('Invalid methods list')
    }

    if (opts.headers && !_.isObject(opts.headers)) {
      throw new Error('Headers must be object')
    }

    if (opts.required && !_.isObject(opts.required)) {
      throw new Error('Required fields config must be an object')
    }

    if (opts.transformResponse && !_.isObject(opts.transformResponse) && !_.isFunction(opts.transformResponse)) {
      throw new Error('transformResponse must be an object or function')
    }

    if (opts.transformRequest && !_.isObject(opts.transformRequest) && !_.isFunction(opts.transformRequest)) {
      throw new Error('transformRequest must be object or function')
    }

    if (opts.errorHandler && !_.isObject(opts.errorHandler) && !_.isFunction(opts.errorHandler)) {
      throw new Error('errorHandler must be object or function')
    }

    if (opts.query && !_.isObject(opts.query)) {
      throw new Error('Query params pick options should be an object')
    }

    if (opts.body && !_.isObject(opts.body)) {
      throw new Error('Body params pick options should be an object')
    }
  }
}

ApiClient.prototype.assert = function assert(cond, errorMessage) {
  if (!cond) {
    throw new Error(errorMessage)
  }
}

ApiClient.prototype.assertParams = function assertParams(params, methodName) {
  if (!this.required || !this.required[methodName]) {
    return
  }

  this.assert(
    typeof params === 'object',
    'method params must be valid object with fields: ' + this.required[methodName].join(', ')
  )

  _.forEach(this.required[methodName], (param) => {
    this.assert(!_.isUndefined(params[param]), param + ' param is required')
  })
}

ApiClient.prototype._composeMethod = function _composeMethod(config, methodName) {
  const requestOptions = this._getRequestOptions(config, methodName)
  const errorHandler = this._getErrorHandler(methodName)
  const transformResponse = this._getResponseTransformer(methodName)
  const transformRequest = this._getRequestTransformer(methodName)
  const self = this

  return function apiMethod(requestParams, additionalRequestOptions) {
    return new Promise(function exec(resolve, reject) {
      debug('called method %s', methodName)

      self.assertParams(requestParams, methodName)

      // Make sure arguments are immutable
      requestParams = _.cloneDeep(requestParams) || {}
      additionalRequestOptions = _.cloneDeep(additionalRequestOptions) || {}

      let requestBody = getRequestBody(requestOptions, requestParams)
      const originalRequestParams = _.cloneDeep(requestParams)

      return Promise.resolve(transformRequest.call(self, requestParams, requestBody, additionalRequestOptions))
        .then(function (transformed) {
          if (_.isArray(transformed)) {
            requestParams = transformed[0]
            requestBody = transformed[1]
            additionalRequestOptions = transformed[2]
          }

          /**
           * @type {{responseType: (Object|Function|string), method: *, url: *} & import('axios').AxiosRequestConfig}
           */
          const opts = {
            method: requestOptions.httpMethod,
            url: requestOptions.baseUrl + getUri(requestOptions, requestParams),
            responseType: additionalRequestOptions.responseType || self.responseType || 'json',
          }

          if (requestOptions.headers) {
            opts.headers = requestOptions.headers
          }

          if (additionalRequestOptions.headers) {
            opts.headers = _.extend({}, opts.headers, additionalRequestOptions.headers)
          }

          // Check on post/put/patch/delete methods
          if (['POST', 'PATCH', 'PUT', 'DELETE'].indexOf(opts.method) > -1) {
            opts.data = requestBody
          }

          // Handle raw response flag and remove axios response parser
          if (self.rawResponse) {
            opts.transformResponse = []
          }

          debug('request started', opts)
          let promise = self.request(opts).then(function execResponseParser(res) {
            debug('request finished', { opts: opts, res: res })
            return transformResponse.call(self, res, originalRequestParams, requestParams)
          })

          if (errorHandler) {
            promise = promise.catch(errorHandler)
          }

          return promise.then(resolve, reject)
        })
        .catch(reject)
    })
  }

  function getUri(requestOptions, params) {
    const uri = getPath()
    const query = getQuery()

    if (query) {
      return uri + '?' + query
    }

    return uri

    function getPath() {
      return _.template(requestOptions.uriSchema.path)(_.pick(params, requestOptions.uriSchema.pathParams))
    }

    function getQuery() {
      if (requestOptions.httpMethod === 'GET') {
        // Filter out path params
        let queryParams = _.omit(params, requestOptions.uriSchema.pathParams)

        // Apply default query params
        queryParams = _.defaults(queryParams, requestOptions.uriSchema.query)

        if (_.isArray(requestOptions.queryParamsPick)) {
          queryParams = _.pick(queryParams, requestOptions.queryParamsPick)
        }

        return stringifyQuery(queryParams)
      }

      return stringifyQuery(
        _.extend(requestOptions.uriSchema.query, _.pick(params, requestOptions.uriSchema.queryParams))
      )

      function stringifyQuery(query) {
        return _.values(_.map(query, stringifyParam)).join('&')

        function stringifyParam(val, key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(val)
        }
      }
    }
  }

  function getRequestBody(requestOptions, params) {
    let requestBody = _.omit(params, requestOptions.uriSchema.pathParams)

    if (_.isArray(requestOptions.bodyParamsPick)) {
      requestBody = _.pick(requestBody, requestOptions.bodyParamsPick)
    }

    return requestBody
  }
}

ApiClient.prototype._getRequestTransformer = function _getRequestTransformer(methodName) {
  switch (true) {
    case _.isFunction(this.transformRequest):
      return this.transformRequest
    case _.isObject(this.transformRequest) && _.isFunction(this.transformRequest[methodName]):
      return this.transformRequest[methodName]
    default:
      return returnSame
  }

  function returnSame(params) {
    return params
  }
}

ApiClient.prototype._getResponseTransformer = function _getResponseTransformer(methodName) {
  switch (true) {
    case _.isFunction(this.transformResponse):
      return this.transformResponse
    case _.isObject(this.transformResponse) && _.isFunction(this.transformResponse[methodName]):
      return this.transformResponse[methodName]
    default:
      return returnBody
  }

  function returnBody(res) {
    return res.data
  }
}

ApiClient.prototype._getErrorHandler = function _getErrorHandler(methodName) {
  switch (true) {
    case _.isFunction(this.errorHandler):
      return this.errorHandler
    case _.isObject(this.errorHandler) && _.isFunction(this.errorHandler[methodName]):
      return this.errorHandler[methodName]
    default:
      return null
  }
}

ApiClient.prototype._getRequestOptions = function _getRequestOptions(config, methodName) {
  const configTokens = config.split(' ')

  if (configTokens.length !== 2) {
    throw new Error('Invalid rest endpoint declaration - ' + config)
  }

  const requestOptions = {
    baseUrl: this.baseUrl,
    httpMethod: configTokens[0].toUpperCase(),
    uriSchema: parseUri(configTokens[1]),
    queryParamsPick: this.query[methodName],
    bodyParamsPick: this.body[methodName],
  }

  if (this.headers) {
    requestOptions.headers = this.headers
  }

  return requestOptions

  function parseUri(uri) {
    const uriTokens = uri.split('?')

    return {
      path: uriTokens[0],
      pathParams: extractParams(uriTokens[0]),
      query: uriTokens.length > 1 ? parseQueryString(uriTokens[1]) : {},
      queryParams: uriTokens.length > 1 ? extractParams(uriTokens[1]) : {},
    }

    function extractParams(path) {
      const matches = path.match(/{([\s\S]+?)}/g) || []
      return matches.map(slice)

      function slice(param) {
        return param.slice(1, -1)
      }
    }
  }
}

module.exports = ApiClient
