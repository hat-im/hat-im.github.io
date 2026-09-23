(function () {
  "use strict";

  var drawContain = window.PostcardRenderUtils.drawContain;
  var tracePathPoints = window.PostcardRenderUtils.tracePathPoints;

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
    tracePathPoints(ctx, part.points, size, size);
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
    var parts = window.PostcardAssets.GLYPHS[type];
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

  window.PostcardGlyphs = {
    drawGlyph: drawGlyph
  };
})();
