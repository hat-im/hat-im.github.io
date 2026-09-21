(function () {
  "use strict";

  var Config = window.PostcardConfig;
  var Assets = window.PostcardAssets;
  var Utils = window.PostcardRenderUtils;
  var Seals = window.PostcardSeals;
  var Stickers = window.PostcardStickers;
  var hashSeed = window.HashUtils.hashSeed;
  var pick = window.HashUtils.pick;
  var shuffledIndices = window.HashUtils.shuffledIndices;
  var PostcardRenderer = window.PostcardEngine.PostcardRenderer;

  // Assembles everything a postcard needs to render: rotation/color/stamp (seeded per postcard),
  // text layout, and where seals/stickers land. Owns the "what does this postcard look like"
  // decision; postcard-draw.js only knows how to paint whatever this produces.
  PostcardRenderer.prototype.setContent = function (data) {
    this.data = Object.assign({}, this.data, data);
    // seeded by date, not id/message, so a given date always looks the same — data.seed lets
    // a caller (e.g. a "shuffle" control) override that with a fresh look on demand
    var seed = (data && data.seed) || (data && data.date) || (data && data.id) || Math.random();
    var rng = hashSeed(seed);
    this._rotation = pick(rng, Assets.ANGLES) * Math.PI / 180;

    if (!data || !data.color) {
      this.data.color = pick(rng, Assets.PALETTE);
    } else {
      this.data.color = Utils.resolveColor(data.color);
    }
    var stampIndex = (typeof data.stampIndex === "number")
      ? data.stampIndex
      : Utils.pickStampIndex(seed, Assets.STAMPS.length, null);
    this._stampImage = Assets.STAMPS[stampIndex];

    var layout = Utils.layoutTextZones(this.ctx, this.data, Config);
    this._layout = layout;
    var occupiedRects = [layout.stampRect, layout.messageRect, layout.footerRect];
    if (layout.subjectRect) occupiedRects.push(layout.subjectRect);

    // seals and stickers draw from one shuffled position pool so they don't land on each
    // other; how many each feature actually takes is that feature's own decision.
    var positionOrder = shuffledIndices(rng, Assets.POSITIONS.length);
    var sealResult = Seals.pickSeals(rng, positionOrder, this.data.date);
    this._seals = sealResult.seals;
    this._stickers = Stickers.pickStickers(rng, positionOrder.slice(sealResult.count), occupiedRects);

    this._layersDirty = true;
  };
})();
