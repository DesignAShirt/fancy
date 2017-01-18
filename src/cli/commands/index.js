"use strict";

var create = require('./create');
var serve = require('./serve');
var clean = require('./clean');
var build = require('./build');
var compile = require('./compile');

var cmds = {
  create: create,
  'new': create,

  clean: clean,

  serve: serve,
  server: serve,
  start: serve,
  test: serve,

  compile: compile,
  make: compile,
  generate: compile,

  build: build
};

module.exports = cmds;
