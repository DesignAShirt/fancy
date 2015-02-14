var __uid = 0
  , __uid_cache = {};

function Page(request, data) {
  var _this = this;
  data = Page.fix(data);

  Object.defineProperty(this, 'url', {
    value: function(vals) {
      return Page.url(request, _this, vals);
    }
  });

  // add generated id
  if (!('id' in data)) {
    __uid_cache[data.__filepath] = __uid_cache[data.__filepath] || data.route[0].replace(/[^\w\d\-\_]/g, '');
    if (!__uid_cache[data.__filepath]) {
      __uid_cache[data.__filepath] = 'autoid:' + (++__uid).toString();
    }
    data.id = [ __uid_cache[data.__filepath] ];
  }

  for (var k in data) {
    // allow properties to automatically toString to arr[0] if only one value exists
    (function(property) {
      Object.defineProperty(property, 'toString', {
        value: function() {
          if (property.length === 1) {
            return property[0] && property[0].toString ? property[0].toString() : '' + property[0];
          }
          else {
            return Array.prototype.toString.call(property);
          }
        }
      });

      Object.defineProperty(_this, k, {
          value: property
        , enumerable: true
      });
    })(data[k]);
  }
}

Page.prototype.value = function(key, defaultValue) {
  return this[key.trim().toLowerCase()] || defaultValue;
};

Page.prototype.first = function(key, defaultValue) {
  var val = this.value(key);
  return val && val.length ? val[0] : defaultValue;
};

Page.prototype.text = function(key, defaultValue) {
  return this.value(key, defaultValue).toString();
};

Page.url = function(request, page, vals) {
  vals = vals || {};
  var templateUrl = page.urlTemplate.toString();
  if (!templateUrl.length) {
    return page.route;
  }

  var templateValues = Object.create(vals);
  for (var k in vals) {
    templateValues[k] = vals[k];
  }

  if ('/' !== templateUrl.trim()[0] && /\s*\w.*\?.*\:.*/.test(templateUrl)) {
    templateUrl = (function(template) {
      return eval(templateUrl);
    })(templateValues);
  }

  return uriTemplates(templateUrl).fillFromObject(templateValues);
};

Page.fix = function(data) {
  var obj = {};
  if (Array.isArray(data)) {
    for (var i=0; i < data.length; i++) {
      var k = data[i][0]
        , v = data[i][1];
      obj[k] = obj[k] || [];
      obj[k].push(v);
    }
  }
  else {
    for (var k in data) {
      if (!Array.isArray(data[k])) {
        obj[k] = [data[k]];
      }
      else {
        obj[k] = data[k];
      }
    }
  }
  return obj;
}

module.exports = Page;
