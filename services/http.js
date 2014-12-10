/**
 * yesbee-http services/http
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
 * @author     Ganesha <reekoheek@gmail.com>
 * @copyright  2014 PT Sagara Xinix Solusitama
 */
var Q = require('q'),
    url = require('url'),
    http = require('http'),
    _ = require('lodash');

var logger, Exchange, Channel;

var HTTPWrapper = function(context, uri) {
    var that = this;

    var parsed = url.parse(uri);

    this.context = context;
    this.routes = {};

    this.protocol = parsed.protocol || 'http';
    this.hostname = parsed.hostname;
    this.port = parsed.port;
    this.sockets = [];
    this.id = this.protocol + '//' + this.hostname + ':' + this.port;

    this.callbackChannel = this.context.getChannelId(Channel.OUT, this);
    this.scopes = {};

    if (!this.port) {
        this.port = (this.protocol == 'http') ? 80 : 443;
    }

    // server change to httpServer
    this.server = http.createServer(function() {
        that.process.apply(that, arguments);
    });
};

HTTPWrapper.prototype = {
    normalizePath: function(pathname) {
        pathname = pathname.trim();

        if (pathname === '/') {
            return pathname;
        }

        return pathname.replace(/\/+$/, '');
    },

    route: function(pathname, handler) {
        pathname = this.normalizePath(pathname);
        this.routes[pathname] = handler;
        logger(this.context).info('add route %s on %s:%s', pathname, this.hostname, this.port);
    },

    deroute: function(pathname, handler) {
        pathname = this.normalizePath(pathname);
        var existingHandler = this.routes[pathname];

        if (existingHandler === handler) {
            delete this.routes[pathname];
        }
        logger(this.context).info('delete route %s on %s:%s', pathname, this.hostname, this.port);
    },

    listen: function() {
        var deferred = Q.defer(),
            that = this;

        this.server.listen(this.port, this.hostname, function() {
            logger(that.context).info('server listening on %s:%s', that.hostname, that.port);
            deferred.resolve();
        });

        var sockets = this.sockets = [];

        this.context.on(this.callbackChannel, function(exchange) {
            Q(that.callback(exchange))
                .fail(function(e) {
                    logger.e(e.message + "\n" + e.stack);
                });
        });

        this.server.on('connection', function (socket) {
            sockets.push(socket);
            socket.on('close', function () {
                sockets.splice(sockets.indexOf(socket), 1);
            });
        });

        return deferred.promise;
    },

    process: function(req, res) {

        var parsed = url.parse(req.url);
        var pathname = this.normalizePath(parsed.pathname);
        var handler = this.routes[pathname],
            handlerIndex = pathname;

        if (!handler) {
            handlerIndex = null;
            handler = _.find(this.routes, function(route, i) {
                if (pathname.substr(0, i.length) === i) {
                    handlerIndex = i;
                    return i;
                }
            });
        }

        if (!handler) {
            res.writeHead(404);
            res.end(pathname + ' NOT FOUND\n');
        } else {

            var exchange = new Exchange();

            exchange.header('http::server', this.hostname + ':' + this.port);
            exchange.header('http::handler', handlerIndex);
            exchange.header('http::version', req.httpVersion);
            exchange.header('http::request-method', req.method);
            exchange.header('http::request-url', req.url);
            exchange.header('http::query-string', parsed.query);
            exchange.header('http::translated-path', pathname);
            exchange.header('http::translated-uri', pathname.substr(handlerIndex.length === 1 ? 0 : handlerIndex.length));

            for (var key in req.headers) {
                exchange.header('http::'+key, req.headers[key]);
            }

            exchange.body = req;
            exchange.property('callback', this.callbackChannel);
            this.addScope(exchange, req, res);
            this.context.send(Channel.IN, handler, exchange, this);

        }
    },

    addScope: function(exchange, req, res) {
        this.scopes[exchange.id] = {
            request: req,
            response: res,
            exchange: exchange
        };
    },

    callback: function(exchange) {
        var scope = this.scopes[exchange.id];

        if (exchange.error) {
            if (exchange.error.statusCode) {
                scope.response.writeHead(exchange.error.statusCode);
            } else {
                scope.response.writeHead(500);
            }
            scope.response.end(JSON.stringify({error:exchange.error.message}));
        } else {
            if (exchange.body.pipe && typeof exchange.body.pipe === 'function') {
                exchange.body.pipe(scope.response);
            } else {

                if (exchange.body) {
                    var textBody;
                    if(typeof exchange.body === 'string') {
                        textBody = exchange.body;
                    } else {
                        textBody = JSON.stringify(exchange.body);
                    }
                    scope.response.write(textBody);
                }
                scope.response.end();
            }
        }
    },

    close: function(force) {
        var deferred = Q.defer(),
            that = this;
        try {
            this.server.close(function() {
                deferred.resolve();
                that.sockets = [];
            });

            if (force) {
                _.each(this.sockets, function(socket) {
                    socket.destroy();
                });
                that.sockets = [];
            }
        } catch(e) {
            deferred.reject(e);
        }

        return deferred.promise;
    }
};

module.exports = function(yesbee) {
    logger = yesbee.logger;
    Exchange = yesbee.Exchange;
    Channel = yesbee.Channel;

    // dependencies: [
    //     'http',
    // ],

    this.servers = {};

    this.get = function(uri) {
        var parsed = url.parse(uri);

        var s = this.servers[parsed.host];
        if (!s) {
            s = this.servers[parsed.host] = new HTTPWrapper(this, uri);
            s.listen();
        }

        return s;
    };

    this.attach = function(uri, component) {
        var parsed = url.parse(uri);
        this.get(uri).route(parsed.pathname, component);
    };

    this.detach = function(uri, component) {
        var parsed = url.parse(uri);
        this.get(uri).deroute(parsed.pathname, component);
    };

};