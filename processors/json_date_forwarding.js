module.exports = function(config) {
    var start_date = (new Date(config.start_date)).getTime();
    var date_rgx = /2[0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}\:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/g
    var quote_rgx = /"/g
    
    return function(request) {
        request.body.replace(date_rgx, function(match) {
            var match_timestamp = (new Date(match)).getTime();
            var diff = match_timestamp - start_date;
            var new_date = new Date(start_date + diff);
            
            return JSON.stringify(new_date).replace(quote_rgx, '');
        });
    }
}