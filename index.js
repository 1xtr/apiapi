var Promise = require('bluebird');
var request = Promise.promisify(require('request'));
var _ = require('lodash');
var parseQuerString = require('shitty-qs');

_.templateSettings.interpolate = /{([\s\S]+?)}/g;

function ApiClient (opts) {
	assertOptions(opts);

	this.request = request;
	this.baseUrl = opts.baseUrl;
	this.headers = opts.headers;
	this.parse = opts.parse;
	this.before = opts.before;

	for (var methodName in opts.methods) {
		this[methodName] = this._composeMethod(opts.methods[methodName], methodName);
	}

	function assertOptions (opts) {
		if (!opts.baseUrl) {
			throw new Error('Missng baseUrl option');
		}

		if (!opts.methods || !_.isObject(opts.methods)) {
			throw new Error('Invalid methods list');
		}

		if (opts.headers && !_.isObject(opts.headers)) {
			throw new Error('Headers must be object');
		}

		if (opts.parse && (!_.isObject(opts.parse) && !_.isFunction(opts.parse))) {
			throw Error('Parse must be object or function');
		}

		if (opts.before && (!_.isObject(opts.before) && !_.isFunction(opts.before))) {
			throw Error('Before must be object or function');
		}
	}
};

ApiClient.prototype._composeMethod = function _composeMethod (config, methodName) {
	var requestOptions = this._getRequestOptions(config);
	var self = this;

	return function apiMethod (requestParams, additionalRequestOptions, cb) {

		// if callback passed as first argument
		if (_.isFunction(requestParams)) {
			cb = requestParams;
			requestParams = {};
		} else {
			requestParams = _.extend({}, requestParams);
		}

		// if callback passed as second argument
		if (_.isFunction(additionalRequestOptions)) {
			cb = additionalRequestOptions;
			additionalRequestOptions = {};
		} else {
			additionalRequestOptions = _.extend({}, additionalRequestOptions);
		}

		requestBody = getRequestBody(requestOptions.uriSchema, requestParams);

		self._getBeforeTransformer(methodName)(requestParams, requestBody, additionalRequestOptions);

		var opts = {
			method: requestOptions.httpMethod,
			url: requestOptions.baseUrl + getUri(requestOptions, requestParams),
			json: true
		};

		if (requestOptions.headers) {
			opts.headers = requestOptions.headers;
		}

		if (additionalRequestOptions.headers) {
			opts.headers = _.extend({}, opts.headers, additionalRequestOptions.headers);
		}

		// Check on post/put/patch/delete methods
		if (['POST', 'PATCH', 'PUT', 'DELETE'].indexOf(opts.method) > -1) {
			opts.body = requestBody;
		}

		var resultPromise = self.request(opts).spread(function execResponseParser (res, body) {
			return self._getResponseParser(methodName)(res, body, requestParams);
		});

		if (_.isFunction(cb)) {
			resultPromise
				.then(applyCallback)
				.catch(cb);
		}

		return resultPromise;

		function applyCallback () {
			var args = Array.prototype.slice.apply(arguments);
			args.unshift(null);
			cb.apply(null, args);
		}
	};

	function getUri (requestOptions, params) {
		var uri = getPath(); 
		var query = getQuery();

		if (query) {
			return uri + '?' + query;
		}

		return uri;

		function getPath () {
			return _.template(requestOptions.uriSchema.path)(_.pick(params, requestOptions.uriSchema.pathParams));
		}

		function getQuery () {
			if (requestOptions.httpMethod === 'GET') {
				return stringifyQuery(_.extend(requestOptions.uriSchema.query, _.omit(params, requestOptions.uriSchema.pathParams)));
			}

			return stringifyQuery(_.extend(requestOptions.uriSchema.query, _.pick(params, requestOptions.uriSchema.queryParams)));

			function stringifyQuery (query) {
				return _.values(_.map(query, stringifyParam)).join('&');

				function stringifyParam (val, key) {
					return encodeURIComponent(key) + '=' + encodeURIComponent(val);
				}
			}
		}
	}

	function getRequestBody (uriSchema, params) {
		return _.omit(params, uriSchema.pathParams);
	}
};

ApiClient.prototype._getBeforeTransformer = function _getBeforeTransformer (methodName) {
	switch (true) {
		case _.isFunction(this.before):
			return this.before;
		case _.isObject(this.before) && _.isFunction(this.before[methodName]):
			return this.before[methodName];
		default:
			return returnSame;
	}

	function returnSame (params) {
		return params;
	}
};

ApiClient.prototype._getResponseParser = function _getResponseParser (methodName) {
	switch (true) {
		case _.isFunction(this.parse):
			return this.parse;
		case _.isObject(this.parse) && _.isFunction(this.parse[methodName]):
			return this.parse[methodName];
		default:
			return returnBody;
	}

	function returnBody (res, body) {
		if (_.inRange(res.statusCode, 200, 300) || _.inRange(res.statusCode, 400, 500)) {
			return body;
		}

		throw new Error('Server response status: ' + res.statusCode);
	}
};

ApiClient.prototype._getRequestOptions = function _getRequestOptions (config) {
	var configTokens = config.split(' ');

	if (configTokens.length != 2) {
		throw new Error('Invalid rest endpoint declaration - ' + config);
	}

	var requestOptions = {
		baseUrl: this.baseUrl,
		httpMethod: configTokens[0].toUpperCase(),
		uriSchema: parseUri(configTokens[1])
	};

	if (this.headers) {
		requestOptions.headers = this.headers;
	}

	return requestOptions;

	function parseUri (uri) {
		var uriTokens = uri.split('?');

		return {
			path: uriTokens[0],
			pathParams: extractParams(uriTokens[0]),
			query: uriTokens.length > 1 ? parseQuerString(uriTokens[1]) : {},
			queryParams: uriTokens.length > 1 ? extractParams(uriTokens[1]) : {}
		};

		function extractParams (path) {
			var matches = path.match(/{([\s\S]+?)}/g) || [];
			return matches.map(slice);

			function slice (param) {
				return param.slice(1, -1);
			}
		}
	}
};

module.exports = ApiClient;
