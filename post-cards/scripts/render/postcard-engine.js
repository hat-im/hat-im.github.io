(function () {
  "use strict";

  var Config = window.PostcardConfig;
  var Assets = window.PostcardAssets;
  var Utils = window.PostcardRenderUtils;
  var Glyphs = window.PostcardGlyphs;
  var Seals = window.PostcardSeals;
  var hashSeed = window.HashUtils.hashSeed;
  var pick = window.HashUtils.pick;
  var shuffledIndices = window.HashUtils.shuffledIndices;

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
  }

  PostcardRenderer.prototype.setMuted = function (m) {
    this.muted = !!m;
    this.video.muted = this.muted;
  };

  PostcardRenderer.prototype.setContent = function (data) {
    this.data = Object.assign({}, this.data, data);
    // seeded by date, not id/message, so a given date always looks the same
    var seed = (data && data.date) || (data && data.id) || Math.random();
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

    var sealCount = Math.min(2, Assets.SEALS.length);
    var stickerCount = Math.min(2, Assets.STICKER_ICONS.length);
    var positionOrder = shuffledIndices(rng, Assets.POSITIONS.length);
    var sealTypeOrder = shuffledIndices(rng, Assets.SEALS.length);
    var stickerTypeOrder = shuffledIndices(rng, Assets.STICKER_ICONS.length);

    this._seals = [];
    for (var s = 0; s < sealCount; s++) {
      var sealType = Assets.SEALS[sealTypeOrder[s]];
      var sealPos = Assets.POSITIONS[positionOrder[s]];
      var extras = Seals.buildSealExtras(sealType, rng, Assets.SEAL_COPY, this.data.date);
      this._seals.push(Object.assign({
        type: sealType,
        x: sealPos.x * Config.CARD_W,
        y: sealPos.y * Config.CARD_H,
        rotation: (rng() - 0.5) * Assets.SEAL_ROTATION_RAD
      }, extras));
    }

    this._stickers = [];
    for (var t = 0; t < stickerCount; t++) {
      var stickerPos = Assets.POSITIONS[positionOrder[sealCount + t]];
      this._stickers.push({
        type: Assets.STICKER_ICONS[stickerTypeOrder[t]],
        x: stickerPos.x * Config.CARD_W,
        y: stickerPos.y * Config.CARD_H,
        size: Assets.STICKER_MIN_SIZE + rng() * Assets.STICKER_SIZE_RANGE,
        rotation: (rng() - 0.5) * Assets.STICKER_ROTATION_RAD
      });
    }
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

  PostcardRenderer.prototype.draw = function () {
    var ctx = this.ctx;
    var data = this.data;
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H, PAD = Config.PAD;
    var CANVAS_W = Config.CANVAS_W, CANVAS_H = Config.CANVAS_H;

    ctx.setTransform(Config.RENDER_SCALE, 0, 0, Config.RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.rotate(this._rotation);
    ctx.translate(-CARD_W / 2, -CARD_H / 2);

    ctx.save();
    ctx.shadowColor = "rgba(30,25,20,0.22)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    Utils.roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 0);
    ctx.fillStyle = data.color || Assets.PALETTE[0];
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = Utils.darken(data.color || Assets.PALETTE[0], 0.22);
    ctx.lineWidth = 5;
    Utils.roundRectPath(ctx, 2.5, 2.5, CARD_W - 5, CARD_H - 5, 0);
    ctx.stroke();
    ctx.restore();

    Utils.roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 0);
    ctx.clip();

    var side = CARD_H - PAD * 2;
    var mx = PAD, my = PAD;
    ctx.save();
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
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    Utils.roundRectPath(ctx, mx, my, side, side, 0);
    ctx.stroke();

    var dividerX = mx + side + PAD;
    ctx.save();
    ctx.strokeStyle = "rgba(70,70,80,0.25)";
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dividerX, PAD);
    ctx.lineTo(dividerX, CARD_H - PAD);
    ctx.stroke();
    ctx.restore();

    var colX = dividerX + PAD;
    var colW = CARD_W - colX - PAD;

    var sw = 104, sh = 126;
    var sx = CARD_W - PAD - sw, sy = PAD;
    if (this._stampImage) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      Utils.drawContain(ctx, this._stampImage, sx, sy, sw, sh);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(70,70,80,0.35)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh);
    }

    var msgTop = PAD + sh + 26;
    if (data.subject) {
      ctx.font = "bold 12px " + Config.TYPEWRITER_FONT;
      ctx.fillStyle = "rgba(50,48,55,0.75)";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(data.subject.toUpperCase(), colX, msgTop);
      msgTop += 26;
    }

    // Personal zone: message + signature, both handwritten (Kalam) — the letter itself.
    var normalMsgFont = "19px \"Kalam\", cursive";
    var bookendMsgFont = "21px \"Kalam\", cursive";
    ctx.fillStyle = "rgba(50,48,55,0.82)";
    ctx.font = normalMsgFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var msgBottom = CARD_H - PAD - 44;
    var lineHeight = 23;
    var reserveForSignature = data.from ? 1 : 0;
    var maxLines = Math.max(1, Math.floor((msgBottom - msgTop) / lineHeight) - reserveForSignature);
    var lines = Utils.wrapText(ctx, data.message || "", colW);
    var truncated = lines.length > maxLines;
    if (truncated) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1] || "";
      while (ctx.measureText(last + "…").width > colW && last.length > 1) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + "…";
    }
    lines.forEach(function (line, i) {
      ctx.font = i === 0 ? bookendMsgFont : normalMsgFont;
      ctx.fillText(line, colX, msgTop + i * lineHeight);
    });
    if (data.from) {
      ctx.font = normalMsgFont;
      ctx.fillStyle = "rgba(50,48,55,0.82)";
      ctx.textAlign = "right";
      ctx.fillText("— " + data.from, CARD_W - PAD, msgTop + lines.length * lineHeight);
      ctx.textAlign = "left";
    }

    // Administrative zone: addressee is primary (left), postmark info is secondary (right) —
    // hierarchy comes from position/role, not just from shrinking the font.
    ctx.strokeStyle = "rgba(70,70,80,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colX, CARD_H - PAD - 26);
    ctx.lineTo(CARD_W - PAD, CARD_H - PAD - 26);
    ctx.stroke();

    ctx.fillStyle = "rgba(50,48,55,0.9)";
    ctx.font = "bold 16px " + Config.TYPEWRITER_FONT;
    ctx.textAlign = "left";
    ctx.fillText("To: " + (data.to || ""), colX, CARD_H - PAD - 6);

    var postmarkBits = [];
    if (data.location) postmarkBits.push(data.location);
    if (data.date) postmarkBits.push(data.date);
    if (postmarkBits.length) {
      ctx.fillStyle = "rgba(50,48,55,0.5)";
      ctx.font = "10px " + Config.TYPEWRITER_FONT;
      ctx.textAlign = "right";
      ctx.fillText(postmarkBits.join("  ·  "), CARD_W - PAD, CARD_H - PAD - 6);
      ctx.textAlign = "left";
    }

    (this._seals || []).forEach(function (seal) {
      Seals.drawSeal(ctx, seal);
    });

    (this._stickers || []).forEach(function (s) {
      Glyphs.drawGlyph(ctx, s.type, s.x, s.y, s.size, Assets.INK, s.rotation);
    });

    ctx.restore();
  };

  PostcardRenderer.prototype.renderFrameAtTime = function (loopT) {
    var self = this;
    if (this.mediaType !== "video" || !this._hasVideo) {
      this.draw();
      return Promise.resolve();
    }
    return seekTo(this.video, loopT).then(function () { self.draw(); });
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
