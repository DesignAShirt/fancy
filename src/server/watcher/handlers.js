var Page = require('../../data/context/page.js');

function toHash(result, locale) {
  return result.map(function(element) {
    return element.getAsHash(locale);
  });
}

module.exports = function(site) {
  return {
    find: function(data, reply) {
      var properties = site.getPageForUrl(data.url);
      if (properties) {
        reply({
            properties: properties.getAsHash(data.locale)
          , filepath: properties.relativePath
        });
      }
      else {
        reply({ error: 404, message: 'Not Found' });
      }
    },

    resources: function(data, reply) {
      var pages = site.findByAny('resource');
      Object.keys(pages).forEach(function(element) {
        pages[element] = toHash(pages[element], data.locale);
      });
      reply({ pages: pages });
    },

    matching: function(data, reply) {
      var pages = site.findByProperty(data.key, data.value || eval('(' + data.fn + ')'));
      reply({ pages: toHash(pages, data.locale) });
    },

    urls: function(data, reply) {
      var urls = [];
      site.forEach(function(relativePath, properties) {
        var pageUrl = new Page(properties.getAsHash(data.locale)).url;
        if (urls.indexOf(pageUrl) < 0) {
          urls.push(pageUrl);
        }
      });
      reply({ urls: urls });
    }
  }
};
