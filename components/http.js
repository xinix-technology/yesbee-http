/**
 * yesbee-http components/http
 *
 * MIT LICENSE
 *
 * Copyright (c) 2014 PT Sagara Xinix Solusitama - Xinix Technology
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * @author     Farid Hidayat <e.faridhidayat@gmail.com>
 * @copyright  2014 PT Sagara Xinix Solusitama
 */
var Q = require('q'),
    _ = require('lodash'),
    qs = require('querystring'),
    request = require('request');

module.exports = {
    // options: {exchangePattern: 'inOut'},

    getHttpService: function() {
        var httpService = this.context.getService('http');
        if (!httpService) {
            throw new Error('Service "http" is not running');
        }

        return httpService;
    },

    start: function() {
        if (this.type === 'source') {
            // if(this.options.proxyAuthHost) this.uri = this.options.proxyAuthHost + ((this.options.proxyAuthPort) ? ':'+this.options.proxyAuthPort : '');
            this.options = _.defaults(this.options || {}, {exchangePattern: 'inOut'});
            this.getHttpService().attach(this.uri, this);
        }
        this.constructor.prototype.start.apply(this, arguments);
    },

    stop: function() {
        if (this.type === 'source') {
            // var uri = this.uri.substr(this.uri.indexOf(':') + 1);
            this.getHttpService().detach(this.uri, this);
        }
        this.constructor.prototype.stop.apply(this, arguments);
    },

    process: function(exchange) {

        if (this.type === 'source') {
            return exchange;
        } else {

            var deferred = Q.defer();

            if (this.options.proxy) {
                if (exchange.body.pipe) {
                    var headers = {};
                    for(var i in exchange.headers) {
                        if (i.indexOf('http::') === 0) {
                            var header = exchange.headers[i];
                            headers[i.substr(6)] = header;
                        }
                    }

                    var outboundRequest = request({
                        method: exchange.header('http::request-method'),
                        uri: this.uri + exchange.header('http::translated-uri'),
                        qs: qs.parse(exchange.header('http::query-string')),
                        headers: headers,
                    });
                    var resp = exchange.body.pipe(outboundRequest);
                    exchange.body = resp;
                    deferred.resolve(exchange);
                } else {
                    throw new Error('Unimplemented yet!');
                }

            } else {

                if(exchange.headers['http::request-method'] == 'GET') {


                    request(this.uri + exchange.headers['http::translated-uri'], function(err, res, body) {

                        if (!err && res.statusCode == 200) {
                            exchange.body = body;
                        } else {
                            exchange.error = new Error('HTTP error!');
                            exchange.error.statusCode = res.statusCode;
                        }
                        deferred.resolve(exchange);
                    });

                } else {

                    var _data = {};

                    if(typeof exchange.body == "object") _data = exchange.body;

                    request({
                        method: exchange.headers['http::request-method'],
                        // uri: this.uri + exchange.headers['http::translated-uri'],
                        uri: this.uri,
                        form: _data
                    }, function(err, res, body) {

                        if (!err && res.statusCode == 200) {
                             console.log(body);
                            exchange.body = body;
                        } else {
                            exchange.error = new Error('HTTP error!');
                            exchange.error.statusCode = res.statusCode;
                        }
                        deferred.resolve(exchange);
                    });
                }
            }
            return deferred.promise;
        }
    }
};