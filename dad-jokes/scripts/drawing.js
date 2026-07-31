(function (DJ) {
  DJ.state.nextIndex = 0;
  DJ.state.isDrawing = false;

  // How long to let the finished drawing sit on screen, uncovered, before
  // the modal pops up. Completion (nextIndex reaching the total) already
  // happens the instant the last dot connects, so releasing early during
  // this pause doesn't erase anything — the reset-on-early-release check
  // below only fires while nextIndex is still short of the total.
  var COMPLETION_PAUSE_MS = 700;

  function totalDots() {
    return DJ.state.joke.dots.length;
  }

  DJ.resetProgress = function () {
    DJ.state.nextIndex = 0;
    DJ.resetDrawing();
  };

  // A joke authored with zero dots has nothing to connect — there's no
  // gesture that could ever trigger tryAdvance's completion branch below, so
  // it auto-reveals instead of softlocking on the setup text forever.
  DJ.checkAutoComplete = function () {
    if (totalDots() === 0) {
      setTimeout(DJ.showModal, COMPLETION_PAUSE_MS);
    }
  };

  // Confirms the next expected dot if the point is within snap range. This
  // only drives game-logic advancement — the visual ink is a separate,
  // free-drawn path following the actual pointer movement (see extendStroke).
  // Loops so a fast drag that jumps past one dot in a single pointermove
  // still connects correctly.
  function tryAdvance(point) {
    var advanced = false;

    while (DJ.state.nextIndex < totalDots()) {
      var target = DJ.state.joke.dots[DJ.state.nextIndex];
      if (DJ.distance(point, target) > DJ.SNAP_RADIUS) break;

      DJ.markConnected(DJ.state.nextIndex);
      DJ.state.nextIndex++;
      advanced = true;

      if (DJ.state.nextIndex < totalDots()) {
        DJ.markNext(DJ.state.nextIndex);
      } else {
        setTimeout(DJ.showModal, COMPLETION_PAUSE_MS);
      }
    }

    return advanced;
  }

  function updateHover(point) {
    if (DJ.state.nextIndex >= totalDots()) return;
    var target = DJ.state.joke.dots[DJ.state.nextIndex];
    DJ.setHover(DJ.state.nextIndex, DJ.distance(point, target) <= DJ.HOVER_RADIUS);
  }

  DJ.bindDrawingEvents = function () {
    var svg = document.getElementById("dotsCanvas");
    svg.style.touchAction = "none";

    svg.addEventListener("pointerdown", function (e) {
      if (DJ.state.nextIndex >= totalDots()) return;

      DJ.state.isDrawing = true;
      svg.setPointerCapture(e.pointerId);

      var point = DJ.svgPoint(e.clientX, e.clientY);
      DJ.beginStroke(point);
      tryAdvance(point);
    });

    svg.addEventListener("pointermove", function (e) {
      var point = DJ.svgPoint(e.clientX, e.clientY);

      // Hover affordance and actual selection are independent checks with
      // their own thresholds — hover keeps showing during a drag too, it's
      // just a proximity hint, not the thing that confirms a dot.
      updateHover(point);

      if (DJ.state.isDrawing) {
        DJ.extendStroke(point);
        tryAdvance(point);
      }
    });

    svg.addEventListener("pointerup", function () {
      DJ.state.isDrawing = false;

      if (DJ.state.nextIndex < totalDots()) {
        DJ.resetProgress();
      }
    });

    svg.addEventListener("pointercancel", function () {
      DJ.state.isDrawing = false;

      if (DJ.state.nextIndex < totalDots()) {
        DJ.resetProgress();
      }
    });
  };
})(window.DadJokes);
