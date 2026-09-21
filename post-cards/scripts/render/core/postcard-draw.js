(function () {
  "use strict";

  var Config = window.PostcardConfig;
  var Utils = window.PostcardRenderUtils;
  var Chrome = window.PostcardChrome;
  var Typography = window.PostcardTypography;
  var Seals = window.PostcardSeals;
  var Stickers = window.PostcardStickers;
  var PostcardRenderer = window.PostcardEngine.PostcardRenderer;

  function seekTo(video, time) {
    return new Promise(function (resolve) {
      if (!video.duration || isNaN(video.duration)) { resolve(); return; }
      var target = Math.max(0, Math.min(time, video.duration - 0.01));
      var onSeeked = function () {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = target;
    });
  }

  function applyCardRotation(ctx, CANVAS_W, CANVAS_H, CARD_W, CARD_H, rotation) {
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.rotate(rotation);
    ctx.translate(-CARD_W / 2, -CARD_H / 2);
  }

  function prepareCardTransform(ctx, CANVAS_W, CANVAS_H, CARD_W, CARD_H, rotation) {
    ctx.setTransform(Config.RENDER_SCALE, 0, 0, Config.RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    applyCardRotation(ctx, CANVAS_W, CANVAS_H, CARD_W, CARD_H, rotation);
  }

  // Everything here is fixed for the life of a setContent() call — cached to bg/fg canvases
  // and reused every animation frame, so only the live media box gets redrawn per tick. This
  // function only sequences the pieces; the pieces themselves live in postcard-chrome.js,
  // postcard-typography.js, postcard-seals.js and postcard-stickers.js.
  PostcardRenderer.prototype._buildStaticLayers = function () {
    var data = this.data;
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H;
    var CANVAS_W = Config.CANVAS_W, CANVAS_H = Config.CANVAS_H;
    var bgCtx = this._bgCanvas.getContext("2d");
    var fgCtx = this._fgCanvas.getContext("2d");

    prepareCardTransform(bgCtx, CANVAS_W, CANVAS_H, CARD_W, CARD_H, this._rotation);
    prepareCardTransform(fgCtx, CANVAS_W, CANVAS_H, CARD_W, CARD_H, this._rotation);

    Chrome.drawCardBackground(bgCtx, data.color);
    Chrome.drawCardBorder(bgCtx, data.color);
    bgCtx.restore();

    Utils.roundRectPath(fgCtx, 0, 0, CARD_W, CARD_H, 0);
    fgCtx.clip();

    var layout = this._layout || Utils.layoutTextZones(fgCtx, data, Config);
    Chrome.drawMediaBoxBorder(fgCtx, layout.mediaRect.x, layout.mediaRect.y, layout.mediaRect.w);
    Chrome.drawDivider(fgCtx, layout.dividerX);
    Chrome.drawStamp(fgCtx, this._stampImage, layout.stampRect);
    Typography.drawSubject(fgCtx, data.subject, layout.colX, layout.msgTop - 26);
    Typography.drawMessage(fgCtx, layout, layout.colX, data.from);
    Typography.drawPostscript(fgCtx, layout, layout.colX);
    Typography.drawFooter(fgCtx, data, layout.colX);

    (this._seals || []).forEach(function (seal) { Seals.drawSeal(fgCtx, seal); });
    (this._stickers || []).forEach(function (s) { Stickers.drawSticker(fgCtx, s); });

    fgCtx.restore();
    this._layersDirty = false;
  };

  PostcardRenderer.prototype.draw = function () {
    var ctx = this.ctx;
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H;
    var CANVAS_W = Config.CANVAS_W, CANVAS_H = Config.CANVAS_H;

    if (this._layersDirty) this._buildStaticLayers();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._bgCanvas, 0, 0);

    ctx.save();
    ctx.setTransform(Config.RENDER_SCALE, 0, 0, Config.RENDER_SCALE, 0, 0);
    applyCardRotation(ctx, CANVAS_W, CANVAS_H, CARD_W, CARD_H, this._rotation);
    var mr = this._layout.mediaRect;
    var mx = mr.x, my = mr.y, side = mr.w;
    Utils.roundRectPath(ctx, mx, my, side, side, 0);
    ctx.clip();
    ctx.fillStyle = "#00000018";
    ctx.fillRect(mx, my, side, side);
    if (this.mediaType === "video" && this._hasVideo) {
      Utils.drawCover(ctx, this.video, mx, my, side, side);
    } else if (this.mediaType === "image" && this._image) {
      Utils.drawCover(ctx, this._image, mx, my, side, side);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(mx, my, side, side);
      ctx.fillStyle = "rgba(60,60,68,0.55)";
      ctx.font = "13px " + Config.TYPEWRITER_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.fallbackText || "Video coming soon", mx + side / 2, my + side / 2);
    }
    ctx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._fgCanvas, 0, 0);
  };

  PostcardRenderer.prototype.renderFrameAtTime = function (loopT) {
    var self = this;
    if (this.mediaType !== "video" || !this._hasVideo) {
      this.draw();
      return Promise.resolve();
    }
    return seekTo(this.video, loopT).then(function () { self.draw(); });
  };
})();
