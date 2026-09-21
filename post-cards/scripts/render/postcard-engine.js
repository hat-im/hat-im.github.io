(function () {
  "use strict";

  var Config = window.PostcardConfig;
  var Assets = window.PostcardAssets;
  var Utils = window.PostcardRenderUtils;
  var Glyphs = window.PostcardGlyphs;
  var Seals = window.PostcardSeals;

  function PostcardRenderer(canvas) {
    this.canvas = canvas;
    canvas.width = Math.round(Config.CANVAS_W * Config.RENDER_SCALE);
    canvas.height = Math.round(Config.CANVAS_H * Config.RENDER_SCALE);
    this.ctx = canvas.getContext("2d");
    this.mediaType = null;
    this.muted = true;
    this.data = {
      to: "", from: "", date: "", location: "", message: "",
      color: "#ffffff", font: null
    };
    this._rotation = 0;
    this._stickers = [];
    this._hasVideo = false;
    this._raf = null;

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.crossOrigin = "anonymous";

    this._image = null;
    this.imageEl = document.createElement("img");
    this.imageEl.style.cssText = "position:fixed;left:-9999px;top:-9999px;pointer-events:none;";
    this.imageEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.imageEl);

    // bg/fg hold everything that doesn't change frame-to-frame (card, border, text, seals,
    // stickers); only the media box is redrawn live each tick. Rebuilt on setContent().
    this._bgCanvas = document.createElement("canvas");
    this._fgCanvas = document.createElement("canvas");
    this._bgCanvas.width = this._fgCanvas.width = canvas.width;
    this._bgCanvas.height = this._fgCanvas.height = canvas.height;
    this._layersDirty = true;
  }

  PostcardRenderer.prototype.setMuted = function (m) {
    this.muted = !!m;
    this.video.muted = this.muted;
  };

  PostcardRenderer.prototype.loadVideo = function (src) {
    var self = this;
    this.mediaType = "video";
    this._hasVideo = false;
    try { this.video.pause(); } catch (e) {}
    this.video.removeAttribute("src");
    this.video.load();
    return new Promise(function (resolve, reject) {
      self.video.muted = self.muted;
      self.video.src = src;
      var onReady = function () {
        self.video.removeEventListener("loadedmetadata", onReady);
        self._hasVideo = true;
        if (self._raf) self.video.play().catch(function () {});
        resolve();
      };
      self.video.addEventListener("loadedmetadata", onReady);
      self.video.addEventListener("error", function () {
        self._hasVideo = false;
        reject(new Error("video failed to load"));
      }, { once: true });
    });
  };

  PostcardRenderer.prototype.loadImage = function (src) {
    var self = this;
    this.mediaType = "image";
    this._hasVideo = false;
    this._image = null;
    try { this.video.pause(); } catch (e) {}
    return new Promise(function (resolve, reject) {
      self.imageEl.onload = function () { self._image = self.imageEl; resolve(); };
      self.imageEl.onerror = function () { reject(new Error("image failed to load")); };
      self.imageEl.src = src;
    });
  };

  PostcardRenderer.prototype.start = function () {
    var self = this;
    if (this.mediaType === "video" && this._hasVideo) this.video.play().catch(function () {});
    if (this._raf) cancelAnimationFrame(this._raf);
    (function loop() {
      self.draw();
      self._raf = requestAnimationFrame(loop);
    })();
  };

  PostcardRenderer.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  PostcardRenderer.prototype.getLoopDuration = function () {
    if (this.mediaType === "video" && this._hasVideo) return this.video.duration || 0;
    return 0;
  };

  window.PostcardEngine = {
    CARD_W: Config.CARD_W,
    CARD_H: Config.CARD_H,
    CANVAS_W: Config.CANVAS_W,
    CANVAS_H: Config.CANVAS_H,
    PALETTE: Assets.PALETTE,
    PALETTE_NAMES: Assets.PALETTE_NAMES,
    FONTS: Assets.FONTS,
    GLYPHS: Assets.GLYPHS,
    STICKER_ICONS: Assets.STICKER_ICONS,
    FANCY_SHAPES: Assets.FANCY_SHAPES,
    SEALS: Assets.SEALS,
    SEAL_COPY: Assets.SEAL_COPY,
    STAMPS: Assets.STAMPS,
    init: Assets.init,
    pickCardStyle: Utils.pickCardStyle,
    pickStampIndex: Utils.pickStampIndex,
    drawGlyph: Glyphs.drawGlyph,
    drawSeal: Seals.drawSeal,
    buildSealExtras: Seals.buildSealExtras,
    PostcardRenderer: PostcardRenderer
  };
})();
