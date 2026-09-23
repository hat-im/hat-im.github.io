(function () {
  "use strict";

  var LAST_VIEWED_KEY = "post-cards-last-viewed";

  var canvas = document.getElementById("postcardCanvas");
  var pileEl = document.getElementById("postcardPile");
  var stageEl = document.getElementById("postcardStage");
  var firstBtn = document.getElementById("firstBtn");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var latestBtn = document.getElementById("latestBtn");
  var createLink = document.getElementById("createLink");

  var renderer = new PostcardEngine.PostcardRenderer(canvas);
  var strings = null;
  var postcards = [];
  var currentIndex = 0;

  function assignStampIndices(list) {
    var prevIndex = null;
    list.forEach(function (pc) {
      var seed = pc.date || pc.id;
      prevIndex = PostcardEngine.pickStampIndex(seed, PostcardEngine.STAMPS.length, prevIndex);
      pc._stampIndex = prevIndex;
    });
  }

  function formatDisplayDate(iso) {
    var parts = iso.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // Both the formatted date and pickCardStyle's result are deterministic functions of a
  // postcard's own fields, so they're computed once here instead of on every showPostcard()/
  // renderStack() call.
  function assignDisplayFields(list) {
    list.forEach(function (pc) {
      pc._displayDate = formatDisplayDate(pc.date);
      pc._cardStyle = PostcardEngine.pickCardStyle({ id: pc.id, date: pc._displayDate, color: pc.color });
    });
  }

  function renderStack() {
    Array.prototype.slice.call(pileEl.querySelectorAll(".ghost-card")).forEach(function (el) { el.remove(); });
    for (var i = 0; i < currentIndex; i++) {
      var style = postcards[i]._cardStyle;
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

  // Prefetches the first frame of the videos a viewer is most likely to land on next, so
  // showPostcard() can hand the renderer a poster instead of leaving the media box blank
  // while the real video loads.
  function warmNeighborPosters(index) {
    [index - 1, index + 1, 0, postcards.length - 1].forEach(function (i) {
      if (i < 0 || i >= postcards.length) return;
      var media = postcards[i].media || {};
      if (media.type === "video" && media.src) PostcardVideoCache.warm(media.src);
    });
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
      date: pc._displayDate,
      subject: pc.subject,
      message: pc.message,
      postscript: pc.postscript,
      color: pc.color,
      font: pc.font,
      stampIndex: pc._stampIndex
    });

    var media = pc.media || {};
    renderer.setPosterImage(media.type === "video" ? PostcardVideoCache.get(media.src) : null);
    var loadPromise = media.type === "image"
      ? renderer.loadImage(media.src)
      : renderer.loadVideo(media.src);
    loadPromise.catch(function () {});

    renderStack();
    updateNavButtons();
    warmNeighborPosters(currentIndex);

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
      postcards = results[1].postcards.filter(function (pc) { return pc.enabled !== false; });
      postcards.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      assignStampIndices(postcards);
      assignDisplayFields(postcards);

      renderer.setMuted(true);

      firstBtn.setAttribute("aria-label", strings.nav.firstAria);
      prevBtn.setAttribute("aria-label", strings.nav.prevAria);
      nextBtn.setAttribute("aria-label", strings.nav.nextAria);
      latestBtn.setAttribute("aria-label", strings.nav.latestAria);
      createLink.textContent = strings.createLinkLabel;

      showPostcard(initialIndex());

      firstBtn.addEventListener("click", function () { showPostcard(0); });
      prevBtn.addEventListener("click", function () { goTo(-1); });
      nextBtn.addEventListener("click", function () { goTo(1); });
      latestBtn.addEventListener("click", function () { showPostcard(postcards.length - 1); });
    });
  }

  init();
})();
