'use strict';
var Server = require('tiny-lr');
var path = require('path');
var url = require('url');

var utils = module.exports;

var port = 35729;
var zlib = require("zlib");

utils.startLRServer = function startLRServer(grunt, done) {
  var _ = grunt.util._;
  var _server;

  var options = _.defaults(grunt.config('livereload') || {}, {
    port: 35729
  });

  _server = new Server();
  grunt.log.writeln('... Starting Livereload server on ' + options.port + ' ...');
  port = options.port;

  _server.listen(options.port, done);
  return _server;
};

utils.getSnippet = function () {
  /*jshint quotmark:false */
  var snippet = [
          "<!-- livereload snippet -->",
          "<script>document.write('<script src=\"http://'",
          " + (location.host || 'localhost').split(':')[0]",
          " + ':" + port + "/livereload.js?snipver=1\"><\\/script>')",
          "</script>",
          ""
          ].join('\n');
  return snippet;
};

//
// This function returns a connect middleware that will insert a snippet
// of JavaScript needed to connect to the livereload server
//
// Usage:
// First require the needed module
// var lrSnippet = require('livereload/lib/utils').livereloadSnippet;
//
// Then in your grunt-contrib-connect config:
//
// server: {
//   dist: {
//     middleware: function() {
//       return [lrSnippet, folderMount('dist')]
//     }
//   },
//   test: {
//     middleware: function() {
//       return [lrSnippet(grunt), folderMount('dist')]
//     }
//   }
// }
utils.livereloadSnippet = function livereloadSnippet(req, res, next) {
  var writeHead = res.writeHead;
  var end = res.end;
  var filepath = url.parse(req.url).pathname;
  var tmpBuffer = new Buffer(0);
  var extname;

  filepath = filepath.slice(-1) === '/' ? filepath + 'index.html' : filepath;

  extname = path.extname( filepath );

  if (extname !== '.html' && res.send === undefined && /\.[a-zA-Z1-9]*/.test( extname ) ) {
    return next();
  }
  res.push = function (chunk) {
    res.data = (res.data || '') + chunk;
  };


  var unzip = function( string, encoding, callback ){

    zlib.unzip( string, function( err, decodeString ){
 
      if( err ) callback( string, encoding );
 
      else callback( decodeString, encoding );
    }); 

  };


  var inject = function (string, encoding) {
    if (string !== undefined) {
      var body = string instanceof Buffer ? string.toString(encoding) : string;

      res.push(body.replace(/<\/body>/, function (w) {
        return utils.getSnippet() + w;
      }));
    }

  };

  // Bypass write until end
  res.write = function( string, encoding ){

    var buffer = string instanceof Buffer? string: new Buffer( string );

    tmpBuffer = Buffer.concat([ tmpBuffer, buffer ]);

    return true;
  };

  // Prevent headers from being finalized
  res.writeHead = function() {};

  var zip = function( encoding, buffer, callback ){

    if (encoding.match(/\bdeflate\b/)) zlib.deflate( buffer, callback );

    else if (encoding.match(/\bgzip\b/)) zlib.gzip( buffer, callback );

    else callback( null, buffer );

  };

  // Write everything at the end
  res.end = function (string, encoding) {

    if( string ) tmpBuffer = Buffer.concat([ tmpBuffer, string ]);

    //if content type is not html,it will return source.
    if( !/html/.test( res._headers["content-type"] ) ) return end.call( res, tmpBuffer, encoding );

    // Decompress a buffer
    unzip( tmpBuffer, encoding, function( string, encoding ){

      inject(string, encoding);

      // Restore writeHead
      res.writeHead = writeHead;

      if (res.data !== undefined ) {

        if( !res._headers ) res.setHeader('content-length', Buffer.byteLength( buffer ,encoding ));

        // Compress a buffer by proxy server.
        zip( res._headers['content-encoding'] || "", res.data, function( err, buffer ){

          end.call( res, buffer, encoding );

        });
      }
    });
  };

  next();
};
