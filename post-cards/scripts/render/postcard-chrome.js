(function () {
  "use strict";

  var Config = window.PostcardConfig;
  var Assets = window.PostcardAssets;
  var Utils = window.PostcardRenderUtils;

  function drawCardBackground(ctx, color) {
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H;
    ctx.save();
    ctx.shadowColor = "rgba(30,25,20,0.22)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    Utils.roundRectPath(ctx, 0, 0, CARD_W, CARD_H, 0);
    ctx.fillStyle = color || Assets.PALETTE[0];
    ctx.fill();
    ctx.restore();
  }

  function drawCardBorder(ctx, color) {
    var CARD_W = Config.CARD_W, CARD_H = Config.CARD_H;
    ctx.save();
    ctx.strokeStyle = Utils.darken(color || Assets.PALETTE[0], Config.CARD_BORDER_DARKEN);
    ctx.lineWidth = 5;
    Utils.roundRectPath(ctx, 2.5, 2.5, CARD_W - 5, CARD_H - 5, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawMediaBoxBorder(ctx, mx, my, side) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    Utils.roundRectPath(ctx, mx, my, side, side, 0);
    ctx.stroke();
  }

  function drawDivider(ctx, dividerX) {
    var CARD_H = Config.CARD_H, PAD = Config.PAD;
    ctx.save();
    ctx.strokeStyle = "rgba(70,70,80,0.25)";
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dividerX, PAD);
    ctx.lineTo(dividerX, CARD_H - PAD);
    ctx.stroke();
    ctx.restore();
  }

  function drawStamp(ctx, stampImage, rect) {
    if (stampImage) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      Utils.drawContain(ctx, stampImage, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "rgba(70,70,80,0.35)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  window.PostcardChrome = {
    drawCardBackground: drawCardBackground,
    drawCardBorder: drawCardBorder,
    drawMediaBoxBorder: drawMediaBoxBorder,
    drawDivider: drawDivider,
    drawStamp: drawStamp
  };
})();
