var Q = require('q');
module.exports = function() {
    this.from('http-inbound:http://localhost:3000?exchangePattern=inOnly')
        .to('http://www.mcoin.co.id/')
        .to(function(exchange) {
            var deferred = Q.defer();
            // setTimeout(function() {
                // exchange.body = 'hello' + exchange.body;
                // exchange.error = new Error('Woaaahhh');
                deferred.resolve(exchange);
            // }, 1000);
            return deferred.promise;
        });

    // this.from('http-inbound:http://localhost:4000')
    //     .to('http://localhost')
    //     .to(function(exchange) {
    //         console.log(exchange.body);
    //         // exchange.body = exchange.body.match(/<meta.*/g).join(' ').replace(/</g, '&lt;').replace(/>/g, '&gt;') + 'xxx';

    //         return exchange;
    //     });

    // this.from('direct:in')

    this.trace = true;

    // setTimeout(function() {
    //     var request = require('request');
    //     request.get('http://localhost:3000', function(err, res, body) {
    //         if (err) {
    //             console.error('error', err);
    //             return;
    //         }
    //         console.log('------------------------------\nError: ' + err + ' Status: ' + res.statusCode + '\n' + body.substr(0, 100).trim() + '\n------------------------------');
    //         clearTimeout(t);
    //     });
    //     var t = setTimeout(function() {
    //         console.log('not done yet');
    //     }, 500);
    //     console.log('xxxxxxxxxx');
    // },100);

    // setImmediate(function() {
    //     template.send('direct:in', 'one');
    //     // template.send('direct:in', 'two');
    //     // template.send('direct:in', 'three');
    // });
};