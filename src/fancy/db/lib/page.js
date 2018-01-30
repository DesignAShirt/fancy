"use strict";

var fs = require('fs');
var path = require('path');
var async = require('async');

var fingerprint = require('../../../utils/fingerprint.js');
var iterator = require('../../../utils/iterator.js');
// var cache = require('../../../utils/cache.js');
var help = require('../../../utils/help.js');
var parsers = require('../../parsers/index.js');
var orm = require('./orm.js');

var Page = orm.models.Page;
// var Property = orm.models.Property;
// var Resource = orm.models.Resource;

// FIXME: using callback.call so callbacks refer to object is silly.  a ref can just be saved if needed
// TODO: remove this object?  better to just build on top of sequelize objects maybe

function FancyPage(relativePath) {
  this.relativePath = relativePath;
  this.dataObject = null;
  this._properties = null; // FIXME: turn properties back on when db is improved
  this.layout = null;
  this.resource = null;
  this.assetPath = null;

  this.isDirectory = false;
  this.contentPath = null;
  if (relativePath.indexOf(':') < 0 && help.isDirectory(relativePath)) {
    this.isDirectory = true;
    // console.log('Content directory: finding page file...');
    this.contentPath = this._findParseable('page');

    if (!this.contentPath) {
      throw new Error('Content directory does not contain page file. e.g. ' + relativePath + '/page.md');
    } else {
      // console.log('Content directory %s page file is %s', relativePath, this.contentPath);
    }
  } else {
    this.contentPath = this.relativePath;
  }
}

FancyPage.prototype._findParseable = function(name) {
  for (var i=0; i < parsers.available.length; i++) {
    var ext = parsers.available[i];
    var pagePath = path.join(this.relativePath, '/' + name + '.' + ext);
    // console.log('%s does page exist? %s', this.relativePath, pagePath);
    if (fs.existsSync(pagePath))
      return pagePath;
  }
  return null;
};

FancyPage.prototype.init = function(properties, callback) {
  if (typeof properties === 'function') {
    callback = properties;
    properties = null;
  }

  var done = () => {
    if (!this.hasRoute())
      return void callback.call(this, new Error('Page must have a route property: ' + this.relativePath));
    else
      callback.call(this, null, this);
  };

  this.create(properties, (err) => {
    if (err)
      return callback.call(this, err);

    this.refresh((err) => {
      if (err)
        return callback.call(this, err);

      if (this.isDirectory) {
        var assetPath = path.join(this.relativePath, '/public'); // if path is a directory and has a public asset directory, load them
        fs.exists(assetPath, (exists) => {
          if (exists)
            this.assetPath = assetPath;

          done();
        });
      } else {
        done();
      }
    });
  });
};

FancyPage.prototype.create = function(properties, callback) {
  var done = (err, dataObject) => {
    if (err)
      return callback.call(this, err);

    this.dataObject = dataObject;
    if (properties)
      this.setProperties(properties, callback);
    else
      this.reload(callback);
  };

  Page.find({
    where: { path: this.relativePath },
    // include: [ Property ] // FIXME: turn properties back on when db is improved
  }).then(dataObject => {
    if (!dataObject) {
      return Page.create({ path: this.relativePath, fingerprint: 'NOT_FINGERPRINTED' })
        .then(d => done(null, d));
    } else {
      return void done(null, dataObject);
    }
  })
    .catch(err => {
      done(err);
    });
};

FancyPage.prototype.refresh = function(callback) {
  return Page.find({
    where: { path: this.relativePath },
    // include: [ Property ] // FIXME: turn properties back on when db is improved
  })
    .then(dataObject => {
      this.dataObject = dataObject;
      this.dataObject.properties = this._properties;
      callback.call(this, null);
      return null;
    })
    .catch(err => {
      callback.call(this, err);
    });
};

FancyPage.prototype.reload = function(callback) {
  var prefix = this.relativePath.split(':')[0];

  switch (prefix) {
    case 'provider':
      this._reloadProviderObject(callback);
    break;

    default:
      this._reloadFile(callback);
    break;
  }
};

FancyPage.prototype._reloadFile = function(callback) {
  // FIXME: turn properties back on when db is improved

  // // console.log('fingerprint %s', this.contentPath);
  fingerprint.file(this.contentPath, (err, fingerprint) => {
  //   // console.log('\t-> fingerprint returned');
    if (err)
      return callback.call(this, err);

  //   this.dataObject.fingerprint = fingerprint;
  //   this.dataObject.save().done((err) => {
  //     // console.log('\t-> save returned');
  //     if (err) {
  //       return callback.call(this, err);
  //     }

    var cacheKey = 'fancy:content:' + fingerprint;
    // cache.io(cacheKey, (err, data) => {
    //   if (err) {
    //     return callback.call(this, err);
    //   }
    //   if (void 0 === data) { // not cached
    //     console.log('cache.io MISS: %s', this.contentPath);
        this._parseFile((err, properties) => {
          if (err)
            return callback.call(this, err);

          // cache.io(cacheKey, properties, (err, data) => {
          //   if (err) {
          //     return callback.call(this, err);
          //   }
            this.setProperties(properties, callback.bind(this));
          // });
        });
    //   }
    //   else {
    //     this.setProperties(data, callback.bind(this));
    //   }
    // });

  //   });
  });
};

// properties can be hash or array of [k, v]
FancyPage.prototype._propertiesObjectHasKey = function(properties, key) {
  properties = properties || [];
  key = key.toLowerCase();
  var type = toString.call(properties);
  if (type === '[object Array]') {
    for (var i=0; i < properties.length; i++) {
      if (properties[i][0].toLowerCase() == key)
        return true;
    }
  } else if (type === '[object Object]') {
    for (var k in properties) {
      if (k.toLowerCase() == key)
        return true;
    }
  }

  return false;
};

FancyPage.prototype._parseFile = function(callback) {
  parsers(this.contentPath, (err, properties) => {
    // console.log('\t-> parser returned');
    if (err)
      return callback(err);

    // TODO: if parser data doesn't contain date, grab it from the last mod date of the file

    // page doesn't contain a body and the page is a content directory.  try to grab the body as a separate file
    // this really only useful for markdown body.md, otherwise it's better to just combine everything
    if (!this._propertiesObjectHasKey(properties, 'body') && this.isDirectory) {
      var bodyPath = this._findParseable('body');
      parsers(bodyPath, (err, bodyProps) => {
        if (err)
          return callback(err);

        properties.push([ 'body', bodyProps.body ]);
        callback(null, properties);
      });
    } else {
      return void callback(null, properties);
    }
  });
};

FancyPage.prototype._reloadProviderObject = function(callback) {
  this.dataObject.fingerprint = fingerprint.objectSync(this.dataObject.properties);
  this.dataObject.save()
    .then(d => callback.call(this, null, d))
    .catch(err => callback.call(this, err));
};

FancyPage.prototype.remove = function(callback) {
  // TODO: stub. removes from db
  callback(null);
};

FancyPage.prototype.setProperties = function(properties, callback) {
  var tasks = [];
  var resourceTasks = [];

  if (!properties)
    return void callback(null);

  if (!this.dataObject)
    throw new Error('Page data object not yet ready');

  // console.log('setProperties', properties);

  iterator(properties).forEach((prop) => {
    var propName = prop[0];
    var propValue = prop[1];

    switch (propName) {
      // case 'resource':
      //   var resourceName = propValue.trim().toLowerCase();
      //   tasks.push((taskCallback) => {
      //     console.log('Looking up existing resource %s...', propValue);
      //     Resource.find({ where: { name: resourceName } }).done((err, resource) => {
      //       if (err) {
      //         return taskCallback(err);
      //       }
      //       if (resource) {
      //         console.log('Resource %s already exists', propValue);
      //         taskCallback(null);
      //         // this.dataObject.setResource(resource).done(taskCallback);
      //         return;
      //       }
      //       else {
      //         console.log('Creating resource %s...', propValue);
      //         Resource.create({ name: resourceName }).then((resource) => {
      //           console.log('Done creating resource %s', propValue);
      //           // this.dataObject.setResource(resource).done(taskCallback);
      //           taskCallback(null);
      //         });
      //         return;
      //       }
      //     });
      //   });
      // break;

      case 'layout':
        if (!this.layout)
          this.layout = propValue;
        else
          console.warn('Layout has already been set for page %s', this.relativePath);
      break;

      case 'resource':
        if (!this.resource)
          this.resource = propValue;
        else
          console.warn('Resource has already been set for page %s', this.relativePath);
      break;
    }

    tasks.push((taskCallback) => {
      taskCallback(null, { name: propName, content: propValue });

      // FIXME: turn properties back on when db is improved

      // Property.create({ name: propName, content: propValue }).done((err, property) => {
      //   if (err) {
      //     return taskCallback(err);
      //   }
      //   // this.dataObject.addProperty(property).done(taskCallback);
      //   taskCallback(null, property);
      // });
    });
  });

  async.parallelLimit(tasks, 2, (err, properties) => {
    if (err)
      return callback.call(this, err);

    this._properties =
    this.dataObject.properties = properties;

    // FIXME: turn properties back on when db is improved

    // this.dataObject.addProperties(properties).then(() => {
      this.refresh(callback.bind(this));
    // });
  });
};

FancyPage.prototype.clearProperties = function(callback) {
  callback(null);

  // FIXME: turn properties back on when db is improved

  // // console.log('Clearing properties...');
  // var ids = [];
  // (this.dataObject.properties || []).forEach(function(property) {
  //   ids.push(property.id);
  // });
  // if (ids.length) {
  //   Property.destroy({ where: { id: ids } }).done(callback);
  // }
  // else {
  //   // console.log('No properties to clear');
  //   callback(null);
  // }
};

FancyPage.prototype.getProperties = function() {
  return this.toTemplateObject();
};

FancyPage.prototype.getProperty = function(name) {
  var ret = [];
  name = name.toLowerCase();
  var properties = (this.dataObject || {}).properties || {};
  for (var i=0; i < properties.length; i++) {
    var property = properties[i];
    if (name === property.name.toLowerCase())
      ret.push(property.content);
  }
  if (1 === ret.length)
    ret = ret[0];

  return ret;
};

FancyPage.prototype.hasProperty = function(name, val) {
  var checkVal = void 0 !== val;
  name = name.toLowerCase();
  var properties = (this.dataObject || {}).properties || {};
  for (var i=0; i < properties.length; i++) {
    var property = properties[i];
    if (name === property.name.toLowerCase()) {
      if (!checkVal || (checkVal && property.content == val))
        return true;
    }
  }
  return false;
};

FancyPage.prototype.hasRoute = function() {
  return this.hasProperty('route');
};

FancyPage.prototype.toTemplateObject = function() {
  var obj = {};
  var properties = (this.dataObject || {}).properties || {};
  // console.log('To Template Object %s', this.relativePath);
  for (var i=0; i < properties.length; i++) {
    var property = properties[i];
    // console.log('\t-> %s: %s', property.name, property.content);

    if (obj[property.name]) {
      if (typeof obj[property.name] !== 'object' || !('length' in obj[property.name]))
        obj[property.name] = [ obj[property.name] ];

      obj[property.name].push(property.content);
    } else {
      obj[property.name] = property.content;
    }
  }
  // console.log('return object', obj);
  return obj;
};

module.exports = FancyPage;
