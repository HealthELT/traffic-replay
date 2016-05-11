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

 Original work Copyright (c) 2016 Health: ELT, LLC

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
    
    var defaults = {
        port: 80, //the port to talk to on the destination server
        queue_size: 20, //the default size of the replay queue, increase or decrease this based on how fast the 
                        //machine CPU and network speed are.
        start_time: new Date().getTime() //the time, in ms, for when the replay should start
    };
    
    assigned_options = Object.assign(defaults,options);
    
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
        if(line == "eof")
            return console.log("Replay complete");
        var request = JSON.parse(line);
        var content_length = request.content_length;
        if(content_length > 0) {
            var body = new Buffer(content_length);//Buffer.alloc(content_length);
            fs.readSync(replay_file_fd, body, 0, content_length);
            request.body = body;
        }
        read_line(); //advance the fp past the trailing \n
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
    if(!script_start_time >= assigned_options.start_time)
        return setTimeout(drain_queue,1);
    
    var time_delta = new Date().getTime() - script_start_time;
    
    //peek at the last item in the queue and see when it's supposed to be replayed.
    var request_info = replay_queue[replay_queue.length - 1];
    if(time_delta < request_info.time_delta)
        //not showtime yet, wait a bit
        return setTimeout(drain_queue,1);

    replay_queue.pop(); //clear it off the queue

    //construct the request
    var request;
    var options = {
        host: assigned_options.host,
        port: assigned_options.port,
        path: request_info.url,
        method: request_info.method,
        headers: request_info.headers

    };
    //create a proper request based on the protocol, http or https
    if(request_info.protocol == "https")
        http = https;
    console.log("playing back request: " + request_info.method + " " + request_info.path);
    request = http.request(options,
        function(response) {
            console.log('statusCode: ', response.statusCode);
            console.log('headers: ', response.headers);

            response.on('data', function(data) {
                console.log(data.toString('utf8'));
            });
        }
    );
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

module.exports = start;
