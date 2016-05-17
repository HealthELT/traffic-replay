'use strict';
//var Buffer = require('buffer');
var http = require('http');
var https = require('http');
var process = require('process');
var fs = require('fs');

/**

 replay.js

 Handles replaying web requests from a previously saved session

 For documentation, view full README.md

 @author Clayton Gulick
 @email clay.gulick@healthelt.com
 @email claytongulick@gmail.com

 Copyright (c) 2016 Health: ELT, LLC

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 **/

//this is the queue of requests that will be made to the server
var replay_queue = [];
var assigned_options = {};
var replay_file_fd;
var script_start_time;
var session_tracker = {};
var processors;
var validate = false;
var line_count = 0;
var fastforward = 0;
var request_id = 1;

/**
 * Start the replay of the stored requests. 
 * Options:
 * path: String path is required and is the path to the saved request file.
 * host: String the host is required, it is the host that the requests will be replayed to
 * @param options
 */
function start(options) {
    if(!options.path)
        throw new Error("Missing path to replay file");
    if(!options.host)
        throw new Error("Missing host to replay to");
    
    validate = options.validate;
    
    processors = options.processors || [];
    
    var defaults = {
        port: 80, //the port to talk to on the destination server
        queue_size: 20, //the default size of the replay queue, increase or decrease this based on how fast the 
                        //machine CPU and network speed are.
        start_time: new Date().getTime(), //the time, in ms, for when the replay should start
        mutate_session: false, //indicates whether the replay should mutate the session to track newly issued sessions
                              //against the original session
        session_key: "sid" //if mutate_session is true, this is the cookie name that the session is tracked in
    };
    
    assigned_options = Object.assign(defaults,options);
    fastforward = parseInt(assigned_options.fastforward) * 1000;
    
    script_start_time = new Date().getTime();
    
    //open the file we're going to use for replay and keep a descriptor for later reading
    replay_file_fd = fs.open(assigned_options.path,'r',
        function(err, fd) {
            if(err)
                throw err;
            replay_file_fd = fd;
            
            //kick off reading and sending
            fill_queue();
            drain_queue();
        }
    );
}

/**
 * Monitor the queue length and ensure that it stays filled with requests to send out
 */
function fill_queue() {
    //read a line from the file. note: we're using synchronous reads here because this is a command line utility
    //and blocking is just fine
    function read_line() {
        var line = "";
        var char = new Buffer(1);//Buffer.alloc(1);
        var bytes_read=0;
        while(true) {
            bytes_read = fs.readSync(replay_file_fd, char, 0, 1);
            if(bytes_read==0)
                return "eof";
            if (char.toString('utf8') == "\n")
                return line;
            line += char;
        }
    }
    
    while(true) {
        //if the queue is flooded, wait 1ms and try again
        if (replay_queue.length >= assigned_options.queue_size)
            return setTimeout(fill_queue, 1);

        var line = read_line();
        line_count++;
        if(line == "eof") {
            console.log("Replay complete");
            process.exit(0);
        }
        var request;
        try {
            request = JSON.parse(line);
        }
        catch (err) {
            console.error("Error parsing JSON on line: " + line_count + " - " + err);
        }
        
        request.line_number = line_count;
        
        var content_length = request.content_length;
        if(content_length > 0) {
            var body = new Buffer(content_length);//Buffer.alloc(content_length);
            fs.readSync(replay_file_fd, body, 0, content_length);
            request.body = body;
        }
        var tail = read_line(); //advance the fp past the trailing \n
        if(tail) { //this should be blank
            console.error("Found trailing characters after parsing body on line: " + line_count);
        }
        line_count++;
            
        
        //give any passed in processors the opportunity to mutate the request
        if(processors.length)
            processors.forEach(
                function(processor) {
                    processor(request);
                }
            );
            
        replay_queue.unshift(request);
    }
    
    setTimeout(fill_queue,1);
    
}

/**
 * Pop items from the queue and send them when they are due based on the time delta
 * @param options
 */
function drain_queue() {
    //if there's nothing to do, wait one ms and try again
    if(!replay_queue.length)
        return setTimeout(drain_queue,1);
    
    //maybe we're not supposed to do anything yet...
    if((!script_start_time >= assigned_options.start_time)
        && !validate) //if we're validating, proceed regardless
        return setTimeout(drain_queue,1);
    
    var time_delta = new Date().getTime() - script_start_time + fastforward;
    
    //peek at the last item in the queue and see when it's supposed to be replayed.
    var request_info = replay_queue[replay_queue.length - 1];
    if((time_delta < request_info.time_delta)
        && !validate) //if we're validating, proceed regardless
        //not showtime yet, wait a bit
        return setTimeout(drain_queue,1);

    replay_queue.pop(); //clear it off the queue
    
    if(request_info.time_delta < fastforward) {
        if(debug)
            console.log("fast forwarding past request: \n" + request_info. method + request_info.path);
        //we're fastforwarding, skip this one
        return setTimeout(drain_queue,1);
    }
    
    //if we're validating only, just keep draining the queue
    if(validate)
        return process.nextTick(drain_queue);

    //construct the request
    var request;
    var options = {
        host: assigned_options.host,
        port: assigned_options.port,
        path: request_info.path,
        method: request_info.method,
        headers: request_info.headers

    };
    
    //intercept and rewrite the session, if requested
    if(assigned_options.mutate_session)
        mutate_session(request_info.headers, options);
    
    //create a proper request based on the protocol, http or https
    if(request_info.protocol == "https")
        http = https;
    console.log("playing back request " + request_id + ": " + request_info.method + " " + request_info.path);
    if(assigned_options.debug) 
        console.log("request headers: " + JSON.stringify(options.headers,null,2));

    request = http.request(options,
        //closure around the request id
        (function (request_id) {
            return function (response) {
                if (assigned_options.debug)
                    console.log('response ' + request_id + ': statusCode: ', response.statusCode, "response headers: ", response.headers);
                if (assigned_options.mutate_session)
                    capture_session(request_info.headers, response.headers);

                response.on('data', function (data) {
                    if (assigned_options.debug)
                        if (
                            (response.headers['content-encoding'] != 'gzip') &&
                            (response.headers['content-type'].indexOf('application/json') >= 0) ||
                            (response.headers['content-type'].indexOf('text/html') >= 0) ||
                            (response.headers['content-type'].indexOf('text/plain') >= 0)
                        )
                            console.log(data.toString('utf8'));
                });
            }
        })(request_id)
    );
    request.on("error",
        //closure around the request id and request
        (function(request_id, request_info) {
            return function(err) {
                console.error("Error in request " + request_id + ", line: " + request_info.line_number + " - " + err);
            }
        })(request_id, request_info)
    );
    
    request_id++;
    
    if(request_info.body)
        request.write(request_info.body,function() {
            request.end();
            process.nextTick(drain_queue);
        });
    else {
        request.end();
        process.nextTick(drain_queue);
    }
}

/**
 * This alters the outgoing request to substitute a current session id for the original one.
 * @param original_headers
 * @param request_options
 */
function mutate_session(original_headers, request_options) {
    var cookies = original_headers.cookie;
    if(!cookies) return;
    
    var original_session_id = get_cookie_value(cookies, assigned_options.session_key);
    if(!original_session_id)
        return;
    
    var replacement_session_id = session_tracker[original_session_id];

    //if we're not tracking a replacement sid for this session, bail
    if(!replacement_session_id)
        return;
    

    if(assigned_options.debug)
        console.log("Rewriting session id: " + original_session_id + " with " + replacement_session_id);
    //overwrite the original session with the new one
    cookies = cookies.replace(original_session_id, replacement_session_id);
    request_options.headers.cookie = cookies;
}

/**
 * This captures the new session id and associates it with the original session id from the original request
 * @param original_headers
 * @param response_headers
 */
function capture_session(original_headers, response_headers) {
    var original_session_id = get_cookie_value(original_headers.cookie, assigned_options.session_key);
    var new_session_id = "";
    var response_cookies = response_headers['set-cookie'];
    if(!response_cookies) return;
    
    for(var i=0; i<response_cookies.length; i++) {
        if(!response_cookies[i]) continue;
        new_session_id = get_cookie_value(response_cookies[i], assigned_options.session_key);
        if(new_session_id) {
            if(assigned_options.debug)
                console.log("Intercepted new session id:" + new_session_id + " for " + original_session_id);
            session_tracker[original_session_id] = new_session_id;
            return;
        }
    }
}

/**
 * Parse the cookie to retrieve the value for the specified key
 * @param cookie
 * @param key
 */
function get_cookie_value(cookie_string, key) {
    if(!cookie_string) return;
    var cookies_array = cookie_string.split(";");
    for(var i=0; i<cookies_array.length; i++) {
        var cookie = cookies_array[i].trim();
        if (cookie.indexOf("=") < 0) continue;
        var key_value = cookie.split("=");
        key_value[0] = key_value[0].trim();
        key_value[1] = key_value[1].trim();
        //make sure we're dealing with the correct cookie
        if (key_value[0] != key)
            continue;
        return key_value[1];
    }

}

module.exports = start;
