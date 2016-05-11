'use strict';
/**

    index.js
 
    Main entry point.
 
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


/**
 * Express middleware implementation. This will be returned from the config express when require('traffic-replay') is used.
 * @param req
 * @param res
 * @param next
 */
function middleware(user_options) {
    if(!user_options.path)
        throw new Error("Missing path option")
    
    //some sensable default options
    var defaults = {
        include_headers: true, //should we log and replay http headers?
        include_body: true, //should we log and replay request body?
        include_query: true, //should we include the query part of the request in the log and replay?
        processors: [] //a set of functions that can process and/change the request data. 
    };
    
    var assigned_options  = Object.assign(defaults, user_options);
    var concat_stream = require('concat-stream');
    var logger = require('./lib/logger');
    var start_time = new Date().getTime();
    
    /*
    Closure that provides access to the passed in options. This is the actual middleware function that executes.
     */
    return function(req, res, next) {
        var options = assigned_options; //bring options into local scope for overzealous performance optimization :D
        var log_item = {}; //this is the object that will be serialized for the request
        
        //gather the info we want for the log item
        log_item.method = req.method;
        log_item.headers = req.headers;
        log_item.path = req.originalUrl;
        log_item.protocol = req.protocol;
        log_item.timestamp = new Date().getTime();
        log_item.time_delta = log_item.timestamp - start_time;
        
        //read the rest of the req into a raw buffer for the body
        req.pipe(concat_stream(
            function(raw_body) {
                log_item.body = raw_body;
                log_item.content_length = raw_body.length;
                
                //give a chance for any processors to modify it
                options.processors.forEach(function(processor) {processor(log_item);});

                //let the logger store it
                logger(log_item, options);
            }
        ));
        next();
    }
}

/**
 * Entry point for command-line execution
 */
function main() {
    var replay = require('./lib/replay');
    replay(
        {
            path: '../application/uploads/traffic.json',
            host: 'localhost',
            port: 3000
        }
    )
    
}

//if we were executed from the command line, kick off the replay logic
if (require.main === module)
    main();

module.exports = middleware;