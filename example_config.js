module.exports = {
    path: '../traffic.json', // path to the file to replay
    host: 'localhost', // the host to replay to
    port: '3443', // the port to replay on
    mutate_session: true, // do we mutate the session? this re
    session_key: "healthelt_sid",
    debug: true,
    processors: [
        require('./processors/json_date_forwarding')({})
    ]
};
