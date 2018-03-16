"use strict";

var cheerio = require('cheerio');
var { map } = require('lodash');

module.exports = function(contents, callback) {
  var $ = cheerio.load(contents);

  var properties = [];
  var addProp = function addProp(name, val) {
    properties.push([name, val]);
  };

  addProp('title', $('title').text());
  if ($('body').length)
    addProp('body', $('body').html());

  var contentType = 'text/html; charset=utf-8';
  $('meta[http-equiv][content]').each(function() {
    var $this = $(this);
    if ($this.attr('http-equiv').toLowerCase() === 'content-type')
      contentType = $this.attr('content');
  });
  addProp('contentType', contentType);

  // FIXME:
  // Come up with a more flexible system to force content to be on the page. This
  // is a common thing to need in the real world.
  addProp('headerScripts', $.html('head>script'));
  addProp('images', map($('img'), img => cheerio(img).attr('src')));

  $('head>property,head>meta').each(function() {
    var $el = $(this);
    if ($el.attr('http-equiv')) return;
    var key = $el.attr('key') || $el.attr('name');
    var val = $el.attr('value') || $el.attr('content') || '';

    addProp(key, val);
  });

  // console.log('parser html properties', properties);

  callback(null, properties);
};
