# traffic-replay
NodeJS middleware to record and playback web traffic

## Note To Users

This module is still under development.  We would love feedback and input, but things are by no means complete.

## Pre-Processors

These are standard Express middleware called from within express.  They should be written with that in mind.  Documentation on Express middleware [can be found here](http://expressjs.com/en/guide/using-middleware.html).

## Post Processors

These are synchronous functions that pass in the request object and the configured options.  These are defined in a config file.

If you prefer, you can provide a config file with the `-c` command line option.  This config file should use `module.exports` to provide an array of processor configurations.

Here is an example configuration:

```javascript
module.exports = {
    path: '/path/to/replay/file.txt', // path to the file to replay
    host: 'localhost', // the host to replay to
    port: '80', // the port to replay on
    mutate_session: true, // do we mutate the session? this re
    debug: true,
    processors: [
        require('third-party-processor'),
        require('../my/other/processor'),
        function(request) {
            // request is a passed reference you can transform \\
            // options are what is defined below \\
        },
        function(options) {
            // pass in options with a closure, then return the function
            return function(request) {
                // do work
            }
        }({some: 'options'});
    ]
};
```