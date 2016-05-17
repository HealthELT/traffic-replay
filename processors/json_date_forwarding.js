/**
 * json_date_forwarding.js
 * 
 * This is an example processor file that looks in the body of all requests and modifies any dates it finds to be
 * a relative offset from the start time of the playback.
 * 
 * The way it works is that it determines the date/time of the first request in the playback file. It then subtracts
 * this from the found date in order to get a time offset. This time offset is added to the date/time that the replay 
 * was started in order to simulate a relative time to the start of the script.
 * 
 */
module.exports = function(options) {
    var original_start_ticks;
    var replay_start_ticks = (new Date()).getTime();
    var date_rgx = /2[0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}\:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/g
    var quote_rgx = /"/g
    var first_request = true;
    
    return function(request) {
        //if this is the first request, use it as the original script start time
        if(first_request) {
            first_request = false;
            original_start_ticks = request.timestamp;
        }
        
        if(!request.body)
            return;
        
        var body_string = request.body.toString('utf8');
        
        body_string = body_string.replace(date_rgx, function(match) {
            var match_timestamp = (new Date(match)).getTime();
            var offset = match_timestamp - original_start_ticks;
            var new_date = new Date(replay_start_ticks + offset);
            
            return JSON.stringify(new_date).replace(quote_rgx, '');
        });

        request.body = new Buffer(body_string,'utf8'); //Buffer.from(body_string,'utf8');
    }
}