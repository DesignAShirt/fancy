"use strict";

require('http').globalAgent.maxSockets = require('https').globalAgent.maxSockets = 20;

var path = require('path');
var ncp = require('ncp').ncp;
var async = require('async');

ncp.stopOnError = true;

var utils = require('../shared/utils.js');
var log = require('../../utils/log.js');

// <RoutingRules>
//   <RoutingRule>
//   <Condition>
//     <KeyPrefixEquals>docs/</KeyPrefixEquals>
//   </Condition>
//   <Redirect>
//     <ReplaceKeyWith>documents/</ReplaceKeyWith>
//   </Redirect>
//   </RoutingRule>
// </RoutingRules>

module.exports = function(index, options, callback) {
  utils.prep(options, function(err) {
    var tasks;

    tasks = utils.eachObject(index, options, function(hashKey, entry, abs) {
      var diskUrl = Array.isArray(entry.url) ? entry.url[0] : entry.url;
      if (diskUrl[diskUrl.length - 1] === path.sep) { // ends in a slash
        diskUrl += 'index.html';
      }
      else if (!diskUrl.split('/').pop().split('?')[0].trim().length) { // querystring only name
        var parts = diskUrl.split('/');
        parts.pop(); // discard
        var partFilename = 'index.html';
        diskUrl = parts.join('/') + '/' + partFilename;
      }
      else {
        var parts = diskUrl.split('/');
        var partFilename = '.collision.' + parts.pop();
        diskUrl = parts.join('/') + '/' + partFilename;
      }
      // if (!/\.[\w\d_-]+$/.test(diskUrl)) { // don't add for urls with an extension
      //   diskUrl += '.' + options.ext;
      // }
      var source = path.join(options.destination, decodeURIComponent(diskUrl));
      log.debug({ key: hashKey, entry: entry, abs: abs, from: source, to: diskUrl }, 'creating copy task');
      return async.apply(utils.copy, abs, source);
    });

    Array.prototype.push.apply(tasks, utils.copyAllAssets(options));
    utils.build(tasks, options, callback);
  });
};
