(function (PL) {
  PL.state.nextIndex = 0;
  PL.state.isDrawing = false;

  // How long to let the finished drawing sit on screen, uncovered, before
  // the modal pops up. Completion (nextIndex reaching the total) already
  // happens the instant the last dot connects, so releasing early during
  // this pause doesn't erase anything — the reset-on-early-release check
  // below only fires while nextIndex is still short of the total.
  var COMPLETION_PAUSE_MS = 700;

  function totalDots() {
    return PL.state.joke.dots.length;
  }

  PL.resetProgress = function () {
    PL.state.nextIndex = 0;
    PL.resetDrawing();
  };

  // A joke authored with zero dots has nothing to connect — there's no
  // gesture that could ever trigger tryAdvance's completion branch below, so
  // it auto-reveals instead of softlocking on the setup text forever.
  PL.checkAutoComplete = function () {
    if (totalDots() === 0) {
      setTimeout(PL.showModal, COMPLETION_PAUSE_MS);
    }
  };

  // Confirms the next expected dot if the point is within snap range. This
  // only drives game-logic advancement — the visual ink is a separate,
  // free-drawn path following the actual pointer movement (see extendStroke).
  // Loops so a fast drag that jumps past one dot in a single pointermove
  // still connects correctly.
  function tryAdvance(point) {
    var advanced = false;

    while (PL.state.nextIndex < totalDots()) {
      var target = PL.state.joke.dots[PL.state.nextIndex];
      if (PL.distance(point, target) > PL.SNAP_RADIUS) break;

      PL.markConnected(PL.state.nextIndex);
      PL.state.nextIndex++;
      advanced = true;

      if (PL.state.nextIndex < totalDots()) {
        PL.markNext(PL.state.nextIndex);
      } else {
        setTimeout(PL.showModal, COMPLETION_PAUSE_MS);
      }
    }

    return advanced;
  }

  function updateHover(point) {
    if (PL.state.nextIndex >= totalDots()) return;
    var target = PL.state.joke.dots[PL.state.nextIndex];
    PL.setHover(PL.state.nextIndex, PL.distance(point, target) <= PL.HOVER_RADIUS);
  }

  PL.bindDrawingEvents = function () {
    var svg = document.getElementById("dotsCanvas");
    svg.style.touchAction = "none";

    svg.addEventListener("pointerdown", function (e) {
      if (PL.state.nextIndex >= totalDots()) return;

      PL.state.isDrawing = true;
      svg.setPointerCapture(e.pointerId);

      var point = PL.svgPoint(e.clientX, e.clientY);
      PL.beginStroke(point);
      tryAdvance(point);
    });

    svg.addEventListener("pointermove", function (e) {
      var point = PL.svgPoint(e.clientX, e.clientY);

      // Hover affordance and actual selection are independent checks with
      // their own thresholds — hover keeps showing during a drag too, it's
      // just a proximity hint, not the thing that confirms a dot.
      updateHover(point);

      if (PL.state.isDrawing) {
        PL.extendStroke(point);
        tryAdvance(point);
      }
    });

    svg.addEventListener("pointerup", function () {
      PL.state.isDrawing = false;

      if (PL.state.nextIndex < totalDots()) {
        PL.resetProgress();
      }
    });

    svg.addEventListener("pointercancel", function () {
      PL.state.isDrawing = false;

      if (PL.state.nextIndex < totalDots()) {
        PL.resetProgress();
      }
    });
  };
})(window.Punchlines);
