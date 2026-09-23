(function () {
  "use strict";

  var PALETTE = [];
  var PALETTE_NAMES = {};
  var FONTS = [];
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
    FONTS: FONTS,
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
      getJSON("/post-cards/data/theme/fonts.json"),
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
      fillFrom(FONTS, r[1].fonts);
      fillObject(GLYPHS, r[2].glyphs);
      fillFrom(STICKER_ICONS, r[4].icons);
      fillObject(STICKER_SIZE_SCALE, r[4].sizeScale);
      fillFrom(POSITIONS, r[5].positions);
      fillFrom(SEALS, r[6].types);
      fillFrom(FANCY_SHAPES, r[7].shapes);
      fillObject(SEAL_COPY, r[8]);
      fillFrom(ANGLES, r[9].degrees);
      Assets.INK = r[10].ink;
      Assets.BARCODE_INK = r[10].barcodeInk;
      Assets.SEAL_ROTATION_RAD = r[11].sealRotationDegrees * Math.PI / 180;
      Assets.STICKER_ROTATION_RAD = r[11].stickerRotationDegrees * Math.PI / 180;
      Assets.STICKER_MIN_SIZE = r[11].stickerMinSize;
      Assets.STICKER_SIZE_RANGE = r[11].stickerSizeRange;

      var glyphImagePromises = [];
      Object.keys(GLYPHS).forEach(function (id) {
        GLYPHS[id].forEach(function (part) {
          if (part.type === "image" && part.src) {
            glyphImagePromises.push(preloadImageAsset(part.src).then(function (img) { part.img = img; }));
          }
        });
      });
      return Promise.all([
        Promise.all((r[3].images || []).map(preloadImageAsset)).then(function (imgs) {
          fillFrom(STAMPS, imgs.filter(Boolean));
        }),
        Promise.all(glyphImagePromises)
      ]);
    });
  }

  function preloadFonts() {
    if (!("fonts" in document)) return Promise.resolve();
    var specs = ['20px "Special Elite"'];
    FONTS.forEach(function (f) { specs.push('20px ' + f.family); });
    return Promise.all(specs.map(function (s) {
      return document.fonts.load(s).catch(function () {});
    })).then(function () { return document.fonts.ready; });
  }

  Assets.init = function () {
    return loadAssets().then(preloadFonts);
  };

  window.PostcardAssets = Assets;
})();
