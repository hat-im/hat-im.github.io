(function () {
  "use strict";

  var hashSeed = window.HashUtils.hashSeed;
  var pick = window.HashUtils.pick;
  var shuffledIndices = window.HashUtils.shuffledIndices;

  function darken(hex, amount) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "rgba(58,58,68,0.55)";
    var r = Math.max(0, Math.round(parseInt(m[1], 16) * (1 - amount)));
    var g = Math.max(0, Math.round(parseInt(m[2], 16) * (1 - amount)));
    var b = Math.max(0, Math.round(parseInt(m[3], 16) * (1 - amount)));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function resolveColor(nameOrHex) {
    return window.PostcardAssets.PALETTE_NAMES[nameOrHex] || nameOrHex;
  }

  function pickCardStyle(data) {
    var seed = (data && data.date) || (data && data.id) || Math.random();
    var rng = hashSeed(seed);
    var rotationDeg = pick(rng, window.PostcardAssets.ANGLES);
    var color = (data && data.color) ? resolveColor(data.color) : pick(rng, window.PostcardAssets.PALETTE);
    var offsetY = rng() * 6;
    return { color: color, rotationDeg: rotationDeg, borderColor: darken(color, 0.22), offsetY: offsetY };
  }

  function pickStampIndex(seed, count, avoidIndex) {
    var order = shuffledIndices(hashSeed(seed), count);
    if (avoidIndex == null || count <= 1) return order[0];
    for (var i = 0; i < order.length; i++) {
      if (order[i] !== avoidIndex) return order[i];
    }
    return order[0];
  }

  function parseMorseTokens(code) {
    var tokens = [];
    String(code || "").split(" / ").forEach(function (word, wi, words) {
      word.trim().split(" ").filter(Boolean).forEach(function (letter, li, letters) {
        letter.split("").forEach(function (sym) {
          tokens.push(sym === "." ? "dot" : "dash");
        });
        if (li < letters.length - 1) tokens.push("letterGap");
      });
      if (wi < words.length - 1) tokens.push("wordGap");
    });
    return tokens;
  }

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

  function centeredLines(ctx, text, cx, cy, maxWidth, lineHeight) {
    var lines = wrapText(ctx, text, maxWidth);
    lines.forEach(function (line, i) {
      ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lineHeight);
    });
  }

  // Single source of truth for where text sits on a card, shared by draw() (to render it)
  // and setContent() (to keep seals/stickers off of it) — the two must never disagree.
  function layoutTextZones(ctx, data, Config) {
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H, PAD = Config.PAD;
    var side = CARD_H - PAD * 2;
    var sw = 104, sh = 126;
    var sx = CARD_W - PAD - sw, sy = PAD;
    var dividerX = PAD + side + PAD;
    var colX = dividerX + PAD;
    var colW = CARD_W - colX - PAD;

    var msgTop = PAD + sh + 26;
    var subjectRect = null;
    if (data.subject) {
      subjectRect = { x: colX, y: msgTop - 14, w: colW, h: 20 };
      msgTop += 26;
    }

    var normalMsgFont = '19px "Kalam", cursive';
    var bookendMsgFont = '21px "Kalam", cursive';
    var postscriptFont = 'italic 16px "Kalam", cursive';
    ctx.font = normalMsgFont;
    var msgBottom = CARD_H - PAD - 44;
    var lineHeight = 23;
    var reserveForSignature = data.from ? 1 : 0;
    var reserveForPostscript = data.postscript ? 1 : 0;
    var maxLines = Math.max(1, Math.floor((msgBottom - msgTop) / lineHeight) - reserveForSignature - reserveForPostscript);
    var lines = wrapText(ctx, data.message || "", colW);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1] || "";
      while (ctx.measureText(last + "…").width > colW && last.length > 1) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + "…";
    }
    var postscriptY = msgTop + (lines.length + reserveForSignature) * lineHeight;
    var messageHeight = lines.length * lineHeight + reserveForSignature * lineHeight + reserveForPostscript * lineHeight;
    var messageRect = { x: colX, y: msgTop - 16, w: colW, h: messageHeight + 6 };

    var footerRect = { x: colX, y: CARD_H - PAD - 30, w: CARD_W - colX - PAD, h: 30 };

    return {
      colX: colX, colW: colW,
      msgTop: msgTop, lineHeight: lineHeight,
      normalMsgFont: normalMsgFont, bookendMsgFont: bookendMsgFont, postscriptFont: postscriptFont,
      lines: lines, postscriptY: postscriptY,
      stampRect: { x: sx, y: sy, w: sw, h: sh },
      subjectRect: subjectRect,
      messageRect: messageRect,
      footerRect: footerRect
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  window.PostcardRenderUtils = {
    darken: darken,
    resolveColor: resolveColor,
    pickCardStyle: pickCardStyle,
    pickStampIndex: pickStampIndex,
    parseMorseTokens: parseMorseTokens,
    roundRectPath: roundRectPath,
    drawCover: drawCover,
    drawContain: drawContain,
    wrapText: wrapText,
    centeredLines: centeredLines,
    layoutTextZones: layoutTextZones,
    rectsOverlap: rectsOverlap
  };
})();
