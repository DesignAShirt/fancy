"use strict";

var Fancy = require('../../fancy/index');
var help = require('../../utils/help');

var site = require('../lib/site.js');

module.exports = function(yargs) {
  var argv = yargs.argv;

  var port = 3000
    , dir = '.';
  switch (argv._.length) {
    case 2:
      var arg1 = parseInt(argv._[1], 10);
      if (isNaN(arg1)) {
        dir = argv._[1];
      }
      else {
        port = arg1;
      }
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

  var fancy = new Fancy({
    port: port,
    logDiscoveredRoutes: argv.logDiscoveredRoutes || false,
  });
  fancy.init(function(err) {
    if (err) throw err;
    // process.exit();
  });
};
