(function () {
  "use strict";

  var PALETTE = [];
  var PALETTE_NAMES = {};
  var GLYPHS = {};
  var STICKER_ICONS = [];
  var STICKER_SIZE_SCALE = {};
  var POSITIONS = [];
  var SEALS = [];
  var FANCY_SHAPES = [];
  var SEAL_COPY = {};
  var STAMPS = [];
  var ANGLES = [];

  var Assets = {
    PALETTE: PALETTE,
    PALETTE_NAMES: PALETTE_NAMES,
    GLYPHS: GLYPHS,
    STICKER_ICONS: STICKER_ICONS,
    STICKER_SIZE_SCALE: STICKER_SIZE_SCALE,
    POSITIONS: POSITIONS,
    SEALS: SEALS,
    FANCY_SHAPES: FANCY_SHAPES,
    SEAL_COPY: SEAL_COPY,
    STAMPS: STAMPS,
    ANGLES: ANGLES,
    SEAL_ROTATION_RAD: 0,
    STICKER_ROTATION_RAD: 0,
    STICKER_MIN_SIZE: 0,
    STICKER_SIZE_RANGE: 0,
    INK: "",
    BARCODE_INK: ""
  };

  function fillFrom(target, values) {
    target.length = 0;
    Array.prototype.push.apply(target, values || []);
  }

  function fillObject(target, values) {
    Object.keys(target).forEach(function (k) { delete target[k]; });
    Object.assign(target, values || {});
  }

  function getJSON(path) {
    return fetch(path).then(function (r) { return r.json(); });
  }

  function preloadImageAsset(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function loadAssets() {
    return Promise.all([
      getJSON("/post-cards/data/theme/palette.json"),
      getJSON("/post-cards/data/icons/glyphs.json"),
      getJSON("/post-cards/data/stamps/stamps.json"),
      getJSON("/post-cards/data/icons/sticker-icons.json"),
      getJSON("/post-cards/data/layout/positions.json"),
      getJSON("/post-cards/data/seals/seal-types.json"),
      getJSON("/post-cards/data/icons/fancy-pictorial-shapes.json"),
      getJSON("/post-cards/data/seals/seal-strings.json"),
      getJSON("/post-cards/data/theme/angles.json"),
      getJSON("/post-cards/data/theme/ink-colors.json"),
      getJSON("/post-cards/data/layout/placement-tolerances.json")
    ]).then(function (r) {
      var hexList = [], nameMap = {};
      r[0].colors.forEach(function (c) {
        hexList.push(c.hex);
        nameMap[c.name] = c.hex;
      });
      fillFrom(PALETTE, hexList);
      fillObject(PALETTE_NAMES, nameMap);
      fillObject(GLYPHS, r[1].glyphs);
      fillFrom(STICKER_ICONS, r[3].icons);
      fillObject(STICKER_SIZE_SCALE, r[3].sizeScale);
      fillFrom(POSITIONS, r[4].positions);
      fillFrom(SEALS, r[5].types);
      fillFrom(FANCY_SHAPES, r[6].shapes);
      fillObject(SEAL_COPY, r[7]);
      fillFrom(ANGLES, r[8].degrees);
      Assets.INK = r[9].ink;
      Assets.BARCODE_INK = r[9].barcodeInk;
      Assets.SEAL_ROTATION_RAD = r[10].sealRotationDegrees * Math.PI / 180;
      Assets.STICKER_ROTATION_RAD = r[10].stickerRotationDegrees * Math.PI / 180;
      Assets.STICKER_MIN_SIZE = r[10].stickerMinSize;
      Assets.STICKER_SIZE_RANGE = r[10].stickerSizeRange;

      // Stamp/glyph images load in the background rather than blocking init(): with dozens of
      // stamps, waiting for every single one to download before the first postcard can render
      // made the page feel stuck on load. STAMPS is sized up front so index lookups are valid
      // immediately; draw() notices when a still-null slot it needs has since arrived (see
      // postcard-draw.js) and redraws once it does.
      var stampSrcs = r[2].images || [];
      fillFrom(STAMPS, new Array(stampSrcs.length).fill(null));
      stampSrcs.forEach(function (src, i) {
        preloadImageAsset(src).then(function (img) { STAMPS[i] = img; });
      });

      Object.keys(GLYPHS).forEach(function (id) {
        GLYPHS[id].forEach(function (part) {
          if (part.type === "image" && part.src) {
            preloadImageAsset(part.src).then(function (img) { part.img = img; });
          }
        });
      });
    });
  }

  // Only the two fonts the canvas actually draws with need to be ready before first render;
  // Courier Prime is plain CSS text and the browser handles its own font-display swap for that.
  function preloadFonts() {
    if (!("fonts" in document)) return Promise.resolve();
    var Config = window.PostcardConfig;
    var specs = ["20px " + Config.TYPEWRITER_FONT, "20px " + Config.HANDWRITTEN_FONT];
    return Promise.all(specs.map(function (s) {
      return document.fonts.load(s).catch(function () {});
    })).then(function () { return document.fonts.ready; });
  }

  Assets.init = function () {
    return loadAssets().then(preloadFonts);
  };

  window.PostcardAssets = Assets;
})();
