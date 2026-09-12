(function () {
  "use strict";

  var CARD_W = 1060;
  var CARD_H = 615;
  var MARGIN = 115;
  var PAD = 32;
  var CANVAS_W = CARD_W + MARGIN * 2;
  var CANVAS_H = CARD_H + MARGIN * 2;
  var RENDER_SCALE = 1.1;

  // populated in place, not reassigned, so refs handed out via window.PostcardEngine stay live
  var PALETTE = [];
  var FONTS = [];
  var GLYPHS = {};
  var STICKER_ICONS = [];
  var POSITIONS = [];
  var SEALS = [];
  var FANCY_SHAPES = [];
  var SEAL_COPY = {};
  var STAMPS = [];
  var ANGLES = [];

  var INK = "rgba(58, 58, 68, 0.62)";
  var TYPEWRITER_FONT = '"Special Elite", monospace';

  function darken(hex, amount) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "rgba(58,58,68,0.55)";
    var r = Math.max(0, Math.round(parseInt(m[1], 16) * (1 - amount)));
    var g = Math.max(0, Math.round(parseInt(m[2], 16) * (1 - amount)));
    var b = Math.max(0, Math.round(parseInt(m[3], 16) * (1 - amount)));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function pickCardStyle(data) {
    var seed = (data && data.date) || (data && data.id) || Math.random();
    var rng = hashSeed(seed);
    var rotationDeg = pick(rng, ANGLES);
    var color = (data && data.color) || pick(rng, PALETTE);
    var offsetY = rng() * 6;
    return { color: color, rotationDeg: rotationDeg, borderColor: darken(color, 0.22), offsetY: offsetY };
  }

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
      getJSON("/post-cards/data/palette.json"),
      getJSON("/post-cards/data/fonts.json"),
      getJSON("/post-cards/data/glyphs.json"),
      getJSON("/post-cards/data/stamps.json"),
      getJSON("/post-cards/data/sticker-icons.json"),
      getJSON("/post-cards/data/positions.json"),
      getJSON("/post-cards/data/seals.json"),
      getJSON("/post-cards/data/fancy-pictorial-shapes.json"),
      getJSON("/post-cards/data/seal-copy.json"),
      getJSON("/post-cards/data/angles.json")
    ]).then(function (r) {
      fillFrom(PALETTE, r[0].colors);
      fillFrom(FONTS, r[1].fonts);
      fillObject(GLYPHS, r[2].glyphs);
      fillFrom(STICKER_ICONS, r[4].icons);
      fillFrom(POSITIONS, r[5].positions);
      fillFrom(SEALS, r[6].types);
      fillFrom(FANCY_SHAPES, r[7].shapes);
      fillObject(SEAL_COPY, r[8]);
      fillFrom(ANGLES, r[9].degrees);
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

  function init() {
    return loadAssets().then(preloadFonts);
  }

  var hashSeed = window.HashUtils.hashSeed;
  var pick = window.HashUtils.pick;
  var shuffledIndices = window.HashUtils.shuffledIndices;

  function roundRectPath(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, media, x, y, w, h) {
    var mw = media.videoWidth || media.naturalWidth || media.width;
    var mh = media.videoHeight || media.naturalHeight || media.height;
    if (!mw || !mh) return;
    var scale = Math.max(w / mw, h / mh);
    var dw = mw * scale, dh = mh * scale;
    var dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.drawImage(media, dx, dy, dw, dh);
  }

  function drawContain(ctx, media, x, y, w, h) {
    var mw = media.naturalWidth || media.width;
    var mh = media.naturalHeight || media.height;
    if (!mw || !mh) return;
    var scale = Math.min(w / mw, h / mh);
    var dw = mw * scale, dh = mh * scale;
    var dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.drawImage(media, dx, dy, dw, dh);
  }

  function wrapText(ctx, text, maxWidth) {
    var out = [];
    var paragraphs = String(text || "").split(/\n+/);
    paragraphs.forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      var line = "";
      words.forEach(function (word) {
        var test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          out.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      out.push(line);
    });
    return out;
  }

  function drawPathPart(ctx, part, size) {
    ctx.beginPath();
    part.commands.forEach(function (c) {
      if (c[0] === "M") ctx.moveTo(c[1] * size, c[2] * size);
      else if (c[0] === "L") ctx.lineTo(c[1] * size, c[2] * size);
      else if (c[0] === "Q") ctx.quadraticCurveTo(c[1] * size, c[2] * size, c[3] * size, c[4] * size);
      else if (c[0] === "C") ctx.bezierCurveTo(c[1] * size, c[2] * size, c[3] * size, c[4] * size, c[5] * size, c[6] * size);
      else if (c[0] === "Z") ctx.closePath();
    });
    ctx.fill();
  }

  function drawPolygonPart(ctx, part, size) {
    ctx.beginPath();
    part.points.forEach(function (p, i) {
      var x = p[0] * size, y = p[1] * size;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }

  function drawCirclePart(ctx, part, size, color) {
    var prev = ctx.fillStyle;
    ctx.fillStyle = part.fillStyle === "white" ? "rgba(255,255,255,0.7)" : color;
    ctx.beginPath();
    ctx.arc((part.cx || 0) * size, (part.cy || 0) * size, part.r * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = prev;
  }

  function drawRectPart(ctx, part, size) {
    ctx.fillRect(part.x * size, part.y * size, part.w * size, part.h * size);
  }

  function drawStripePart(ctx, part, size) {
    var n = part.count, gap = (part.gap || 0) * size, h = (part.height || 0.36) * size;
    var skew = (part.skew || 0) * h;
    var sw = (size - gap * (n - 1)) / n;
    for (var j = 0; j < n; j++) {
      var x0 = -size / 2 + j * (sw + gap);
      ctx.fillStyle = j % 2 === 0 ? "rgba(178,59,59,0.55)" : "rgba(63,111,174,0.55)";
      ctx.beginPath();
      ctx.moveTo(x0, h / 2);
      ctx.lineTo(x0 + sw, h / 2);
      ctx.lineTo(x0 + sw + skew, -h / 2);
      ctx.lineTo(x0 + skew, -h / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCrosshatchPart(ctx, part, size) {
    var r = (part.r || 1) * size, gap = (part.gap || 0.26) * size;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    for (var i = -2 * r; i <= 2 * r; i += gap) {
      ctx.beginPath(); ctx.moveTo(i - r, -r); ctx.lineTo(i + r, r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i - r, r); ctx.lineTo(i + r, -r); ctx.stroke();
    }
    ctx.restore();
  }

  function drawImagePart(ctx, part, size) {
    if (!part.img) return;
    drawContain(ctx, part.img, -size, -size, size * 2, size * 2);
  }

  var GLYPH_PART_DRAWERS = {
    path: drawPathPart,
    polygon: drawPolygonPart,
    rect: drawRectPart,
    stripe: drawStripePart,
    crosshatch: drawCrosshatchPart,
    image: drawImagePart
  };

  function drawGlyph(ctx, type, cx, cy, size, color, rotation) {
    var parts = GLYPHS[type];
    if (!parts) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation || 0);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.12);
    parts.forEach(function (part) {
      if (part.type === "circle") {
        drawCirclePart(ctx, part, size, color);
        return;
      }
      var drawFn = GLYPH_PART_DRAWERS[part.type];
      if (drawFn) drawFn(ctx, part, size);
    });
    ctx.restore();
  }

  // seal random sub-choices are precomputed in buildSealExtras(), never in draw() (runs every frame)

  function centeredLines(ctx, text, cx, cy, maxWidth, lineHeight) {
    var lines = wrapText(ctx, text, maxWidth);
    lines.forEach(function (line, i) {
      ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lineHeight);
    });
  }

  function drawSealCDS(ctx, seal) {
    var r = 42;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 5, 0, Math.PI * 2); ctx.stroke();
    var text = (seal.text || "").toUpperCase();
    if (text) {
      ctx.font = "bold 9px " + TYPEWRITER_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var chars = text.split("");
      var arc = Math.min(Math.PI * 0.9, chars.length * 0.28);
      var start = -arc / 2 - Math.PI / 2;
      chars.forEach(function (ch, i) {
        var a = start + (arc * i) / Math.max(1, chars.length - 1);
        ctx.save();
        ctx.rotate(a + Math.PI / 2);
        ctx.translate(0, -(r - 12));
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
    }
    ctx.font = "bold 9px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(seal.text2 || "", 0, 3);
    ctx.beginPath();
    for (var y = -r + 8; y <= r - 8; y += 6) {
      var half = Math.sqrt(Math.max(0, (r - 9) * (r - 9) - y * y));
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
    }
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawSealWavyLines(ctx, seal) {
    var w = 90, lines = 5, h = 30;
    for (var i = 0; i < lines; i++) {
      var yy = -h / 2 + (h / (lines - 1)) * i;
      ctx.beginPath();
      for (var x = -w / 2; x <= w / 2; x += 4) {
        var yOff = Math.sin((x + seal.phase * 40) * 0.35) * 3;
        if (x === -w / 2) ctx.moveTo(x, yy + yOff); else ctx.lineTo(x, yy + yOff);
      }
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  function drawSealSlogan(ctx, seal) {
    var w = 136, h = 30;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    ctx.font = "bold 11px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((seal.text || "").toUpperCase(), 0, 1);
  }

  function drawSealTarget(ctx, seal) {
    var rings = 4, maxR = 32;
    for (var i = rings; i >= 1; i--) {
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, maxR * (i / rings), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawSealFancy(ctx, seal) {
    var r = 30;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    drawGlyph(ctx, seal.shape, 0, 0, r * 0.9, INK);
  }

  function drawSealImb(ctx, seal) {
    var n = seal.heights.length, gap = 4, x0 = -((n - 1) * gap) / 2;
    for (var i = 0; i < n; i++) {
      var hgt = seal.heights[i] * 10 + 6;
      ctx.fillRect(x0 + i * gap, -hgt / 2, 1.6, hgt);
    }
  }

  function drawSealInkjet(ctx, seal) {
    var r = 26;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.font = "bold 8px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((seal.text || "").toUpperCase(), 0, -3);
    ctx.font = "7px " + TYPEWRITER_FONT;
    ctx.fillText(seal.text2 || "", 0, 7);
    (seal.dots || []).forEach(function (d) {
      ctx.beginPath();
      ctx.arc(d[0], d[1], 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(r + 6, -8 + i * 8);
      ctx.lineTo(r + 46, -8 + i * 8);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawSealPermit(ctx, seal) {
    var w = 148, h = 54;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.font = "bold 9px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PRESORTED", 0, -h / 2 + 14);
    ctx.fillText("FIRST-CLASS MAIL", 0, -h / 2 + 26);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 8, -h / 2 + 34);
    ctx.lineTo(w / 2 - 8, -h / 2 + 34);
    ctx.stroke();
    ctx.font = "8px " + TYPEWRITER_FONT;
    ctx.fillText(seal.text || "", 0, -h / 2 + 44);
  }

  function drawSealFim(ctx, seal) {
    var n = seal.pattern.length, w = 3, gap = 4, total = n * w + (n - 1) * gap;
    for (var i = 0; i < n; i++) {
      if (seal.pattern[i]) ctx.fillRect(-total / 2 + i * (w + gap), -14, w, 28);
    }
  }

  function drawSealIbi(ctx, seal) {
    var n = 8, cell = 4.2, total = n * cell;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-total / 2 - 3, -total / 2 - 3, total + 6, total + 6);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (seal.grid[y * n + x]) ctx.fillRect(-total / 2 + x * cell, -total / 2 + y * cell, cell, cell);
      }
    }
    ctx.font = "7px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(seal.text || "", 0, total / 2 + 6);
  }

  function drawSealPars(ctx, seal) {
    var w = 152, h = 40;
    ctx.fillStyle = "rgba(240,200,40,0.55)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = INK;
    ctx.font = "bold 9px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((seal.text || "").toUpperCase(), 0, -8);
    for (var i = 0; i < seal.pattern.length; i++) {
      if (seal.pattern[i]) ctx.fillRect(-w / 2 + 6 + i * 6.5, 2, 2, 12);
    }
  }

  function drawSealNixie(ctx, seal) {
    var w = 152, h = 42;
    ctx.fillStyle = "rgba(240,200,40,0.5)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = "rgba(178,59,59,0.7)";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "rgba(120,40,40,0.85)";
    ctx.font = "bold 9px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    centeredLines(ctx, (seal.text || "").toUpperCase(), 0, 0, w - 16, 11);
  }

  function drawSealFluorescent(ctx, seal) {
    var n = seal.pattern.length, gap = 4, x0 = -(n * gap) / 2;
    ctx.fillStyle = "rgba(255,105,180,0.55)";
    for (var i = 0; i < n; i++) {
      if (seal.pattern[i]) ctx.fillRect(x0 + i * gap, -8, 1.6, 16);
    }
  }

  function drawSealTracking(ctx, seal) {
    var n = seal.pattern.length, gap = 3.4, x0 = -(n * gap) / 2;
    ctx.fillStyle = INK;
    for (var i = 0; i < n; i++) {
      var w = seal.pattern[i] ? 2.2 : 1;
      ctx.fillRect(x0 + i * gap, -14, w, 28);
    }
    ctx.font = "8px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(seal.text || "", 0, 16);
  }

  function drawSealServiceRequested(ctx, seal) {
    ctx.font = "10px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((seal.text || "").toUpperCase(), 0, 0);
  }

  var SEAL_DRAWERS = {
    cds: drawSealCDS,
    wavyLines: drawSealWavyLines,
    sloganCancel: drawSealSlogan,
    geometricTarget: drawSealTarget,
    fancyPictorial: drawSealFancy,
    imbBarcode: drawSealImb,
    inkjetSpray: drawSealInkjet,
    permitIndicia: drawSealPermit,
    fim: drawSealFim,
    ibi2d: drawSealIbi,
    parsSticker: drawSealPars,
    nixieLabel: drawSealNixie,
    fluorescentBarcode: drawSealFluorescent,
    trackingBarcode: drawSealTracking,
    serviceRequested: drawSealServiceRequested
  };

  function drawSeal(ctx, seal) {
    var drawFn = SEAL_DRAWERS[seal.type];
    if (!drawFn) return;
    ctx.save();
    ctx.translate(seal.x, seal.y);
    ctx.rotate(seal.rotation || 0);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    drawFn(ctx, seal);
    ctx.restore();
  }

  function buildSealExtras(type, rng, copy, dateText) {
    var i, arr;
    switch (type) {
      case "cds":
        return { text: pick(rng, copy.cities), text2: dateText };
      case "sloganCancel":
        return { text: pick(rng, copy.sloganCancels) };
      case "fancyPictorial":
        return { shape: pick(rng, FANCY_SHAPES) };
      case "imbBarcode":
        arr = []; for (i = 0; i < 24; i++) arr.push(rng());
        return { heights: arr };
      case "inkjetSpray":
        arr = [];
        for (i = 0; i < 40; i++) {
          var a = rng() * Math.PI * 2, rr = rng() * 22;
          arr.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        return { text: pick(rng, copy.cities), text2: dateText, dots: arr };
      case "permitIndicia":
        return { text: "PERMIT NO. " + copy.permitPrefix + "-" + pick(rng, copy.permitNumbers) };
      case "fim":
        arr = []; for (i = 0; i < 7; i++) arr.push(rng() > 0.3);
        return { pattern: arr };
      case "ibi2d":
        arr = []; for (i = 0; i < 64; i++) arr.push(rng() > 0.5);
        return { grid: arr, text: copy.ibiCaption };
      case "parsSticker":
        arr = []; for (i = 0; i < 20; i++) arr.push(rng() > 0.4);
        return { text: pick(rng, copy.parsMessages), pattern: arr };
      case "nixieLabel":
        return { text: pick(rng, copy.nixieReasons) };
      case "fluorescentBarcode":
        arr = []; for (i = 0; i < 18; i++) arr.push(rng() > 0.35);
        return { pattern: arr };
      case "trackingBarcode":
        arr = []; for (i = 0; i < 26; i++) arr.push(rng() > 0.5);
        return { pattern: arr, text: copy.trackingPrefix + "-" + (Math.floor(rng() * 900000) + 100000) };
      case "serviceRequested":
        return { text: pick(rng, copy.serviceRequestedOptions) };
      case "wavyLines":
        return { phase: rng() };
      default:
        return {};
    }
  }

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
    canvas.width = Math.round(CANVAS_W * RENDER_SCALE);
    canvas.height = Math.round(CANVAS_H * RENDER_SCALE);
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
    this._rotation = pick(rng, ANGLES) * Math.PI / 180;

    if (!data || !data.color) {
      this.data.color = pick(rng, PALETTE);
    }
    this._stampImage = pick(rng, STAMPS);

    var sealCount = Math.min(2, SEALS.length);
    var stickerCount = Math.min(2, STICKER_ICONS.length);
    var order = shuffledIndices(rng, POSITIONS.length);

    this._seals = [];
    for (var s = 0; s < sealCount; s++) {
      var sealType = pick(rng, SEALS);
      var sealPos = POSITIONS[order[s]];
      var extras = buildSealExtras(sealType, rng, SEAL_COPY, this.data.date);
      this._seals.push(Object.assign({
        type: sealType,
        x: sealPos.x * CARD_W,
        y: sealPos.y * CARD_H,
        rotation: (rng() - 0.5) * 0.5
      }, extras));
    }

    this._stickers = [];
    for (var t = 0; t < stickerCount; t++) {
      var stickerPos = POSITIONS[order[sealCount + t]];
      this._stickers.push({
        type: pick(rng, STICKER_ICONS),
        x: stickerPos.x * CARD_W,
        y: stickerPos.y * CARD_H,
        size: 50 + rng() * 14,
        rotation: (rng() - 0.5) * (Math.PI / 3)
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
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.rotate(this._rotation);
    ctx.translate(-CARD_W / 2, -CARD_H / 2);

    ctx.save();
    ctx.shadowColor = "rgba(30,25,20,0.22)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 0);
    ctx.fillStyle = data.color || PALETTE[0];
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = darken(data.color || PALETTE[0], 0.22);
    ctx.lineWidth = 5;
    roundRectPath(ctx, 2.5, 2.5, CARD_W - 5, CARD_H - 5, 0);
    ctx.stroke();
    ctx.restore();

    roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 0);
    ctx.clip();

    var side = CARD_H - PAD * 2;
    var mx = PAD, my = PAD;
    ctx.save();
    roundRectPath(ctx, mx, my, side, side, 0);
    ctx.clip();
    ctx.fillStyle = "#00000018";
    ctx.fillRect(mx, my, side, side);
    if (this.mediaType === "video" && this._hasVideo) {
      drawCover(ctx, this.video, mx, my, side, side);
    } else if (this.mediaType === "image" && this._image) {
      drawCover(ctx, this._image, mx, my, side, side);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(mx, my, side, side);
      ctx.fillStyle = "rgba(60,60,68,0.55)";
      ctx.font = "13px " + TYPEWRITER_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.fallbackText || "Video coming soon", mx + side / 2, my + side / 2);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    roundRectPath(ctx, mx, my, side, side, 0);
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
      drawContain(ctx, this._stampImage, sx, sy, sw, sh);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(70,70,80,0.35)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh);
    }

    // Personal zone: message + signature, both handwritten (Kalam) — the letter itself.
    var normalMsgFont = "19px \"Kalam\", cursive";
    var bookendMsgFont = "21px \"Kalam\", cursive";
    ctx.fillStyle = "rgba(50,48,55,0.82)";
    ctx.font = normalMsgFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var msgTop = PAD + sh + 26;
    var msgBottom = CARD_H - PAD - 44;
    var lineHeight = 23;
    var reserveForSignature = data.from ? 1 : 0;
    var maxLines = Math.max(1, Math.floor((msgBottom - msgTop) / lineHeight) - reserveForSignature);
    var lines = wrapText(ctx, data.message || "", colW);
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
    ctx.font = "bold 16px " + TYPEWRITER_FONT;
    ctx.textAlign = "left";
    ctx.fillText("To: " + (data.to || ""), colX, CARD_H - PAD - 6);

    var postmarkBits = [];
    if (data.location) postmarkBits.push(data.location);
    if (data.date) postmarkBits.push(data.date);
    if (postmarkBits.length) {
      ctx.fillStyle = "rgba(50,48,55,0.5)";
      ctx.font = "10px " + TYPEWRITER_FONT;
      ctx.textAlign = "right";
      ctx.fillText(postmarkBits.join("  ·  "), CARD_W - PAD, CARD_H - PAD - 6);
      ctx.textAlign = "left";
    }

    (this._seals || []).forEach(function (seal) {
      drawSeal(ctx, seal);
    });

    (this._stickers || []).forEach(function (s) {
      drawGlyph(ctx, s.type, s.x, s.y, s.size, INK, s.rotation);
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
    CARD_W: CARD_W,
    CARD_H: CARD_H,
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H,
    PALETTE: PALETTE,
    FONTS: FONTS,
    GLYPHS: GLYPHS,
    STICKER_ICONS: STICKER_ICONS,
    FANCY_SHAPES: FANCY_SHAPES,
    SEALS: SEALS,
    SEAL_COPY: SEAL_COPY,
    STAMPS: STAMPS,
    init: init,
    pickCardStyle: pickCardStyle,
    drawGlyph: drawGlyph,
    drawSeal: drawSeal,
    buildSealExtras: buildSealExtras,
    PostcardRenderer: PostcardRenderer
  };
})();
