(function () {
  "use strict";

  var Config = window.PostcardConfig;

  function drawSubject(ctx, subject, colX, y) {
    if (!subject) return;
    ctx.font = "bold 12px " + Config.TYPEWRITER_FONT;
    ctx.fillStyle = "rgba(50,48,55,0.75)";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(subject.toUpperCase(), colX, y);
  }

  // Personal zone: message + signature, both handwritten (Kalam) — the letter itself.
  function drawMessage(ctx, layout, colX, from) {
    var CARD_W = Config.CARD_W, PAD = Config.PAD;
    var lineHeight = layout.lineHeight, msgTop = layout.msgTop, lines = layout.lines;
    ctx.fillStyle = "rgba(50,48,55,0.82)";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    lines.forEach(function (line, i) {
      ctx.font = i === 0 ? layout.bookendMsgFont : layout.normalMsgFont;
      ctx.fillText(line, colX, msgTop + i * lineHeight);
    });
    if (from) {
      ctx.font = layout.normalMsgFont;
      ctx.fillStyle = "rgba(50,48,55,0.82)";
      ctx.textAlign = "right";
      ctx.fillText("— " + from, CARD_W - PAD, msgTop + lines.length * lineHeight);
      ctx.textAlign = "left";
    }
  }

  function drawPostscript(ctx, layout, colX) {
    if (!layout.postscriptLines || !layout.postscriptLines.length) return;
    ctx.font = layout.postscriptFont;
    ctx.fillStyle = "rgba(50,48,55,0.62)";
    ctx.textAlign = "left";
    layout.postscriptLines.forEach(function (line, i) {
      ctx.fillText(line, colX, layout.postscriptY + i * layout.postscriptLineHeight);
    });
  }

  // Administrative zone: addressee is primary (left), postmark info is secondary (right) —
  // hierarchy comes from position/role, not just from shrinking the font.
  function drawFooter(ctx, data, colX) {
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H, PAD = Config.PAD;
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
  }

  window.PostcardTypography = {
    drawSubject: drawSubject,
    drawMessage: drawMessage,
    drawPostscript: drawPostscript,
    drawFooter: drawFooter
  };
})();
