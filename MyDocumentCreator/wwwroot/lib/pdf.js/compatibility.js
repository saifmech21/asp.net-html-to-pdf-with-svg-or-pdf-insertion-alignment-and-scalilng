/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Checking if the typed arrays are supported
(function checkTypedArrayCompatibility() {
  if (typeof Uint8Array !== 'undefined') {
    // some mobile versions do not support subarray (e.g. safari 5 / iOS)
    if (typeof Uint8Array.prototype.subarray === 'undefined') {
        Uint8Array.prototype.subarray = function subarray(start, end) {
          return new Uint8Array(this.slice(start, end));
        };
        Float32Array.prototype.subarray = function subarray(start, end) {
          return new Float32Array(this.slice(start, end));
        };
    }

    // some mobile version might not support Float64Array
    if (typeof Float64Array === 'undefined')
      window.Float64Array = Float32Array;

    return;
  }

  function subarray(start, end) {
    return new TypedArray(this.slice(start, end));
  }

  function setArrayOffset(array, offset) {
    if (arguments.length < 2)
      offset = 0;
    for (var i = 0, n = array.length; i < n; ++i, ++offset)
      this[offset] = array[i] & 0xFF;
  }

  function TypedArray(arg1) {
    var result;
    if (typeof arg1 === 'number') {
      result = [];
      for (var i = 0; i < arg1; ++i)
        result[i] = 0;
    } else
      result = arg1.slice(0);

    result.subarray = subarray;
    result.buffer = result;
    result.byteLength = result.length;
    result.set = setArrayOffset;

    if (typeof arg1 === 'object' && arg1.buffer)
      result.buffer = arg1.buffer;

    return result;
  }

  window.Uint8Array = TypedArray;

  // we don't need support for set, byteLength for 32-bit array
  // so we can use the TypedArray as well
  window.Uint32Array = TypedArray;
  window.Int32Array = TypedArray;
  window.Uint16Array = TypedArray;
  window.Float32Array = TypedArray;
  window.Float64Array = TypedArray;
})();

// Object.create() ?
(function checkObjectCreateCompatibility() {
  if (typeof Object.create !== 'undefined')
    return;

  Object.create = function objectCreate(proto) {
    var constructor = function objectCreateConstructor() {};
    constructor.prototype = proto;
    return new constructor();
  };
})();

// Object.defineProperty() ?
(function checkObjectDefinePropertyCompatibility() {
  if (typeof Object.defineProperty !== 'undefined') {
    var definePropertyPossible = true;
    try {
      // some browsers (e.g. safari) cannot use defineProperty() on DOM objects
      // and thus the native version is not sufficient
      Object.defineProperty(new Image(), 'id', { value: 'test' });
      // ... another test for android gb browser for non-DOM objects
      var Test = function Test() {};
      Test.prototype = { get id() { } };
      Object.defineProperty(new Test(), 'id',
        { value: '', configurable: true, enumerable: true, writable: false });
    } catch (e) {
      definePropertyPossible = false;
    }
    if (definePropertyPossible) return;
  }

  Object.defineProperty = function objectDefineProperty(obj, name, def) {
    delete obj[name];
    if ('get' in def)
      obj.__defineGetter__(name, def['get']);
    if ('set' in def)
      obj.__defineSetter__(name, def['set']);
    if ('value' in def) {
      obj.__defineSetter__(name, function objectDefinePropertySetter(value) {
        this.__defineGetter__(name, function objectDefinePropertyGetter() {
          return value;
        });
        return value;
      });
      obj[name] = def.value;
    }
  };
})();

// Object.keys() ?
(function checkObjectKeysCompatibility() {
  if (typeof Object.keys !== 'undefined')
    return;

  Object.keys = function objectKeys(obj) {
    var result = [];
    for (var i in obj) {
      if (obj.hasOwnProperty(i))
        result.push(i);
    }
    return result;
  };
})();

// No readAsArrayBuffer ?
(function checkFileReaderReadAsArrayBuffer() {
  if (typeof FileReader === 'undefined')
    return; // FileReader is not implemented
  var frPrototype = FileReader.prototype;
  // Older versions of Firefox might not have readAsArrayBuffer
  if ('readAsArrayBuffer' in frPrototype)
    return; // readAsArrayBuffer is implemented
  Object.defineProperty(frPrototype, 'readAsArrayBuffer', {
    value: function fileReaderReadAsArrayBuffer(blob) {
      var fileReader = new FileReader();
      var originalReader = this;
      fileReader.onload = function fileReaderOnload(evt) {
        var data = evt.target.result;
        var buffer = new ArrayBuffer(data.length);
        var uint8Array = new Uint8Array(buffer);

        for (var i = 0, ii = data.length; i < ii; i++)
          uint8Array[i] = data.charCodeAt(i);

        Object.defineProperty(originalReader, 'result', {
          value: buffer,
          enumerable: true,
          writable: false,
          configurable: true
        });

        var event = document.createEvent('HTMLEvents');
        event.initEvent('load', false, false);
        originalReader.dispatchEvent(event);
      };
      fileReader.readAsBinaryString(blob);
    }
  });
})();

// No XMLHttpRequest.response ?
(function checkXMLHttpRequestResponseCompatibility() {
  var xhrPrototype = XMLHttpRequest.prototype;
  if (!('overrideMimeType' in xhrPrototype)) {
    // IE10 might have response, but not overrideMimeType
    Object.defineProperty(xhrPrototype, 'overrideMimeType', {
      value: function xmlHttpRequestOverrideMimeType(mimeType) {}
    });
  }
  if ('response' in xhrPrototype ||
      'mozResponseArrayBuffer' in xhrPrototype ||
      'mozResponse' in xhrPrototype ||
      'responseArrayBuffer' in xhrPrototype)
    return;
  // IE9 ?
  if (typeof VBArray !== 'undefined') {
    Object.defineProperty(xhrPrototype, 'response', {
      get: function xmlHttpRequestResponseGet() {
        return new Uint8Array(new VBArray(this.responseBody).toArray());
      }
    });
    return;
  }

  // other browsers
  function responseTypeSetter() {
    // will be only called to set "arraybuffer"
    this.overrideMimeType('text/plain; charset=x-user-defined');
  }
  if (typeof xhrPrototype.overrideMimeType === 'function') {
    Object.defineProperty(xhrPrototype, 'responseType',
                          { set: responseTypeSetter });
  }
  function responseGetter() {
    var text = this.responseText;
    var i, n = text.length;
    var result = new Uint8Array(n);
    for (i = 0; i < n; ++i)
      result[i] = text.charCodeAt(i) & 0xFF;
    return result;
  }
  Object.defineProperty(xhrPrototype, 'response', { get: responseGetter });
})();

// window.btoa (base64 encode function) ?
(function checkWindowBtoaCompatibility() {
  if ('btoa' in window)
    return;

  var digits =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  window.btoa = function windowBtoa(chars) {
    var buffer = '';
    var i, n;
    for (i = 0, n = chars.length; i < n; i += 3) {
      var b1 = chars.charCodeAt(i) & 0xFF;
      var b2 = chars.charCodeAt(i + 1) & 0xFF;
      var b3 = chars.charCodeAt(i + 2) & 0xFF;
      var d1 = b1 >> 2, d2 = ((b1 & 3) << 4) | (b2 >> 4);
      var d3 = i + 1 < n ? ((b2 & 0xF) << 2) | (b3 >> 6) : 64;
      var d4 = i + 2 < n ? (b3 & 0x3F) : 64;
      buffer += (digits.charAt(d1) + digits.charAt(d2) +
                 digits.charAt(d3) + digits.charAt(d4));
    }
    return buffer;
  };
})();

// Function.prototype.bind ?
(function checkFunctionPrototypeBindCompatibility() {
  if (typeof Function.prototype.bind !== 'undefined')
    return;

  Function.prototype.bind = function functionPrototypeBind(obj) {
    var fn = this, headArgs = Array.prototype.slice.call(arguments, 1);
    var bound = function functionPrototypeBindBound() {
      var args = Array.prototype.concat.apply(headArgs, arguments);
      return fn.apply(obj, args);
    };
    return bound;
  };
})();

// IE9/10 text/html data URI
(function checkDataURICompatibility() {
  if (!('documentMode' in document) ||
      document.documentMode !== 9 && document.documentMode !== 10)
    return;
  // overriding the src property
  var originalSrcDescriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype, 'src');
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    get: function htmlIFrameElementPrototypeSrcGet() { return this.$src; },
    set: function htmlIFrameElementPrototypeSrcSet(src) {
      this.$src = src;
      if (src.substr(0, 14) != 'data:text/html') {
        originalSrcDescriptor.set.call(this, src);
        return;
      }
      // for text/html, using blank document and then
      // document's open, write, and close operations
      originalSrcDescriptor.set.call(this, 'about:blank');
      setTimeout((function htmlIFrameElementPrototypeSrcOpenWriteClose() {
        var doc = this.contentDocument;
        doc.open('text/html');
        doc.write(src.substr(src.indexOf(',') + 1));
        doc.close();
      }).bind(this), 0);
    },
    enumerable: true
  });
})();

// HTMLElement dataset property
(function checkDatasetProperty() {
  var div = document.createElement('div');
  if ('dataset' in div)
    return; // dataset property exists

  Object.defineProperty(HTMLElement.prototype, 'dataset', {
    get: function() {
      if (this._dataset)
        return this._dataset;

      var dataset = {};
      for (var j = 0, jj = this.attributes.length; j < jj; j++) {
        var attribute = this.attributes[j];
        if (attribute.name.substring(0, 5) != 'data-')
          continue;
        var key = attribute.name.substring(5).replace(/\-([a-z])/g,
          function(all, ch) { return ch.toUpperCase(); });
        dataset[key] = attribute.value;
      }

      Object.defineProperty(this, '_dataset', {
        value: dataset,
        writable: false,
        enumerable: false
      });
      return dataset;
    },
    enumerable: true
  });
})();

// HTMLElement classList property
(function checkClassListProperty() {
  var div = document.createElement('div');
  if ('classList' in div)
    return; // classList property exists

  function changeList(element, itemName, add, remove) {
    var s = element.className || '';
    var list = s.split(/\s+/g);
    if (list[0] == '') list.shift();
    var index = list.indexOf(itemName);
    if (index < 0 && add)
      list.push(itemName);
    if (index >= 0 && remove)
      list.splice(index, 1);
    element.className = list.join(' ');
  }

  var classListPrototype = {
    add: function(name) {
      changeList(this.element, name, true, false);
    },
    remove: function(name) {
      changeList(this.element, name, false, true);
    },
    toggle: function(name) {
      changeList(this.element, name, true, true);
    }
  };

  Object.defineProperty(HTMLElement.prototype, 'classList', {
    get: function() {
      if (this._classList)
        return this._classList;

      var classList = Object.create(classListPrototype, {
        element: {
          value: this,
          writable: false,
          enumerable: true
        }
      });
      Object.defineProperty(this, '_classList', {
        value: classList,
        writable: false,
        enumerable: false
      });
      return classList;
    },
    enumerable: true
  });
})();

// Check console compatability
(function checkConsoleCompatibility() {
  if (typeof console == 'undefined') {
    console = {
      log: function() {},
      error: function() {}
    };
  } else if (!('bind' in console.log)) {
    // native functions in IE9 might not have bind
    console.log = (function(fn) {
      return function(msg) { return fn(msg); }
    })(console.log);
    console.error = (function(fn) {
      return function(msg) { return fn(msg); }
    })(console.error);
  }
})();

// Check onclick compatibility in Opera
(function checkOnClickCompatibility() {
  // workaround for reported Opera bug DSK-354448:
  // onclick fires on disabled buttons with opaque content
  function ignoreIfTargetDisabled(event) {
    if (isDisabled(event.target)) {
      event.stopPropagation();
    }
  }
  function isDisabled(node) {
    return node.disabled || (node.parentNode && isDisabled(node.parentNode));
  }
  if (navigator.userAgent.indexOf('Opera') != -1) {
    // use browser detection since we cannot feature-check this bug
    document.addEventListener('click', ignoreIfTargetDisabled, true);
  }
})();

// Checks if navigator.language is supported
(function checkNavigatorLanguage() {
  if ('language' in navigator)
    return;
  Object.defineProperty(navigator, 'language', {
    get: function navigatorLanguage() {
      var language = navigator.userLanguage || 'en-US';
      return language.substring(0, 2).toLowerCase() +
        language.substring(2).toUpperCase();
    },
    enumerable: true
  });
})();
