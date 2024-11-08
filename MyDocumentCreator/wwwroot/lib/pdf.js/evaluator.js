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

var PartialEvaluator = (function PartialEvaluatorClosure() {
  function PartialEvaluator(xref, handler, pageIndex, uniquePrefix) {
    this.state = new EvalState();
    this.stateStack = [];

    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.uniquePrefix = uniquePrefix;
    this.objIdCounter = 0;
    this.fontIdCounter = 0;
  }

  var OP_MAP = {
    // Graphics state
    w: 'setLineWidth',
    J: 'setLineCap',
    j: 'setLineJoin',
    M: 'setMiterLimit',
    d: 'setDash',
    ri: 'setRenderingIntent',
    i: 'setFlatness',
    gs: 'setGState',
    q: 'save',
    Q: 'restore',
    cm: 'transform',

    // Path
    m: 'moveTo',
    l: 'lineTo',
    c: 'curveTo',
    v: 'curveTo2',
    y: 'curveTo3',
    h: 'closePath',
    re: 'rectangle',
    S: 'stroke',
    s: 'closeStroke',
    f: 'fill',
    F: 'fill',
    'f*': 'eoFill',
    B: 'fillStroke',
    'B*': 'eoFillStroke',
    b: 'closeFillStroke',
    'b*': 'closeEOFillStroke',
    n: 'endPath',

    // Clipping
    W: 'clip',
    'W*': 'eoClip',

    // Text
    BT: 'beginText',
    ET: 'endText',
    Tc: 'setCharSpacing',
    Tw: 'setWordSpacing',
    Tz: 'setHScale',
    TL: 'setLeading',
    Tf: 'setFont',
    Tr: 'setTextRenderingMode',
    Ts: 'setTextRise',
    Td: 'moveText',
    TD: 'setLeadingMoveText',
    Tm: 'setTextMatrix',
    'T*': 'nextLine',
    Tj: 'showText',
    TJ: 'showSpacedText',
    "'": 'nextLineShowText',
    '"': 'nextLineSetSpacingShowText',

    // Type3 fonts
    d0: 'setCharWidth',
    d1: 'setCharWidthAndBounds',

    // Color
    CS: 'setStrokeColorSpace',
    cs: 'setFillColorSpace',
    SC: 'setStrokeColor',
    SCN: 'setStrokeColorN',
    sc: 'setFillColor',
    scn: 'setFillColorN',
    G: 'setStrokeGray',
    g: 'setFillGray',
    RG: 'setStrokeRGBColor',
    rg: 'setFillRGBColor',
    K: 'setStrokeCMYKColor',
    k: 'setFillCMYKColor',

    // Shading
    sh: 'shadingFill',

    // Images
    BI: 'beginInlineImage',
    ID: 'beginImageData',
    EI: 'endInlineImage',

    // XObjects
    Do: 'paintXObject',

    // Marked content
    MP: 'markPoint',
    DP: 'markPointProps',
    BMC: 'beginMarkedContent',
    BDC: 'beginMarkedContentProps',
    EMC: 'endMarkedContent',

    // Compatibility
    BX: 'beginCompat',
    EX: 'endCompat',

    // (reserved partial commands for the lexer)
    BM: null,
    BD: null,
    'true': null,
    fa: null,
    fal: null,
    fals: null,
    'false': null,
    nu: null,
    nul: null,
    'null': null
  };

  PartialEvaluator.prototype = {
    loadFont: function PartialEvaluator_loadFont(fontName, font, xref,
                                                 resources, dependency) {
      var fontRes = resources.get('Font');

      assert(fontRes, 'fontRes not available');

      ++this.fontIdCounter;

      font = xref.fetchIfRef(font) || fontRes.get(fontName);
      if (!isDict(font)) {
        return {
          translated: new ErrorFont('Font ' + fontName + ' is not available'),
          loadedName: 'g_font_' + this.uniquePrefix + this.fontIdCounter
        };
      }

      var loadedName = font.loadedName;
      if (!loadedName) {
        // keep track of each font we translated so the caller can
        // load them asynchronously before calling display on a page
        loadedName = 'g_font_' + this.uniquePrefix + this.fontIdCounter;
        font.loadedName = loadedName;

        var translated;
        try {
          translated = this.translateFont(font, xref, resources,
                                          dependency);
        } catch (e) {
          translated = new ErrorFont(e instanceof Error ? e.message : e);
        }
        font.translated = translated;

        var data = translated;
        if (data.loadCharProcs) {
          delete data.loadCharProcs;

          var charProcs = font.get('CharProcs').getAll();
          var fontResources = font.get('Resources') || resources;
          var charProcOperatorList = {};
          for (var key in charProcs) {
            var glyphStream = charProcs[key];
            charProcOperatorList[key] =
              this.getOperatorList(glyphStream, fontResources, dependency);
          }
          data.charProcOperatorList = charProcOperatorList;
        }
      }
      return font;
    },

    getOperatorList: function PartialEvaluator_getOperatorList(stream,
                                                               resources,
                                                               dependency,
                                                               queue) {

      var self = this;
      var xref = this.xref;
      var handler = this.handler;
      var pageIndex = this.pageIndex;
      var uniquePrefix = this.uniquePrefix || '';

      function insertDependency(depList) {
        fnArray.push('dependency');
        argsArray.push(depList);
        for (var i = 0, ii = depList.length; i < ii; i++) {
          var dep = depList[i];
          if (dependency.indexOf(dep) == -1) {
            dependency.push(depList[i]);
          }
        }
      }

      function handleSetFont(fontName, font) {
        font = self.loadFont(fontName, font, xref, resources, dependency);

        var loadedName = font.loadedName;
        if (!font.sent) {
          var data = font.translated.exportData();

          handler.send('commonobj', [
              loadedName,
              'Font',
              data
          ]);
          font.sent = true;
        }

        // Ensure the font is ready before the font is set
        // and later on used for drawing.
        // OPTIMIZE: This should get insert to the operatorList only once per
        // page.
        insertDependency([loadedName]);
        return loadedName;
      }

      function buildPaintImageXObject(image, inline) {
        var dict = image.dict;
        var w = dict.get('Width', 'W');
        var h = dict.get('Height', 'H');

        var imageMask = dict.get('ImageMask', 'IM') || false;
        if (imageMask) {
          // This depends on a tmpCanvas beeing filled with the
          // current fillStyle, such that processing the pixel
          // data can't be done here. Instead of creating a
          // complete PDFImage, only read the information needed
          // for later.

          var width = dict.get('Width', 'W');
          var height = dict.get('Height', 'H');
          var bitStrideLength = (width + 7) >> 3;
          var imgArray = image.getBytes(bitStrideLength * height);
          var decode = dict.get('Decode', 'D');
          var inverseDecode = !!decode && decode[0] > 0;

          fn = 'paintImageMaskXObject';
          args = [imgArray, inverseDecode, width, height];
          return;
        }

        var softMask = dict.get('SMask', 'SM') || false;
        var mask = dict.get('Mask') || false;

        var SMALL_IMAGE_DIMENSIONS = 200;
        // Inlining small images into the queue as RGB data
        if (inline && !softMask && !mask &&
            !(image instanceof JpegStream) &&
            (w + h) < SMALL_IMAGE_DIMENSIONS) {
          var imageObj = new PDFImage(xref, resources, image,
                                      inline, null, null);
          var imgData = imageObj.getImageData();
          fn = 'paintInlineImageXObject';
          args = [imgData];
          return;
        }

        // If there is no imageMask, create the PDFImage and a lot
        // of image processing can be done here.
        var objId = 'img_' + uniquePrefix + (++self.objIdCounter);
        insertDependency([objId]);
        args = [objId, w, h];

        if (!softMask && !mask && image instanceof JpegStream &&
            image.isNativelySupported(xref, resources)) {
          // These JPEGs don't need any more processing so we can just send it.
          fn = 'paintJpegXObject';
          handler.send('obj', [objId, pageIndex, 'JpegStream', image.getIR()]);
          return;
        }

        fn = 'paintImageXObject';

        PDFImage.buildImage(function(imageObj) {
            var imgData = imageObj.getImageData();
            handler.send('obj', [objId, pageIndex, 'Image', imgData]);
          }, handler, xref, resources, image, inline);
      }

      if (!queue)
        queue = {};

      if (!queue.argsArray) {
        queue.argsArray = [];
      }
      if (!queue.fnArray) {
        queue.fnArray = [];
      }

      var fnArray = queue.fnArray, argsArray = queue.argsArray;
      var dependencyArray = dependency || [];

      resources = resources || new Dict();
      var xobjs = resources.get('XObject') || new Dict();
      var patterns = resources.get('Pattern') || new Dict();
      var parser = new Parser(new Lexer(stream, OP_MAP), false, xref);
      var res = resources;
      var args = [], obj;
      var TILING_PATTERN = 1, SHADING_PATTERN = 2;

      while (true) {
        obj = parser.getObj();
        if (isEOF(obj))
          break;

        if (isCmd(obj)) {
          var cmd = obj.cmd;
          var fn = OP_MAP[cmd];
          assertWellFormed(fn, 'Unknown command "' + cmd + '"');
          // TODO figure out how to type-check vararg functions

          if ((cmd == 'SCN' || cmd == 'scn') && !args[args.length - 1].code) {
            // compile tiling patterns
            var patternName = args[args.length - 1];
            // SCN/scn applies patterns along with normal colors
            if (isName(patternName)) {
              var pattern = patterns.get(patternName.name);
              if (pattern) {
                var dict = isStream(pattern) ? pattern.dict : pattern;
                var typeNum = dict.get('PatternType');

                if (typeNum == TILING_PATTERN) {
                  // Create an IR of the pattern code.
                  var depIdx = dependencyArray.length;
                  var operatorList = this.getOperatorList(pattern,
                      dict.get('Resources') || resources, dependencyArray);

                  // Add the dependencies that are required to execute the
                  // operatorList.
                  insertDependency(dependencyArray.slice(depIdx));

                  args = TilingPattern.getIR(operatorList, dict, args);
                }
                else if (typeNum == SHADING_PATTERN) {
                  var shading = dict.get('Shading');
                  var matrix = dict.get('Matrix');
                  var pattern = Pattern.parseShading(shading, matrix, xref,
                                                     res);
                  args = pattern.getIR();
                } else {
                  error('Unkown PatternType ' + typeNum);
                }
              }
            }
          } else if (cmd == 'Do' && !args[0].code) {
            // eagerly compile XForm objects
            var name = args[0].name;
            var xobj = xobjs.get(name);
            if (xobj) {
              assertWellFormed(isStream(xobj), 'XObject should be a stream');

              var type = xobj.dict.get('Subtype');
              assertWellFormed(
                isName(type),
                'XObject should have a Name subtype'
              );

              if ('Form' == type.name) {
                var matrix = xobj.dict.get('Matrix');
                var bbox = xobj.dict.get('BBox');

                fnArray.push('paintFormXObjectBegin');
                argsArray.push([matrix, bbox]);

                // This adds the operatorList of the xObj to the current queue.
                var depIdx = dependencyArray.length;

                // Pass in the current `queue` object. That means the `fnArray`
                // and the `argsArray` in this scope is reused and new commands
                // are added to them.
                this.getOperatorList(xobj,
                    xobj.dict.get('Resources') || resources,
                    dependencyArray, queue);

               // Add the dependencies that are required to execute the
               // operatorList.
               insertDependency(dependencyArray.slice(depIdx));

                fn = 'paintFormXObjectEnd';
                args = [];
              } else if ('Image' == type.name) {
                buildPaintImageXObject(xobj, false);
              } else {
                error('Unhandled XObject subtype ' + type.name);
              }
            }
          } else if (cmd == 'Tf') { // eagerly collect all fonts
            args[0] = handleSetFont(args[0].name);
          } else if (cmd == 'EI') {
            buildPaintImageXObject(args[0], true);
          }

          switch (fn) {
            // Parse the ColorSpace data to a raw format.
            case 'setFillColorSpace':
            case 'setStrokeColorSpace':
              args = [ColorSpace.parseToIR(args[0], xref, resources)];
              break;
            case 'shadingFill':
              var shadingRes = res.get('Shading');
              if (!shadingRes)
                error('No shading resource found');

              var shading = shadingRes.get(args[0].name);
              if (!shading)
                error('No shading object found');

              var shadingFill = Pattern.parseShading(shading, null, xref, res);
              var patternIR = shadingFill.getIR();
              args = [patternIR];
              fn = 'shadingFill';
              break;
            case 'setGState':
              var dictName = args[0];
              var extGState = resources.get('ExtGState');

              if (!isDict(extGState) || !extGState.has(dictName.name))
                break;

              var gsState = extGState.get(dictName.name);

              // This array holds the converted/processed state data.
              var gsStateObj = [];

              gsState.forEach(
                function canvasGraphicsSetGStateForEach(key, value) {
                  switch (key) {
                    case 'Type':
                      break;
                    case 'LW':
                    case 'LC':
                    case 'LJ':
                    case 'ML':
                    case 'D':
                    case 'RI':
                    case 'FL':
                    case 'CA':
                    case 'ca':
                      gsStateObj.push([key, value]);
                      break;
                    case 'Font':
                      gsStateObj.push([
                        'Font',
                        handleSetFont(null, value[0]),
                        value[1]
                      ]);
                      break;
                    case 'BM':
                      // We support the default so don't trigger the TODO.
                      if (!isName(value) || value.name != 'Normal')
                        TODO('graphic state operator ' + key);
                      break;
                    case 'SMask':
                      // We support the default so don't trigger the TODO.
                      if (!isName(value) || value.name != 'None')
                        TODO('graphic state operator ' + key);
                      break;
                    // Only generate info log messages for the following since
                    // they are unlikey to have a big impact on the rendering.
                    case 'OP':
                    case 'op':
                    case 'OPM':
                    case 'BG':
                    case 'BG2':
                    case 'UCR':
                    case 'UCR2':
                    case 'TR':
                    case 'TR2':
                    case 'HT':
                    case 'SM':
                    case 'SA':
                    case 'AIS':
                    case 'TK':
                      // TODO implement these operators.
                      info('graphic state operator ' + key);
                      break;
                    default:
                      info('Unknown graphic state operator ' + key);
                      break;
                  }
                }
              );
              args = [gsStateObj];
              break;
          } // switch

          fnArray.push(fn);
          argsArray.push(args);
          args = [];
        } else if (obj != null) {
          assertWellFormed(args.length <= 33, 'Too many arguments');
          args.push(obj instanceof Dict ? obj.getAll() : obj);
        }
      }

      return queue;
    },

    optimizeQueue: function PartialEvaluator_optimizeQueue(queue) {
      var fnArray = queue.fnArray, argsArray = queue.argsArray;
      // grouping paintInlineImageXObject's into paintInlineImageXObjectGroup
      // searching for (save, transform, paintInlineImageXObject, restore)+
      var MIN_IMAGES_IN_INLINE_IMAGES_BLOCK = 10;
      var MAX_IMAGES_IN_INLINE_IMAGES_BLOCK = 200;
      var MAX_WIDTH = 1000;
      var IMAGE_PADDING = 1;
      for (var i = 0, ii = fnArray.length; i < ii; i++) {
        if (fnArray[i] === 'paintInlineImageXObject' &&
            fnArray[i - 2] === 'save' && fnArray[i - 1] === 'transform' &&
            fnArray[i + 1] === 'restore') {
          var j = i - 2;
          for (i += 2; i < ii && fnArray[i - 4] === fnArray[i]; i++) {
          }
          var count = Math.min((i - j) >> 2,
                               MAX_IMAGES_IN_INLINE_IMAGES_BLOCK);
          if (count < MIN_IMAGES_IN_INLINE_IMAGES_BLOCK) {
            continue;
          }
          // assuming that heights of those image is too small (~1 pixel)
          // packing as much as possible by lines
          var maxX = 0;
          var map = [], maxLineHeight = 0;
          var currentX = IMAGE_PADDING, currentY = IMAGE_PADDING;
          for (var q = 0; q < count; q++) {
            var transform = argsArray[j + (q << 2) + 1];
            var img = argsArray[j + (q << 2) + 2][0];
            if (currentX + img.width > MAX_WIDTH) {
              // starting new line
              maxX = Math.max(maxX, currentX);
              currentY += maxLineHeight + 2 * IMAGE_PADDING;
              currentX = 0;
              maxLineHeight = 0;
            }
            map.push({
              transform: transform,
              x: currentX, y: currentY,
              w: img.width, h: img.height
            });
            currentX += img.width + 2 * IMAGE_PADDING;
            maxLineHeight = Math.max(maxLineHeight, img.height);
          }
          var imgWidth = Math.max(maxX, currentX) + IMAGE_PADDING;
          var imgHeight = currentY + maxLineHeight + IMAGE_PADDING;
          var imgData = new Uint8Array(imgWidth * imgHeight * 4);
          var imgRowSize = imgWidth << 2;
          for (var q = 0; q < count; q++) {
            var data = argsArray[j + (q << 2) + 2][0].data;
            // copy image by lines and extends pixels into padding
            var rowSize = map[q].w << 2;
            var dataOffset = 0;
            var offset = (map[q].x + map[q].y * imgWidth) << 2;
            imgData.set(
              data.subarray(0, rowSize), offset - imgRowSize);
            for (var k = 0, kk = map[q].h; k < kk; k++) {
              imgData.set(
                data.subarray(dataOffset, dataOffset + rowSize), offset);
              dataOffset += rowSize;
              offset += imgRowSize;
            }
            imgData.set(
              data.subarray(dataOffset - rowSize, dataOffset), offset);
            while (offset >= 0) {
              data[offset - 4] = data[offset];
              data[offset - 3] = data[offset + 1];
              data[offset - 2] = data[offset + 2];
              data[offset - 1] = data[offset + 3];
              data[offset + rowSize] = data[offset + rowSize - 4];
              data[offset + rowSize + 1] = data[offset + rowSize - 3];
              data[offset + rowSize + 2] = data[offset + rowSize - 2];
              data[offset + rowSize + 3] = data[offset + rowSize - 1];
              offset -= imgRowSize;
            }
          }
          // replacing queue items
          fnArray.splice(j, count * 4, ['paintInlineImageXObjectGroup']);
          argsArray.splice(j, count * 4,
            [{width: imgWidth, height: imgHeight, data: imgData}, map]);
          i = j;
          ii = fnArray.length;
        }
      }
      // grouping paintImageMaskXObject's into paintImageMaskXObjectGroup
      // searching for (save, transform, paintImageMaskXObject, restore)+
      var MIN_IMAGES_IN_MASKS_BLOCK = 10;
      var MAX_IMAGES_IN_MASKS_BLOCK = 100;
      for (var i = 0, ii = fnArray.length; i < ii; i++) {
        if (fnArray[i] === 'paintImageMaskXObject' &&
            fnArray[i - 2] === 'save' && fnArray[i - 1] === 'transform' &&
            fnArray[i + 1] === 'restore') {
          var j = i - 2;
          for (i += 2; i < ii && fnArray[i - 4] === fnArray[i]; i++) {
          }
          var count = Math.min((i - j) >> 2,
                               MAX_IMAGES_IN_MASKS_BLOCK);
          if (count < MIN_IMAGES_IN_MASKS_BLOCK) {
            continue;
          }
          var images = [];
          for (var q = 0; q < count; q++) {
            var transform = argsArray[j + (q << 2) + 1];
            var maskParams = argsArray[j + (q << 2) + 2];
            images.push({data: maskParams[0], width: maskParams[2],
              height: maskParams[3], transform: transform,
              inverseDecode: maskParams[1]});
          }
          // replacing queue items
          fnArray.splice(j, count * 4, ['paintImageMaskXObjectGroup']);
          argsArray.splice(j, count * 4, [images]);
          i = j;
          ii = fnArray.length;
        }
      }
    },

    getTextContent: function PartialEvaluator_getTextContent(
                                                    stream, resources, state) {
      var bidiTexts;
      var SPACE_FACTOR = 0.35;
      var MULTI_SPACE_FACTOR = 1.5;

      if (!state) {
        bidiTexts = [];
        state = {
          bidiTexts: bidiTexts
        };
      } else {
        bidiTexts = state.bidiTexts;
      }

      var self = this;
      var xref = this.xref;

      function handleSetFont(fontName, fontRef) {
        return self.loadFont(fontName, fontRef, xref, resources, null);
      }

      resources = xref.fetchIfRef(resources) || new Dict();
      // The xobj is parsed iff it's needed, e.g. if there is a `DO` cmd.
      var xobjs = null;

      var parser = new Parser(new Lexer(stream), false);
      var res = resources;
      var args = [], obj;

      var chunk = '';
      var font = null;
      while (!isEOF(obj = parser.getObj())) {
        if (isCmd(obj)) {
          var cmd = obj.cmd;
          switch (cmd) {
            // TODO: Add support for SAVE/RESTORE and XFORM here.
            case 'Tf':
              font = handleSetFont(args[0].name).translated;
              break;
            case 'TJ':
              var items = args[0];
              for (var j = 0, jj = items.length; j < jj; j++) {
                if (typeof items[j] === 'string') {
                  chunk += fontCharsToUnicode(items[j], font);
                } else if (items[j] < 0 && font.spaceWidth > 0) {
                  var fakeSpaces = -items[j] / font.spaceWidth;
                  if (fakeSpaces > MULTI_SPACE_FACTOR) {
                    fakeSpaces = Math.round(fakeSpaces);
                    while (fakeSpaces--) {
                      chunk += ' ';
                    }
                  } else if (fakeSpaces > SPACE_FACTOR) {
                    chunk += ' ';
                  }
                }
              }
              break;
            case 'Tj':
              chunk += fontCharsToUnicode(args[0], font);
              break;
            case "'":
              // For search, adding a extra white space for line breaks would be
              // better here, but that causes too much spaces in the
              // text-selection divs.
              chunk += fontCharsToUnicode(args[0], font);
              break;
            case '"':
              // Note comment in "'"
              chunk += fontCharsToUnicode(args[2], font);
              break;
            case 'Do':
              // Set the chunk such that the following if won't add something
              // to the state.
              chunk = '';

              if (args[0].code) {
                break;
              }

              if (!xobjs) {
                xobjs = resources.get('XObject') || new Dict();
              }

              var name = args[0].name;
              var xobj = xobjs.get(name);
              if (!xobj)
                break;
              assertWellFormed(isStream(xobj), 'XObject should be a stream');

              var type = xobj.dict.get('Subtype');
              assertWellFormed(
                isName(type),
                'XObject should have a Name subtype'
              );

              if ('Form' !== type.name)
                break;

              state = this.getTextContent(
                xobj,
                xobj.dict.get('Resources') || resources,
                state
              );
              break;
            case 'gs':
              var dictName = args[0];
              var extGState = resources.get('ExtGState');

              if (!isDict(extGState) || !extGState.has(dictName.name))
                break;

              var gsState = extGState.get(dictName.name);

              for (var i = 0; i < gsState.length; i++) {
                if (gsState[i] === 'Font') {
                  font = handleSetFont(args[0].name).translated;
                }
              }
              break;
          } // switch

          if (chunk !== '') {
            bidiTexts.push(PDFJS.bidi(chunk, -1));

            chunk = '';
          }

          args = [];
        } else if (obj != null) {
          assertWellFormed(args.length <= 33, 'Too many arguments');
          args.push(obj);
        }
      } // while

      return state;
    },

    extractDataStructures: function
      partialEvaluatorExtractDataStructures(dict, baseDict,
                                            xref, properties) {
      // 9.10.2
      var toUnicode = dict.get('ToUnicode') ||
        baseDict.get('ToUnicode');
      if (toUnicode)
        properties.toUnicode = this.readToUnicode(toUnicode, xref, properties);

      if (properties.composite) {
        // CIDSystemInfo helps to match CID to glyphs
        var cidSystemInfo = dict.get('CIDSystemInfo');
        if (isDict(cidSystemInfo)) {
          properties.cidSystemInfo = {
            registry: cidSystemInfo.get('Registry'),
            ordering: cidSystemInfo.get('Ordering'),
            supplement: cidSystemInfo.get('Supplement')
          };
        }

        var cidToGidMap = dict.get('CIDToGIDMap');
        if (isStream(cidToGidMap))
          properties.cidToGidMap = this.readCidToGidMap(cidToGidMap);
      }

      var flags = properties.flags;
      var differences = [];
      var baseEncoding = Encodings.StandardEncoding;
      // The Symbolic attribute can be misused for regular fonts
      // Heuristic: we have to check if the font is a standard one also
      if (!!(flags & FontFlags.Symbolic)) {
        baseEncoding = !properties.file ? Encodings.symbolsEncoding :
                                          Encodings.MacRomanEncoding;
      }
      var hasEncoding = dict.has('Encoding');
      if (hasEncoding) {
        var encoding = dict.get('Encoding');
        if (isDict(encoding)) {
          var baseName = encoding.get('BaseEncoding');
          if (baseName)
            baseEncoding = Encodings[baseName.name];
          else
            hasEncoding = false; // base encoding was not provided

          // Load the differences between the base and original
          if (encoding.has('Differences')) {
            var diffEncoding = encoding.get('Differences');
            var index = 0;
            for (var j = 0, jj = diffEncoding.length; j < jj; j++) {
              var data = diffEncoding[j];
              if (isNum(data))
                index = data;
              else
                differences[index++] = data.name;
            }
          }
        } else if (isName(encoding)) {
          baseEncoding = Encodings[encoding.name];
        } else {
          error('Encoding is not a Name nor a Dict');
        }
      }

      properties.differences = differences;
      properties.baseEncoding = baseEncoding;
      properties.hasEncoding = hasEncoding;
    },

    readToUnicode: function PartialEvaluator_readToUnicode(toUnicode, xref,
                                                           properties) {
      var cmapObj = toUnicode;
      var charToUnicode = [];
      if (isName(cmapObj)) {
        var isIdentityMap = cmapObj.name.substr(0, 9) == 'Identity-';
        if (!isIdentityMap)
          error('ToUnicode file cmap translation not implemented');
      } else if (isStream(cmapObj)) {
        var tokens = [];
        var token = '';
        var beginArrayToken = {};

        var cmap = cmapObj.getBytes(cmapObj.length);
        for (var i = 0, ii = cmap.length; i < ii; i++) {
          var octet = cmap[i];
          if (octet == 0x20 || octet == 0x0D || octet == 0x0A ||
              octet == 0x3C || octet == 0x5B || octet == 0x5D) {
            switch (token) {
              case 'usecmap':
                error('usecmap is not implemented');
                break;

              case 'beginbfchar':
              case 'beginbfrange':
              case 'begincidchar':
              case 'begincidrange':
                token = '';
                tokens = [];
                break;

              case 'endcidrange':
              case 'endbfrange':
                for (var j = 0, jj = tokens.length; j < jj; j += 3) {
                  var startRange = tokens[j];
                  var endRange = tokens[j + 1];
                  var code = tokens[j + 2];
                  if (code == 0xFFFF) {
                    // CMap is broken, assuming code == startRange
                    code = startRange;
                  }
                  if (isArray(code)) {
                    var codeindex = 0;
                    while (startRange <= endRange) {
                      charToUnicode[startRange] = code[codeindex++];
                      ++startRange;
                    }
                  } else {
                    while (startRange <= endRange) {
                      charToUnicode[startRange] = code++;
                      ++startRange;
                    }
                  }
                }
                break;

              case 'endcidchar':
              case 'endbfchar':
                for (var j = 0, jj = tokens.length; j < jj; j += 2) {
                  var index = tokens[j];
                  var code = tokens[j + 1];
                  charToUnicode[index] = code;
                }
                break;

              case '':
                break;

              default:
                if (token[0] >= '0' && token[0] <= '9')
                  token = parseInt(token, 10); // a number
                tokens.push(token);
                token = '';
            }
            switch (octet) {
              case 0x5B:
                // begin list parsing
                tokens.push(beginArrayToken);
                break;
              case 0x5D:
                // collect array items
                var items = [], item;
                while (tokens.length &&
                       (item = tokens.pop()) != beginArrayToken)
                  items.unshift(item);
                tokens.push(items);
                break;
            }
          } else if (octet == 0x3E) {
            if (token.length) {
              // Heuristic: guessing chars size by checking numbers sizes
              // in the CMap entries.
              if (token.length == 2 && properties.composite)
                properties.wideChars = false;

              if (token.length <= 4) {
                // parsing hex number
                tokens.push(parseInt(token, 16));
                token = '';
              } else {
                // parsing hex UTF-16BE numbers
                var str = [];
                for (var k = 0, kk = token.length; k < kk; k += 4) {
                  var b = parseInt(token.substr(k, 4), 16);
                  if (b <= 0x10) {
                    k += 4;
                    b = (b << 16) | parseInt(token.substr(k, 4), 16);
                    b -= 0x10000;
                    str.push(0xD800 | (b >> 10));
                    str.push(0xDC00 | (b & 0x3FF));
                    break;
                  }
                  str.push(b);
                }
                tokens.push(String.fromCharCode.apply(String, str));
                token = '';
              }
            }
          } else {
            token += String.fromCharCode(octet);
          }
        }
      }
      return charToUnicode;
    },
    readCidToGidMap: function PartialEvaluator_readCidToGidMap(cidToGidStream) {
      // Extract the encoding from the CIDToGIDMap
      var glyphsData = cidToGidStream.getBytes();

      // Set encoding 0 to later verify the font has an encoding
      var result = [];
      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = (glyphsData[j++] << 8) | glyphsData[j];
        if (glyphID == 0)
          continue;

        var code = j >> 1;
        result[code] = glyphID;
      }
      return result;
    },

    extractWidths: function PartialEvaluator_extractWidths(dict,
                                                   xref,
                                                   descriptor,
                                                   properties) {
      var glyphsWidths = [];
      var defaultWidth = 0;
      if (properties.composite) {
        defaultWidth = dict.get('DW') || 1000;

        var widths = dict.get('W');
        if (widths) {
          var start = 0, end = 0;
          for (var i = 0, ii = widths.length; i < ii; i++) {
            var code = xref.fetchIfRef(widths[i]);
            if (isArray(code)) {
              for (var j = 0, jj = code.length; j < jj; j++)
                glyphsWidths[start++] = code[j];
              start = 0;
            } else if (start) {
              var width = widths[++i];
              for (var j = start; j <= code; j++)
                glyphsWidths[j] = width;
              start = 0;
            } else {
              start = code;
            }
          }
        }
      } else {
        var firstChar = properties.firstChar;
        var widths = dict.get('Widths');
        if (widths) {
          var j = firstChar;
          for (var i = 0, ii = widths.length; i < ii; i++)
            glyphsWidths[j++] = widths[i];
          defaultWidth = parseFloat(descriptor.get('MissingWidth')) || 0;
        } else {
          // Trying get the BaseFont metrics (see comment above).
          var baseFontName = dict.get('BaseFont');
          if (isName(baseFontName)) {
            var metrics = this.getBaseFontMetrics(baseFontName.name);

            glyphsWidths = metrics.widths;
            defaultWidth = metrics.defaultWidth;
          }
        }
      }

      // Heuristic: detection of monospace font by checking all non-zero widths
      var isMonospace = true, firstWidth = defaultWidth;
      for (var glyph in glyphsWidths) {
        var glyphWidth = glyphsWidths[glyph];
        if (!glyphWidth)
          continue;
        if (!firstWidth) {
          firstWidth = glyphWidth;
          continue;
        }
        if (firstWidth != glyphWidth) {
          isMonospace = false;
          break;
        }
      }
      if (isMonospace)
        properties.flags |= FontFlags.FixedPitch;

      properties.defaultWidth = defaultWidth;
      properties.widths = glyphsWidths;
    },

    getBaseFontMetrics: function PartialEvaluator_getBaseFontMetrics(name) {
      var defaultWidth = 0, widths = [], monospace = false;
      var glyphWidths = Metrics[stdFontMap[name] || name];
      if (isNum(glyphWidths)) {
        defaultWidth = glyphWidths;
        monospace = true;
      } else {
        widths = glyphWidths;
      }

      return {
        defaultWidth: defaultWidth,
        monospace: monospace,
        widths: widths
      };
    },

    translateFont: function PartialEvaluator_translateFont(dict,
                                                           xref,
                                                           resources,
                                                           dependency) {
      var baseDict = dict;
      var type = dict.get('Subtype');
      assertWellFormed(isName(type), 'invalid font Subtype');

      var composite = false;
      if (type.name == 'Type0') {
        // If font is a composite
        //  - get the descendant font
        //  - set the type according to the descendant font
        //  - get the FontDescriptor from the descendant font
        var df = dict.get('DescendantFonts');
        if (!df)
          error('Descendant fonts are not specified');

        dict = isArray(df) ? xref.fetchIfRef(df[0]) : df;

        type = dict.get('Subtype');
        assertWellFormed(isName(type), 'invalid font Subtype');
        composite = true;
      }
      var maxCharIndex = composite ? 0xFFFF : 0xFF;

      var descriptor = dict.get('FontDescriptor');
      if (!descriptor) {
        if (type.name == 'Type3') {
          // FontDescriptor is only required for Type3 fonts when the document
          // is a tagged pdf. Create a barbebones one to get by.
          descriptor = new Dict();
          descriptor.set('FontName', new Name(type.name));
        } else {
          // Before PDF 1.5 if the font was one of the base 14 fonts, having a
          // FontDescriptor was not required.
          // This case is here for compatibility.
          var baseFontName = dict.get('BaseFont');
          if (!isName(baseFontName))
            error('Base font is not specified');

          // Using base font name as a font name.
          baseFontName = baseFontName.name.replace(/[,_]/g, '-');
          var metrics = this.getBaseFontMetrics(baseFontName);

          // Simulating descriptor flags attribute
          var fontNameWoStyle = baseFontName.split('-')[0];
          var flags = (serifFonts[fontNameWoStyle] ||
            (fontNameWoStyle.search(/serif/gi) != -1) ? FontFlags.Serif : 0) |
            (metrics.monospace ? FontFlags.FixedPitch : 0) |
            (symbolsFonts[fontNameWoStyle] ? FontFlags.Symbolic :
            FontFlags.Nonsymbolic);

          var properties = {
            type: type.name,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            flags: flags,
            firstChar: 0,
            lastChar: maxCharIndex
          };
          this.extractDataStructures(dict, dict, xref, properties);

          return new Font(baseFontName, null, properties);
        }
      }

      // According to the spec if 'FontDescriptor' is declared, 'FirstChar',
      // 'LastChar' and 'Widths' should exist too, but some PDF encoders seem
      // to ignore this rule when a variant of a standart font is used.
      // TODO Fill the width array depending on which of the base font this is
      // a variant.
      var firstChar = dict.get('FirstChar') || 0;
      var lastChar = dict.get('LastChar') || maxCharIndex;
      var fontName = descriptor.get('FontName');
      // Some bad pdf's have a string as the font name.
      if (isString(fontName))
        fontName = new Name(fontName);
      assertWellFormed(isName(fontName), 'invalid font name');

      var fontFile = descriptor.get('FontFile', 'FontFile2', 'FontFile3');
      if (fontFile) {
        if (fontFile.dict) {
          var subtype = fontFile.dict.get('Subtype');
          if (subtype)
            subtype = subtype.name;

          var length1 = fontFile.dict.get('Length1');

          var length2 = fontFile.dict.get('Length2');
        }
      }

      var properties = {
        type: type.name,
        subtype: subtype,
        file: fontFile,
        length1: length1,
        length2: length2,
        loadedName: baseDict.loadedName,
        composite: composite,
        wideChars: composite,
        fixedPitch: false,
        fontMatrix: dict.get('FontMatrix') || IDENTITY_MATRIX,
        firstChar: firstChar || 0,
        lastChar: lastChar || maxCharIndex,
        bbox: descriptor.get('FontBBox'),
        ascent: descriptor.get('Ascent'),
        descent: descriptor.get('Descent'),
        xHeight: descriptor.get('XHeight'),
        capHeight: descriptor.get('CapHeight'),
        flags: descriptor.get('Flags'),
        italicAngle: descriptor.get('ItalicAngle'),
        coded: false
      };
      this.extractWidths(dict, xref, descriptor, properties);
      this.extractDataStructures(dict, baseDict, xref, properties);

      if (type.name === 'Type3') {
        properties.coded = true;
      }

      return new Font(fontName.name, fontFile, properties);
    }
  };

  return PartialEvaluator;
})();

var EvalState = (function EvalStateClosure() {
  function EvalState() {
    // Are soft masks and alpha values shapes or opacities?
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.textMatrix = IDENTITY_MATRIX;
    this.leading = 0;
    // Start of text line (in text coordinates)
    this.lineX = 0;
    this.lineY = 0;
    // Character and word spacing
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.textHScale = 1;
    // Color spaces
    this.fillColorSpace = null;
    this.strokeColorSpace = null;
  }
  EvalState.prototype = {
  };
  return EvalState;
})();

