(function () {
  "use strict";

  var TYPEWRITER_FONT = window.PostcardConfig.TYPEWRITER_FONT;
  var centeredLines = window.PostcardRenderUtils.centeredLines;
  var parseMorseTokens = window.PostcardRenderUtils.parseMorseTokens;
  var drawGlyph = window.PostcardGlyphs.drawGlyph;
  var pick = window.HashUtils.pick;

  // seal random sub-choices are precomputed in buildSealExtras(), never in draw() (runs every frame)

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
    drawGlyph(ctx, seal.shape, 0, 0, r * 0.9, window.PostcardAssets.INK);
  }

  function drawSealImb(ctx, seal) {
    var n = seal.heights.length, gap = 4.5, x0 = -((n - 1) * gap) / 2;
    ctx.fillStyle = window.PostcardAssets.BARCODE_INK;
    for (var i = 0; i < n; i++) {
      var hgt = seal.heights[i] * 12 + 8;
      ctx.fillRect(x0 + i * gap, -hgt / 2, 2, hgt);
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
    var n = seal.pattern.length, w = 4, gap = 5, total = n * w + (n - 1) * gap;
    ctx.fillStyle = window.PostcardAssets.BARCODE_INK;
    for (var i = 0; i < n; i++) {
      if (seal.pattern[i]) ctx.fillRect(-total / 2 + i * (w + gap), -16, w, 32);
    }
  }

  function drawSealIbi(ctx, seal) {
    var n = 8, cell = 5.6, total = n * cell;
    ctx.fillStyle = window.PostcardAssets.BARCODE_INK;
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
    ctx.strokeStyle = window.PostcardAssets.INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = window.PostcardAssets.INK;
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
    var n = seal.pattern.length, gap = 4.5, x0 = -(n * gap) / 2;
    ctx.fillStyle = "rgba(255,60,170,0.85)";
    for (var i = 0; i < n; i++) {
      if (seal.pattern[i]) ctx.fillRect(x0 + i * gap, -10, 2, 20);
    }
  }

  function drawSealTracking(ctx, seal) {
    var tokens = seal.tokens || [];
    var dotW = 2.4, dashW = 6, markGap = 2.4, letterGap = 6, wordGap = 11, h = 32;
    var widthOf = function (t) {
      if (t === "dot") return dotW + markGap;
      if (t === "dash") return dashW + markGap;
      if (t === "letterGap") return letterGap;
      return wordGap;
    };
    var totalW = tokens.reduce(function (sum, t) { return sum + widthOf(t); }, 0);
    var x = -totalW / 2;
    ctx.fillStyle = window.PostcardAssets.BARCODE_INK;
    tokens.forEach(function (t) {
      if (t === "dot") ctx.fillRect(x, -h / 2, dotW, h);
      else if (t === "dash") ctx.fillRect(x, -h / 2, dashW, h);
      x += widthOf(t);
    });
    ctx.font = "8px " + TYPEWRITER_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(seal.text || "", 0, h / 2 + 6);
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
    ctx.strokeStyle = window.PostcardAssets.INK;
    ctx.fillStyle = window.PostcardAssets.INK;
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
        return { shape: pick(rng, window.PostcardAssets.FANCY_SHAPES) };
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
        return {
          tokens: parseMorseTokens(copy.morseCode),
          text: copy.trackingPrefix + "-" + (Math.floor(rng() * 900000) + 100000)
        };
      case "serviceRequested":
        return { text: pick(rng, copy.serviceRequestedOptions) };
      case "wavyLines":
        return { phase: rng() };
      default:
        return {};
    }
  }

  window.PostcardSeals = {
    drawSeal: drawSeal,
    buildSealExtras: buildSealExtras
  };
})();
