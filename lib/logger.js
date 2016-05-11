'use strict';
var fs = require('fs');
/**

 logger.js

 Handles writing request data out to the configured log file for use in later replay

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

var write_queue = [];
var writing = false;

/**
 * Log the item to the specified file.
 * Record structure is:
 * <header json>\n
 * <body>\n
 *
 * Where <header json> contains information such as path, method, content_length and <body> is the POST or GET body
 * that is exactly content_length bytes long, followed by a newline. If content length is 0 bytes, there will be two newline
 * characters following the <header json>.
 * @param log_item
 * @param options
 */
function logger(log_item, options) {
    var body = log_item.body;
    delete log_item["body"];
    var header_json = JSON.stringify(log_item);
    header_json += "\n";

    write_queue.unshift(header_json);
    write_queue.unshift(body);
    write_queue.unshift("\n");
    
    write(options);
}

/**
 * Drain the write queue and flush to the file
 * @param options
 */
function write(options) {
    if(writing)
        return;
    if(!write_queue.length) {
        writing = false;
        return;
    }
    
    var item = write_queue.pop();
    fs.appendFile(options.path, item,
        function(err) {
            if(err) {
                console.log("Failed to write to file: " + options.path + " error: " + err);
                throw new Error(err);
            }
            write(options);
        });
}

module.exports = logger;