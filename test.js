require('should');
var sinon = require('sinon');
var ApiClient = require('./');
var Promise = require('bluebird');

describe('ApiClient', function () {
	var response = { statusCode: 200 };

	var client = new ApiClient({
		baseUrl: 'http://example.com',
		methods: {
			test1: 'get /test1/{param1}/stuff/{param2}',
			test2: 'post /test2/{param}',
			test3: 'post /test3/haha',
			test4: 'get /test4'
		},
		parse: {
			test3: function (res, body) {
				res.should.be.equal(response);
				body.should.be.equal('body');

				return 'parsed body';
			}
		}
	});

	it('Should make get request to correct url', function (done) {
		var expectedOpts = {
			method: 'GET',
			url: 'http://example.com/test1/1/stuff/2'
		};

		client.request = function (opts) {
			opts.should.eql(expectedOpts);
			done();
			return { spread: function () {} }
		}

		client.test1({ param1: 1, param2: 2 });
	});

	it('It should prepare proper query string', function (done) {
		var expectedOpts = {
			method: 'GET',
			url: 'http://example.com/test1/1/stuff/2?k=v&t=b'
		};

		client.request = function (opts) {
			opts.should.eql(expectedOpts);
			done();
			return { spread: function () {} }
		}

		client.test1({ param1: 1, param2: 2, k: 'v', t: 'b' });
	});

	it('It should prepare proper post request options', function (done) {
		var expectedOpts = {
			method: 'POST',
			json: true,
			url: 'http://example.com/test2/value',
			body: { a: 1, b: 2 }
		};

		client.request = function (opts) {
			opts.should.eql(expectedOpts);
			done();
			return { spread: function () {} }
		}

		client.test2({ param: 'value', a: 1, b: 2 });
	});

	it('Should return response body by default', function (done) {
		client.request = function () {
			return Promise.resolve([response, 'body']);
		}

		client.test2({ param: 1 }).then(function (body) {
			body.should.be.equal('body');
			done();
		});
	});

	it('It should parse response data', function (done) {
		var expectedOpts = {
			method: 'POST',
			json: true,
			url: 'http://example.com/test3/haha',
			body: { to_parse: 42 }
		}

		client.request = function (opts) {
			opts.should.eql(expectedOpts);
			return Promise.resolve([response, 'body']);
		}

		client.test3({ to_parse: 42 }).then(function (result) {
			result.should.be.equal('parsed body');
			done();
		});
	});

	it('Should use global parse function', function (done) {
		var client = new ApiClient({
			baseUrl: 'http://example.com',
			methods: { m1: 'get /', m2: 'post /' },
			parse: function (res, body) {
				res.should.be.equal(response);
				body.should.be.equal('body');

				return 'result';
			}
		});

		client.request = function () {
			return Promise.resolve([response, 'body']);
		}

		Promise.all([client.m1(), client.m2()]).spread(function (r1, r2) {
			r1.should.be.equal('result');
			r2.should.be.equal('result');
			done();
		});
	});

	it('Should throw error on non-200 status code', function (done) {
		var client = new ApiClient({
			baseUrl: 'http://example.com',
			methods: { m1: 'get /' }
		});

		client.request = function () {
			return Promise.resolve([{ statusCode: 500 }, 'body']);
		}

		client.m1().catch(function () {
			done();
		});
	});

	it('Should call before method before request', function (done) {
		var client = new ApiClient({
			baseUrl: 'http://example.com',
			methods: { m1: 'get /' },
			before: {
				m1: function (params) {
					return { a: 'b' };
				}
			},
		});

		client.request = function (opts) {
			opts.url.should.be.equal('http://example.com/?a=b');
			done();
			return Promise.resolve([{ statusCode: 200 }, 'body']);
		};

		client.m1({ c: 1 });
	});

	it('Should call before method before request global', function (done) {
		var client = new ApiClient({
			baseUrl: 'http://example.com',
			methods: { m1: 'get /', m2: 'get /' },
			before: function (params) {
				return { a: 'b' };
			}
		});

		client.request = function (opts) {
			opts.url.should.be.equal('http://example.com/?a=b');
			return Promise.resolve([{ statusCode: 200 }, 'body']);
		};

		client.m1({ c: 1 });
		client.m2({ c: 1 });

		done();
	});

	it('Should handle params in query string for non-get methods', function (done) {
		var client = new ApiClient({
			baseUrl: 'http://example.com',
			methods: { m1: 'post /{p1}/{p2}?p3={p3}&p4={p4}'}
		});

		client.request = function (opts) {
			opts.url.should.be.equal('http://example.com/a/b?p3=c&p4=d');
			return Promise.resolve([{ statusCode: 200 }, 'body']);
		};

		client.m1({
			p1: 'a',
			p2: 'b',
			p3: 'c',
			p4: 'd'
		});

		done();
	});

	it('Should ignore placeholders in query string if no params passed', function (done) {
		var client = new ApiClient({
			baseUrl: 'http://example.com',
			methods: { m1: 'post /{p1}/{p2}?p3={p3}&p4={p4}'}
		});

		client.request = function (opts) {
			opts.url.should.be.equal('http://example.com/a/b?p3=%7Bp3%7D&p4=%7Bp4%7D');
			return Promise.resolve([{ statusCode: 200 }, 'body']);
		};

		client.m1({
			p1: 'a',
			p2: 'b'
		});

		done();
	});
});
