(function () {
  "use strict";

  var CARD_W = 1060;
  var CARD_H = 615;
  var MARGIN = 115;
  var PAD = 32;
  var CANVAS_W = CARD_W + MARGIN * 2;
  var CANVAS_H = CARD_H + MARGIN * 2;
  var RENDER_SCALE = 1.1;
  var TYPEWRITER_FONT = '"Special Elite", monospace';

  window.PostcardConfig = {
    CARD_W: CARD_W,
    CARD_H: CARD_H,
    MARGIN: MARGIN,
    PAD: PAD,
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H,
    RENDER_SCALE: RENDER_SCALE,
    TYPEWRITER_FONT: TYPEWRITER_FONT
  };
})();
