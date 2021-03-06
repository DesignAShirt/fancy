"use strict";

var path = require('path');
var fs = require('fs');

var log = require('../utils/log.js');

var buildNode = require('./build-node/build-node.js');
var buildS3 = require('./build-s3/build-s3.js');

module.exports = {
  start: function(compileDestination, target, callback) {
    var options = {
      output: './dist',
      target: target,
    };

    var cwd = process.cwd();

    var source = path.join(cwd, compileDestination);
    var buildDestination = path.join(cwd, './.fancy/build');
    var destination = path.join(buildDestination, '/');
    var dist = path.join(cwd, options.output);
    var sourceAssets = path.join(source, 'assets');
    var destinationAssets = path.join(destination, '/');
    var indexPath = path.join(source, 'index.json');
    var ext = 'html';
    var index;

    log.debug('initializing build', {
      source: source,
      buildDestination: buildDestination,
      destination: destination,
      dist: dist,
      sourceAssets: sourceAssets,
      destinationAssets: destinationAssets,
      indexPath: indexPath,
      ext: ext,
    });

    // TODO: if config.build.destination isn't "/", then all hrefs have to be rewritten

    if (!fs.existsSync(indexPath))
      throw new Error('No index.json file exists.  Please run compile first');

    index = require(indexPath);

    var builder;
    switch (options.target) {
      case 'node':
        builder = buildNode;
      break;
      case 's3':
        // TODO: copy generic error to error.html
        builder = buildS3;
      break;
      default:
        throw new Error('Invalid target: ' + options.target);
    }

    builder(index, {
      source: source,
      buildDestination: buildDestination,
      destination: destination,
      dist: dist,
      sourceAssets: sourceAssets,
      destinationAssets: destinationAssets,
      indexPath: indexPath,
      ext: ext,
    }, callback);
  }
};
