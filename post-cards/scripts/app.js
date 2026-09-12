(function () {
  "use strict";

  var LAST_VIEWED_KEY = "post-cards-last-viewed";
  var MAX_STACK = 6;

  var canvas = document.getElementById("postcardCanvas");
  var pileEl = document.getElementById("postcardPile");
  var stageEl = document.getElementById("postcardStage");
  var firstBtn = document.getElementById("firstBtn");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var latestBtn = document.getElementById("latestBtn");

  var renderer = new PostcardEngine.PostcardRenderer(canvas);
  var strings = null;
  var postcards = [];
  var currentIndex = 0;

  function formatDisplayDate(iso) {
    var parts = iso.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function renderStack() {
    Array.prototype.slice.call(pileEl.querySelectorAll(".ghost-card")).forEach(function (el) { el.remove(); });
    var start = Math.max(0, currentIndex - MAX_STACK);
    for (var i = start; i < currentIndex; i++) {
      var pc = postcards[i];
      var style = PostcardEngine.pickCardStyle({ id: pc.id, date: formatDisplayDate(pc.date), color: pc.color });
      var el = document.createElement("div");
      el.className = "ghost-card";
      el.style.background = style.color;
      el.style.borderColor = style.borderColor;
      el.style.transform = "rotate(" + style.rotationDeg + "deg) translateY(" + style.offsetY + "px)";
      pileEl.insertBefore(el, stageEl);
    }
  }

  function updateNavButtons() {
    firstBtn.disabled = currentIndex <= 0;
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= postcards.length - 1;
    latestBtn.disabled = currentIndex >= postcards.length - 1;
  }

  function showPostcard(index) {
    currentIndex = Math.max(0, Math.min(postcards.length - 1, index));
    var pc = postcards[currentIndex];

    renderer.fallbackText = strings.mediaFallbackText;
    renderer.setContent({
      id: pc.id,
      to: pc.to,
      from: pc.from,
      location: pc.location,
      date: formatDisplayDate(pc.date),
      message: pc.message,
      color: pc.color,
      font: pc.font
    });

    var media = pc.media || {};
    var loadPromise = media.type === "image"
      ? renderer.loadImage(media.src)
      : renderer.loadVideo(media.src);
    loadPromise.catch(function () {});

    renderStack();
    updateNavButtons();

    localStorage.setItem(LAST_VIEWED_KEY, pc.id);
    renderer.start();
  }

  function goTo(delta) {
    showPostcard(currentIndex + delta);
  }

  function initialIndex() {
    var lastId = localStorage.getItem(LAST_VIEWED_KEY);
    if (lastId) {
      var found = postcards.findIndex(function (p) { return p.id === lastId; });
      if (found >= 0) return found;
    }
    return postcards.length - 1;
  }

  function init() {
    Promise.all([
      fetch("/post-cards/strings.json").then(function (r) { return r.json(); }),
      fetch("/post-cards/data/postcards.json").then(function (r) { return r.json(); }),
      PostcardEngine.init()
    ]).then(function (results) {
      strings = results[0];
      postcards = results[1].postcards;
      postcards.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

      renderer.setMuted(true);

      firstBtn.setAttribute("aria-label", strings.nav.firstAria);
      prevBtn.setAttribute("aria-label", strings.nav.prevAria);
      nextBtn.setAttribute("aria-label", strings.nav.nextAria);
      latestBtn.setAttribute("aria-label", strings.nav.latestAria);

      showPostcard(initialIndex());

      firstBtn.addEventListener("click", function () { showPostcard(0); });
      prevBtn.addEventListener("click", function () { goTo(-1); });
      nextBtn.addEventListener("click", function () { goTo(1); });
      latestBtn.addEventListener("click", function () { showPostcard(postcards.length - 1); });
    });
  }

  init();
})();
