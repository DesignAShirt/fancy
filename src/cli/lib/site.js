"use strict";

var path = require('path');

var cpr = require('cpr');

var cprOpts = { overwrite: true };

var help = require('../../utils/help.js');

module.exports = {
  createDirectories: function(workingDir) {
    var dirs = {
      cwd:        workingDir,
      db:         help.createDirectory(workingDir, '.fancy/db'),
      cache:      help.createDirectory(workingDir, '.fancy/cache'),
      content:    help.createDirectory(workingDir, 'data/content'),
      providers:  help.createDirectory(workingDir, 'data/providers'),
      constants:  help.createDirectory(workingDir, 'data/constants'),
      assets:     help.createDirectory(workingDir, 'data/assets'),
      themes:     help.createDirectory(workingDir, 'themes/itworked'),
      extensions: help.createDirectory(workingDir, 'extensions')
    };
    return dirs;
  },

  verify: function(workingDir) {
    var required = [
      { location: '.fancy/db', create: true, directory: true },
      { location: '.fancy/cache', create: true, directory: true },

      { location: 'data/content', create: false, directory: true },
      { location: 'themes', create: false, directory: true },
      { location: 'package.json', create: false, directory: false },
      { location: 'config.yml', create: false, directory: false },
    ];
    for (var i=0; i< required.length; i++) {
      var requirement = required[i];
      var requiredPath = path.join(workingDir, requirement.location);

      if (requirement.directory && help.isDirectory(requiredPath)) {
      } else if (!requirement.directory && help.isFile(requiredPath)) {
      } else if (requirement.directory && requirement.create) { // TODO: support file creation?
        help.createDirectory(workingDir, requirement.location);
      } else {
        throw new Error('Could not locate: ' + requiredPath);
      }
    }
  },

  copyTemplate: function(dirs, callback) {
    var templatePath = path.join(__dirname, '../templates');
    cpr(path.join(templatePath, 'data/constants/'), dirs.constants, cprOpts, function (err) {
      if (err) return console.log(err);
      cpr(path.join(templatePath, 'data/content/'), dirs.content, cprOpts, function (err) {
        if (err) return console.log(err);
        cpr(path.join(templatePath, 'theme/'), dirs.themes, cprOpts, function (err) {
          if (err) return console.log(err);
          cpr(path.join(templatePath, 'config.yml'), path.join(dirs.cwd, 'config.yml'), cprOpts, function (err) {
            if (err) return console.log(err);
            cpr(path.join(templatePath, 'package.json'), path.join(dirs.cwd, 'package.json'), cprOpts, function (err) {
              if (err) return console.log(err);
              callback();
            });
          });
        });
      });
    });
  },
};
