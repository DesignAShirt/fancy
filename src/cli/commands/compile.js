"use strict";

var fs = require('fs');
var rimraf = require('rimraf');

var Compile = require('../../compile/index.js');
var Build = require('../../compile/build.js');
var help = require('../../utils/help');

var site = require('../lib/site.js');

module.exports = function(yargs) {
  var argv = yargs
    .options({
      'target': {
        alias: 't',
        default: 'node'
      }
    }).argv;

  process.env.NODE_ENV = 'production';

  var port = 3000;
  var dir = '.';
  switch (argv._.length) {
    case 2:
      var arg1 = parseInt(argv._[1], 10);
      if (isNaN(arg1))
        dir = argv._[1];
      else
        port = arg1;
    break;

    case 3:
      port = argv._[1];
      dir = argv._[2];
    break;
  }

  var cwd = help.getWorkingDirectory(dir);
  site.verify(cwd);

  process.chdir(cwd);
  // console.log('cwd', cwd, 'port', port, 'dir', dir); process.exit();

  var compile = new Compile({
    port: port,
    concurrency: 0
  });
  rimraf(compile.destination, function() {
    compile.start(function(err) {
      if (err) throw err;
      Build.start(compile.destination, argv.target, function(err) {
        if (err) throw err;
        process.exit();
      });
    });
  });
};
