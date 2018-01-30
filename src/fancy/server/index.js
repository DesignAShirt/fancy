"use strict";

var path = require('path');
var express = require('express');
var logger = require('morgan');
var glob = require('glob');
var cluster = require('cluster');

// FIXME: callback -> ready event

// this is sync but let's keep the async signature the rest have
module.exports = function(fancy, callback) {
  if (fancy.options.concurrency && cluster.isMaster) {
    function messageHandler(msg) {
      if (msg.cmd && msg.cmd == 'routeDiscovered')
        fancy.routeDiscovered(msg.url);
    }

    for (var i = 0; i < fancy.options.concurrency; i++) {
      cluster.fork().on('message', messageHandler);
    }

    cluster.on('online', function(worker) {
      console.log('[%s] worker online', worker.process.pid);
    });

    cluster.on('exit', function(worker, code, signal) {
      console.log('[%s] worker ded', worker.process.pid);
      cluster.fork().on('message', messageHandler);
    });
  } else {
    var app = express();

    if (fancy.options.concurrency) {
      // wrap fancy.routeDiscovered in the worker to aggregate urls in master
      fancy.options.onRouteDiscovered = function(url, exists) {
        process.send({
          cmd: 'routeDiscovered',
          url: url
        });
      }
    }

    app.set('env', 'development');
    app.enable('case sensitive routing');
    app.enable('strict routing');

    // view engine setup
    app.set('views', path.join(process.cwd(), './themes/' + fancy.options.theme + '/views'));
    app.set('view engine', 'ejs');
    app.disable('view cache');

    app.use(express.static(path.join(process.cwd(), './themes/' + fancy.options.theme + '/public')));
    app.use(express.static(path.join(process.cwd(), './data/assets')));

    // initialize static handlers
    // TODO: support multiple content directories
    var matches = glob.sync('./data/content/**/*.html/public');
    for (var i=0; i < matches.length; i++) {
      app.use(express.static(path.join(process.cwd(), matches[i])));
    }

    app.use(logger('dev'));

    app.set('views', path.join(process.cwd(), './themes/' + fancy.options.theme + '/views'));

    function renderError(req, res, err) {
      console.error("Rendering error:");
      console.error(err);
      res.status(err.status || 500);
      res.render('layouts/error', fancy.createResponse(req.url, {
        message: err.message,
        error: err,
        route: req.url
      }));
    }

    function renderPage(req, res, details) {
      fancy.routeDiscovered(req.url);
      var contentType = details.res.page.contentType || 'text/html';
      if (contentType.indexOf(';') > -1)
        contentType = contentType.split(';')[0].trim();

      if (contentType == 'application/json') {
        return void res.json(details.res.page.body);
      } else if (contentType == 'application/javascript') {
        var jsVar = details.res.page.scopeTarget || 'window["' + req.url + '"]';
        return void res.status(200).contentType('application/javascript').send(jsVar + ' = ' + JSON.stringify(details.res.page.body));
      } else {
        return void res.render('layouts/' + details.layout, details.res);
      }
    }

    // TODO: implement staged content so that robots can be conditionally supplied via content directory
    app.use('/robots.txt', function(req, res) {
      res.status(200).contentType('text/plain').send([ 'User-agent: *', 'Disallow: /' ].join('\n'));
    });

    var router = express.Router();
    router.get('*', function(req, res) {
      fancy.requestPage(req.url, function(err, details) {
        if (err) {
          if (req.url.indexOf('?') > -1) { // has querystring?
            // drop it and try matching
            fancy.requestPage(req.url.split('?')[0], function(err2, details) {
              if (err2)
                return void renderError(req, res, err);
              else
                return void renderPage(req, res, details);
            });
          } else {
            return void renderError(req, res, err);
          }
        } else {
          renderPage(req, res, details);
        }
      });
    });
    app.use('/', router);

    app.use(function(err, req, res, next) {
      renderError(req, res, err);
    });

    app.set('port', fancy.options.port);
    app.listen(fancy.options.port, function(err) {
      if (err) throw err;
    });
  }

  callback(null);
};
