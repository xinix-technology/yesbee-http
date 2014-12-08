var Q = require('q');
module.exports = function() {
    this.from('http://localhost:3000?exchangePattern=inOut')
        .to(function(exchange) {
            exchange.body = 'Hello world!';
        });

    this.from('http://localhost:4000?exchangePattern=inOut')
        .to(function(exchange) {
            var deferred = Q.defer();
            setTimeout(function() {
                exchange.body = 'Hello world from deferred object';
                deferred.resolve(exchange);
            }, 1000);
            return deferred.promise;

        });

    this.trace = true;
};