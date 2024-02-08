### It's fork of [apiapi](https://github.com/boo1ean/apiapi)

### In this fork

- Updated all dependencies
- Added ESM version
- Added request limiter for Axios (**Default is 7 RPS**)
- Added `http-build-query` for build correct query params (e.g. now allow nested objects)
- Add query and body payload from field in params (set param as string, instead string[],see example below)

## Api client for lazy devs

Quickly write up any json api client for your purpose.

You can use both callbacks and promises for api client methods.

## Last update

Here is a partial of ApiClient options:
```json5
{
  methods: {
    posts: 'GET /posts/{userId}?limit={limit}',
    postsAdd: 'PUT /posts/{postId}',
  },
  query: {
    // posts: ['limit', 'userId'], // old solution work too
    posts: 'queryParams', // now you can set field for query params
    postsAdd: ['postId'],
  },
  body: {
    postsAdd: 'payload', // now you can set field for req body
  }
}
```

Make GET request:
```js
const payload = {
  userId: 1,
  limit: 5,
  queryParams: {
    offset: 3,
    filter: {
      id: [1,2]
    }
  }
}
const resp = await client.posts(payload)
// Will exec with url:
// 'https://.../posts/1?offset=3&filter%5Bid%5D%5B0%5D=1&filter%5Bid%5D%5B1%5D=2'
```

Now for POST/PUT/PATCH
```js
const putPayload = {
  postId: 3,
  payload: {
    id: 3,
    title: 'foo',
    body: 'bar',
    userId: 1,
  }
}
const resp = await client.postsAdd(putPayload)

// Will exec with:
const reqOpts = {
  method: 'PUT',
  url: 'https://jsonplaceholder.typicode.com/posts/3',
  responseType: 'json',
  headers: {},
  data: { id: 3, title: 'foo', body: 'bar', userId: 1 } } }
}
```
Now don't need to create any `transformRequest`, and set all payload fields by default lib behavior.

Enjoy =)

## Installation

```bash
npm install @1xtr/apiapi
```

## Import

```js
// ES5 example
const ApiClient = require('1xtr/apiapi')
// ES6+ example
import { ApiClient } from '1xtr/apiapi'
```

## Example usage

Sample api client for github

```js
const ApiClient = require('1xtr/apiapi')

const github = new ApiClient({
  baseUrl: 'https://api.github.com',
  // Set rate limit
  rateLimitOptions: { maxRPS: 7 },
  // Define api methods
  methods: {
    issues: 'get /repos/{user}/{repo}/issues',
  },

  // Github api requires proper user-agent to work
  headers: {
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.91 Safari/537.36',
  },
})

// will request https://api.github.com/repos/boo1ean/casual/issues?state=closed and return json data
github.issues({ user: 'boo1ean', repo: 'casual', state: 'closed' }).then(console.log)

// also you can use custom headers for each request
github
  .issues({ user: 'boo1ean', repo: 'casual', state: 'closed' }, { headers: { Authentication: 'token GITHUB-TOKEN' } })
  .then(console.log)
```

Call methods passing callbacks

```javascript
// Call method with params
github.issues({ user: 'boo1ean', repo: 'casual', state: 'closed' }, function (err, result) {
  // process result
})

// Call method without params
github.issues(function (err, result) {
  // process result
})
```

## Transform response

You can specify response transform function:

```js
// Will transform all methods responses (global transform)
new ApiClient({
  // ...
  transformResponse: function transformResponse(res, body, requestParams) {
    // res - request's response object
    // body = response body
    // requestParams = object passed to called method
  },
})

// transform response of specific method
new ApiClient({
  // ...
  methods: {
    issues: 'get /issues',
  },
  transformResponse: {
    issues: function parseIssues(res, body, requestParams) {
      return body.slice(0, 5)
    },
  },
})
```

## Transform request

You can decorate request params and headers with `transformRequest` hooks.

```javascript
// params - object passed to method
// requestBody - object which will be used as request body
// opts - additional request options (e.g. headers)
var client = new ApiClient({
  transformRequest: function transformRequest(params, requestBody, opts) {
    // You should return overrides for given objects
    opts.headers = { 'x-some-header': 'header-value' }
    return [params, requestBody, opts]
  },
})
```

Also you can perform method-specific `transformRequest` hook:

```javascript
new ApiClient({
  transformRequest: {
    issues: function transformParams(params) {
      // ...
    },
  },
})
```

If you want to create async request transformer, just return a promise

```javascript
new ApiClient({
	transformRequest: {
		issues: function transformParams (params) {
			return new Promise(...);
		}
	}
});
```

## Pick specific params for query string

```javascript
var client = new ApiClient({
  methods: {
    issues: 'get /repos/{user}/{repo}/issues',
  },

  query: {
    // Will pick only these params for issues method and omit all others
    issues: ['state'],
  },
})

// will request https://api.github.com/repos/boo1ean/casual/issues?state=closed
client.issues({ custom: 'custom param', user: 'boo1ean', repo: 'casual', state: 'closed' })
```

## Pick specific params for request body

```javascript
var client = new ApiClient({
  methods: {
    createSomething: 'post /something',
  },

  body: {
    // Only title will be picked from method params and passed to request body
    createSomething: ['title'],
  },
})
```

## Response type

By default response type is `json` but you can change it if you want to one of `arraybuffer`, `blob`, `document`, `json`, `text`.

```javascript
new ApiClient({
  // ...
  responseType: 'text',
})
```

## Set error handler

Global error handler

```javascript
var client = new ApiClient({
  errorHandler: function errorHandler(result) {
    console.log('API error response status code %s', result.status)
  },
})
```

method-specific error handlers:

```javascript
var client = new ApiClient({
  errorHandler: {
    getIssues: function handleGetIssuesError(res) {
      console.log('Get issues error response status code %s', result.status)
    },
  },
})
```

## Params validation

You can declare list of required params for methods

```javascript
var client = new ApiClient({
	methods: {
		createIssue: 'post /issues'
	},

	required: {
		createIssue: ['name', 'body', 'author_id']
	}
});

// Automatically asserts params object for having required attrs
client.createIssue({...});
```

## Raw response body

By default response body is expected to be json and will be automatically parsed, to get raw body use flag:

```javascript
var client = new ApiClient({
  // ...
  rawResponse: true,
})
```

## Debug

To see debug output just run you script like this:

```
DEBUG=apiapi node script.js
```

Debug output is provided by [debug](https://github.com/visionmedia/debug)

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT
