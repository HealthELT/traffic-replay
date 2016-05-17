'use strict';
/**

    index.js
 
    Main entry point.
 
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
var fs = require('fs');

var argv = require('minimist')(
    process.argv.slice(2),
    {
        defaults: {
            filepath: '../application/uploads/traffic.json',
            host: 'localhost',
            port: 3000,
            mutate: true,
            sessionkey: "healthelt_sid",
            debug: true,
            config: '../application/config/traffic.js'
        },
        alias: {
            'f': 'filepath',
            'h': 'host',
            'p': 'port',
            'm': 'mutate',
            'k': 'sessionkey',
            'd': 'debug',
            'c': 'configfile',
            'w': 'fastforward', //advance n seconds into the replay file on start
            'v': 'validate' //parse the file and report errors, don't replay traffic
        }
    }
);

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
    
    // define our config
    var config;
    if(argv.configfile) { // config file location defined, require it
        config = require(argv.configfile);
    } else { // no file defined, make an empty config
        config = {};
    }
    
    var run_config = {
        path: config.path || argv.filepath, //'../application/uploads/traffic.json',
        host: config.host || argv.host, // 'localhost',
        port: config.port || argv.port, // 3000,
        mutate_session: config.mutate_session || argv.mutate, // true,
        session_key: config.session_key || argv.sessionkey, // "healthelt_sid",
        debug: config.debug || argv.debug, // set the debug flag
        processors: config.processors || [], // these fire on replay
        fastforward: config.fastforward || argv.fastforward || 0,
        validate: config.validate || argv.validate //only validate the file, don't replay it
    };
    
    if(config.debug) console.log("Operating with configuration: ", run_config);
    
    replay(run_config);
    
}

//if we were executed from the command line, kick off the replay logic
if (require.main === module)
    main();

module.exports = middleware;
