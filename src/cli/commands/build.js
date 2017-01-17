var portfinder = require('portfinder');

portfinder.basePort = 3000;

var Build = require('../../compile/build.js');
var help = require('../../utils/help');

var site = require('../lib/site.js');

var debug = require('debug')('http');

module.exports = function(yargs) {
  var argv = yargs
    .options({
      'target': {
        alias: 't',
        default: 'node'
      }
    }).argv;

  var dir = '.';
  var cwd = help.getWorkingDirectory(dir);
  site.verify(cwd);

  process.chdir(cwd);
  // console.log('cwd', cwd, 'port', port, 'dir', dir); process.exit();

  Build.start('./.fancy/compiled', argv.target, function(err) {
    if (err) throw err;
    process.exit();
  });
};
