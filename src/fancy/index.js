"use strict";

var fs = require('fs');
var path = require('path');
var async = require('async');
var glob = require('glob');
var yaml = require('js-yaml');
var urlPattern = require('url-pattern');

var server = require('./server/index.js');
var FancyDb = require('./db/index.js');
var help = require('../utils/help.js');
var objectUtil = require('../utils/object.js');
var cache = require('../utils/cache.js');

var helpers = require('./helpers/index.js');

function Fancy(options) {
  this._responseCache = {};
  options = options || {};
  // defaults
  this.options = {
    theme: null,
    port: 3000,
    //  contentDirectories: [], // TODO: this is going to change so disabling use for now
    providers: [],
    extensions: [],
    buildRoutes: [],
    strictMode: true,
    // FIXME: cluster concurrency is poorly structured but seemingly works
    concurrency: 0, // require('os').cpus().length
    onRouteDiscovered: function(url, exists, relativePath){},
    logDiscoveredRoutes: false
  };
  // load options
  for (var k in options) {
    if (k in this.options)
      this.options[k] = options[k];
    else
      throw new Error('Invalid fancy option: ' + k);
  }

  console.log('Loading site config.yml...');
  var configFilepath = './config.yml';
  var config;
  if (fs.existsSync(configFilepath)) {
    config = yaml.load(fs.readFileSync(configFilepath, 'utf8')) || {};
    for (var k in config) {
      this.options[k] = config[k];
    }
  }
  console.log('Done loading site config.yml');

  if (!this.options.theme)
    throw new Error('Fancy: A theme is required but none was specified');

  // other properties
  this.knownRoutes = [];

  this.theme = {
    views: path.join(process.cwd(), './themes/' + this.options.theme + '/views'),
    supportPath: path.join(process.cwd(), './themes/' + this.options.theme + '/support/theme.js'),
    support: null
  }
  if (fs.existsSync(this.theme.supportPath))
    this.theme.support = require(this.theme.supportPath);

  this.server = null;
  this.db = null;

  this.constants = {};

  this.extensions = {};


  // set of defaults

  // FIXME: should generalize this a bit into data directories, so providers, assets and constants are all loaded too
  this.options.contentDirectories = [ 'data/content' ]; // always look relative

  console.log('Loading extensions...');
  this.options.extensions = this.options.extensions || [];
  for (var i=0; i < this.options.extensions.length; i++) {
    var extensionName = this.options.extensions[i];
    var extensionPath = path.join(process.cwd(), './extensions/' + extensionName + '/index.js');
    if (fs.existsSync(extensionPath)) {
      // console.log('Loading extension %s...', extensionPath);
      this.extensions[extensionName] = require(extensionPath);
    } else {
      console.warn('Warning: Unable to load extension %s', extensionPath);
    }
  }
  console.log('Done loading extensions');
}

Fancy.prototype.init = function(callback) {
  var tasks = [];

  tasks.push(taskCallback => {
    this.db = new FancyDb(this.options.contentDirectories, this.clearResponseCache);
    (this.options.providers || []).forEach(providerName => {
      var providerPath = path.join(process.cwd(), './data/providers/' + providerName + '/index.js');
      if (fs.existsSync(providerPath)) {
        // console.log('Loading provider %s...', providerPath);
        this.db.providers.push(require(providerPath)); // TODO: move paths someplace configurable
      } else {
        console.warn('Warning: Unable to load provider %s', providerPath);
      }
    });
    this.db.init((err, db) => {
      if (err)
        return taskCallback(err);
      else
        return taskCallback(null);
    });
  });

  // TODO: make async
  tasks.push(taskCallback => {
    var notifier = help.notifier('Site constants');
    glob('./data/constants/**/*.@(yml|json)', (err, matches) => {
      if (err)
        return callback(err);

      matches.forEach(relativePath => {
        switch (path.extname(relativePath)) {
          case '.yml':
            var constantsKey = path.basename(relativePath, '.yml');
            this.constants[constantsKey] = yaml.load(fs.readFileSync(relativePath, 'utf8'));
          break;
          case '.json':
            var constantsKey = path.basename(relativePath, '.json');
            this.constants[constantsKey] = JSON.parse(fs.readFileSync(relativePath, 'utf8'));
          break;
          default:
            throw new Error('Invalid constant file format %s', relativePath);
          break;
        }
      });
      notifier.done();
      taskCallback(null);
    });
  });

  async.parallelLimit(tasks, 2, err => {
    if (err)
      return callback(err);

    var notifier = help.notifier('Loading web server');
    server(this, err => {
      if (err)
        return callback(err);

      notifier.done();
      console.log('Fancy initialized and listening on port %d', this.options.port);
      callback.call(this, null);
    });

  });
};

Fancy.prototype.routeDiscovered = function(url, relativePath) {
  var exists = this.knownRoutes.indexOf(url) > -1;
  if (!exists) {
    this.knownRoutes.push(url);
    if (this.options.logDiscoveredRoutes)
      console.log('\t-> Route Discovered: ', url);
  }
  this.options.onRouteDiscovered(url, exists, relativePath);
};

Fancy.prototype.getView = function(currentLayout, relativePath) {
  currentLayout = 'layouts/' + (currentLayout || 'primary') + '.ejs';
  var viewPath = path.join(this.theme.views, path.dirname(currentLayout), relativePath);
  return viewPath;
};

// page can be Page object or {}
Fancy.prototype.createResponse = function(url, page, params) {
  var _this = this;
  var res = {};

  Object.defineProperty(res, 'fancy', { value: helpers(res, this), enumerable: true });
  Object.defineProperty(res, 'yield', { value: function(yieldUrl, decode) {
    var discovered = decode ? decodeURIComponent(yieldUrl) : yieldUrl;
    if (discovered.length)
      _this.routeDiscovered(discovered, 'yield:' + url);

    return process.env.NODE_ENV === 'development' ? '<!-- yield: ' + discovered + ' -->' : '';
  }, enumerable: true });
  Object.defineProperty(res, 'theme', { value: (_this.theme.support || function(){ return {}; })(res), enumerable: true });
  Object.defineProperty(res, 'extensions', { value: _this.extensions, enumerable: true }); // TODO: auto-load extensions


  _this._responseCache.config = _this._responseCache.config || objectUtil.flatten(_this.options || {});
  Object.defineProperty(res, 'config', { value: _this._responseCache.config, enumerable: true });
  _this._responseCache.constants = _this._responseCache.constants || objectUtil.flatten(_this.constants || {});
  Object.defineProperty(res, 'constant', { value: _this._responseCache.constants, enumerable: true });
  Object.defineProperty(res, 'constants', { value: _this._responseCache.constants, enumerable: true });

  // deep freeze page and request so it doesn't get flattened (and matches other data structure if page.body is obj lit)

  page = page.toTemplateObject ? page.toTemplateObject() : page;
  objectUtil.deepFreeze(page);
  Object.defineProperty(res, 'page', { value: page, enumerable: true });

  var request = {
    url: url,
    params: params || {}
  };
  objectUtil.deepFreeze(request);
  Object.defineProperty(res, 'request', { value: request, enumerable: true });

  var env = {
    stage: process.env.NODE_ENV || 'production'
  };
  objectUtil.deepFreeze(env);
  Object.defineProperty(res, 'env', { value: env, enumerable: true });

  _this._responseCache.site = _this._responseCache.site || objectUtil.flatten({
    pages: Object.keys(_this.db.pages).map(function(item) {
      return _this.db.pages[item].toTemplateObject();
    }),
    resources: _this.getResourcesForTemplate(),
    meta: _this.getMetaForTemplate(),
    relationships: _this.getRelationshipsForTemplate()
  });
  Object.defineProperty(res, 'site', { value: _this._responseCache.site, enumerable: true });

  res.print = function() {
    var html = '';
    for (var i=0; i < arguments.length; i++) {
      html += '<pre>' + JSON.stringify(arguments[i], null, 2) + '</pre>';
    }
    return html;
  };

  return res;
};

// Fancy.prototype.getPagesForTemplate = function() {
//   var obj = {};
//   for (var k in this.db.pages) {
//     obj[k] = this.db.pages[k].toTemplateObject();
//   }
//   return obj;
// };

Fancy.prototype.clearResponseCache = function(relativePath) {
  // console.log('clearing response cache because of %s', relativePath);
  this._responseCache = {};
};

Fancy.prototype.getResourcesForTemplate = function() {
  var obj = {};
  // console.log('Getting Resources for Response...');
  for (var k in this.db.resources) {
    // console.log('\t%s', k);
    obj[k] = [];
    for (var i=0; i < this.db.resources[k].length; i++) {
      var data = this.db.resources[k][i].toTemplateObject();
      // console.log('\t\t%s', data.route);
      obj[k].push(data);
    }
  }
  return obj;
};

Fancy.prototype.getMetaForTemplate = function() {
  var obj = {};
  // console.log('Getting Meta for Response...');
  for (var k in this.db.meta) {
    // console.log('\t%s', k);
    obj[k] = [];
    for (var i=0; i < this.db.meta[k].length; i++) {
      var data = this.db.meta[k][i].toTemplateObject();
      // console.log('\t\t%s', data.route);
      obj[k].push(data);
    }
  }
  return obj;
};

Fancy.prototype.getRelationshipsForTemplate = function() {
  var obj = {};
  // console.log('Getting Relationships for Response...');
  for (var rel in this.db.relationships) {
    obj[rel] = {};
    // console.log('\t%s', rel);
    for (var relVal in this.db.relationships[rel]) {
      obj[rel][relVal] = [];
      // console.log('\t\t%s', relVal);
      for (var i=0; i < this.db.relationships[rel][relVal].length; i++) {
        var data = this.db.relationships[rel][relVal][i].toTemplateObject();
        // console.log('\t\t\t%s', data.route);
        obj[rel][relVal].push(data);
      }
    }
  }
  return obj;
};

Fancy.prototype._reduceMatchingRoutes = function(pages) {
  // console.log('Reducing matching routes...');
  var preferredPages = pages.filter(function(page) {
    // console.log('\t-> Page %s has property preferred? %s', page.relativePath, page.hasProperty('preferred'));
    return page && page.hasProperty('preferred');
  });
  if (pages.length > 1 && !preferredPages.length && this.options.strictMode) {
    console.log('Multiple matching pages:', pages);
    throw new Error('Strict Mode: Multiple pages match url, with none marked preferred');
  }
  if (!preferredPages.length)
    preferredPages = pages;

  var nonproviderPages = preferredPages.filter(function(page) {
    // console.log('\t-> Page %s is not provider? %s', page.relativePath, 0 !== page.relativePath.indexOf('provider:'));
    return page && 0 !== page.relativePath.indexOf('provider:');
  });
  if (!nonproviderPages.length)
    nonproviderPages = preferredPages;

  // console.log('\t-> Matches: ', nonproviderPages.length);

  if (nonproviderPages.length)
    return nonproviderPages[0];
  else
    return null;
};

// returns response object via callback
Fancy.prototype.requestPage = function(url, callback) {
  // console.log('Getting page for %s...', url);

  this.db.findPageByRoute(url, (err, pages) => {
    if (err)
      return callback(err);

    var templateMatchParams = {};
    if (!pages.length) { // no direct match found.  urlPattern matching
      // console.log('\t-> No exact matching routes');
      pages = [];
      for (var relativePath in this.db.pages) {
        var page = this.db.pages[relativePath];
        // console.log('\t-> does page %s match?', page.relativePath);
        if (!page.dataObject.properties) {
          console.log('ERROR. The universe has imploded and a page did not contain properties.  Things should be built in a way this cannot happen, yet it did.  I cannot continue.  Here is the page: ', page);
          process.exit();
        }
        for (var i = 0; i < page.dataObject.properties.length; i++) {
          var property = page.dataObject.properties[i];
          if (property.name === 'route') {
            // console.log('url pattern matching "%s" to "%s"', property.content, url);
            var params = urlPattern.newPattern(property.content).match(url);
            // console.log(url, k, params);
            if (params) {
              templateMatchParams[page.relativePath] = params;
              pages.push(page);
              break;
            }
          }
        }
      }
    }

    if (pages) {
      // console.log('\t-> %s found pages', pages.length);
      var reducedPage = this._reduceMatchingRoutes(pages);
      if (reducedPage) {
        return void callback(null, {
          page: reducedPage,
          layout: reducedPage.layout || 'primary',
          res: this.createResponse(url, reducedPage, templateMatchParams[reducedPage.relativePath])
        });
      }
    }

    var err = new Error('Not Found: ' + url);
    err.status = 404;
    return callback(err);
  });
};

Fancy.cache = cache;
Fancy.utils = helpers.utils;
Fancy.filters = helpers.filters;

module.exports = Fancy;
