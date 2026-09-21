(function () {
  "use strict";

  var Assets = window.PostcardAssets;
  var Config = window.PostcardConfig;
  var Utils = window.PostcardRenderUtils;
  var Glyphs = window.PostcardGlyphs;
  var shuffledIndices = window.HashUtils.shuffledIndices;

  var MAX_STICKERS = 2;

  // stickers are decorative images — must stay clear of the stamp, subject, message and footer.
  // positionOrder is whatever's left of the shared position pool after seals took their share.
  function pickStickers(rng, positionOrder, occupiedRects) {
    var count = Math.min(MAX_STICKERS, Assets.STICKER_ICONS.length);
    var typeOrder = shuffledIndices(rng, Assets.STICKER_ICONS.length);
    var stickers = [];
    var remainingPositions = positionOrder.slice();
    for (var t = 0; t < count; t++) {
      var stickerType = Assets.STICKER_ICONS[typeOrder[t]];
      var size = Assets.STICKER_MIN_SIZE + rng() * Assets.STICKER_SIZE_RANGE;
      size *= Assets.STICKER_SIZE_SCALE[stickerType] || 1;
      var spot = null;
      for (var i = 0; i < remainingPositions.length; i++) {
        var pos = Assets.POSITIONS[remainingPositions[i]];
        var cx = pos.x * Config.CARD_W, cy = pos.y * Config.CARD_H;
        var box = { x: cx - size, y: cy - size, w: size * 2, h: size * 2 };
        if (!occupiedRects.some(function (r) { return Utils.rectsOverlap(box, r); })) {
          spot = { x: cx, y: cy };
          remainingPositions.splice(i, 1);
          break;
        }
      }
      if (!spot) continue;
      stickers.push({
        type: stickerType,
        x: spot.x,
        y: spot.y,
        size: size,
        rotation: (rng() - 0.5) * Assets.STICKER_ROTATION_RAD
      });
    }
    return stickers;
  }

  function drawSticker(ctx, sticker) {
    Glyphs.drawGlyph(ctx, sticker.type, sticker.x, sticker.y, sticker.size, Assets.INK, sticker.rotation);
  }

  window.PostcardStickers = {
    pickStickers: pickStickers,
    drawSticker: drawSticker
  };
})();
