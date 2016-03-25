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
    request = require('request'),
    url = require('url'),
    http = require('http');

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
                            var key = i.substr(6);
                            if (key === 'server' || key === 'host') {
                                continue;
                            }
                            headers[key] = header;
                        }
                    }

                   
                    var parsed = url.parse(this.uri);

                    if (exchange.body.pipe && typeof exchange.body.pipe === 'function') {

                        var options = {
                            hostname: parsed.host,
                            port: parsed.port,
                            path: parsed.path + exchange.header('http::translated-uri'),
                            headers: headers,
                            method: exchange.header('http::request-method'),
                            timeout: this.options.timeout
                        };
                        var req = http.request(options);
                        var that = this;

                        req.on('response', function(resp) {
                            for(var i in resp.headers) {
                                exchange.header('http::' + i, resp.headers[i]);
                            }
                            exchange.header('http::status-code', resp.statusCode);
                            deferred.resolve(resp);
                        });

                        req.on('socket', function(socket) {
                                socket.setTimeout(that.options.timeout);  
                                socket.on('timeout', function() {
                                        req.abort();
                                });

                        });

                        req.on('error', function(err) {
                            console.log('problem with request: ' + err.message);
                            console.log('testing');
                            exchange.error = err;
                            if (err.code === "ECONNRESET") {
                                exchange.body = "Timeout occurs";
                                
                            }
                            deferred.resolve(exchange);
                        });

                        exchange.body.pipe(req);

                    } else {

                        // TODO: implement native nodejs http

                        var outboundRequest = request({
                                            method: exchange.header('http::request-method'),
                                            uri: this.uri + exchange.header('http::translated-uri'),
                                            qs: qs.parse(exchange.header('http::query-string')),
                                            headers: headers,
                                            timeout: this.options.timeout
                                        });


                        outboundRequest.on('response', function(resp) {
                            exchange.body = resp;
                            deferred.resolve(exchange);
                        });

                        outboundRequest.on('error', function(e) {
                            console.log('ERROR ....');
                            exchange.error = e;
                            // FIXME change this to use deferred.reject for error handling
                            // instead of using deferred.resolve, for better clarity
                            deferred.resolve(exchange);
                        });

                        var body = exchange.body;
                        if (body) {
                            if (typeof body !== 'string') {
                                body = JSON.stringify(body);
                            }
                            outboundRequest.write(body);
                        }
                        outboundRequest.end();
                    }
                } else {
                    throw new Error('Unimplemented yet!');
                }

            } else {
                    var headers = {};
                    
                    if (!exchange.body.pipe){
                        
                        var data = exchange.body
                        if (typeof data !== 'string') {
                                data = JSON.stringify(data);
                        }
                        headers['content-length'] = data.length;
                        // headers['yesbee-allowed'] = exchange.headers['http::yesbee-allowed'];
                    }

                    var _data = {};

                    if(typeof exchange.body == "object") _data = exchange.body;

                    var outboundRequest = request({
                        method: exchange.headers['http::request-method'],
                        uri: this.uri,
                        headers : headers,
                        timeout : this.options.timeout
                    }, function(err, res, body) {
                        console.log(body);
                        exchange.body = body;

                        if(err){
                            exchange.error = err
                        }else{
                            
                            for(var i in res.headers) {
                                exchange.header('http::' + i, res.headers[i]);
                            }
                        }
                        deferred.resolve(exchange);
                    });

                    if (exchange.body.pipe && typeof exchange.body.pipe === 'function') {
                        exchange.body.pipe(outboundRequest);
                    } else {
                        var body = exchange.body;
                        if (body) {
                            if (typeof body !== 'string') {
                                body = JSON.stringify(body);
                            }
                            outboundRequest.write(body);
                        }
                        outboundRequest.end();
                    }
                // }
            }
            return deferred.promise;
        }
    }
};