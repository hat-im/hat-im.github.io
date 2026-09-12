(function () {
  "use strict";

  var canvas = document.getElementById("postcardCanvas");
  var mediaInput = document.getElementById("mediaInput");
  var messageInput = document.getElementById("messageInput");
  var locationInput = document.getElementById("locationInput");
  var colorSwatches = document.getElementById("colorSwatches");
  var fontOptions = document.getElementById("fontOptions");
  var backLink = document.getElementById("backLink");

  var renderer = new PostcardEngine.PostcardRenderer(canvas);
  var currentObjectUrl = null;
  var state = {
    id: "draft",
    to: "Sam",
    from: "Hat",
    date: new Date().toISOString().slice(0, 10),
    location: "",
    message: "",
    color: null,
    font: null
  };

  function formatDisplayDate(iso) {
    var parts = iso.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function refresh() {
    renderer.setContent({
      id: state.id,
      to: state.to,
      from: state.from,
      location: state.location,
      date: formatDisplayDate(state.date),
      message: state.message,
      color: state.color,
      font: state.font
    });
  }

  function buildSwatches() {
    PostcardEngine.PALETTE.forEach(function (color) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.style.background = color;
      if (color === state.color) btn.classList.add("is-selected");
      btn.addEventListener("click", function () {
        state.color = color;
        Array.prototype.forEach.call(colorSwatches.children, function (c) { c.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        refresh();
      });
      colorSwatches.appendChild(btn);
    });
  }

  function buildFontOptions() {
    PostcardEngine.FONTS.forEach(function (font, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "font-option";
      btn.style.fontFamily = font.family;
      btn.textContent = font.label;
      if (i === 0) btn.classList.add("is-selected");
      btn.addEventListener("click", function () {
        state.font = font.id;
        Array.prototype.forEach.call(fontOptions.children, function (c) { c.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        refresh();
      });
      fontOptions.appendChild(btn);
    });
  }

  function handleMediaFile(file) {
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    var isImage = file.type.indexOf("image/") === 0;
    var promise = isImage ? renderer.loadImage(currentObjectUrl) : renderer.loadVideo(currentObjectUrl);
    promise.then(function () {
      renderer.start();
    }).catch(function (err) { console.error(err); });
  }

  function init() {
    fetch("/post-cards/strings.json").then(function (r) { return r.json(); }).then(function (strings) {
      document.title = strings.create.pageHeading;
      document.getElementById("pageHeading").textContent = strings.create.pageHeading;
      document.getElementById("pageIntro").textContent = strings.create.pageIntro;
      document.getElementById("mediaLabel").textContent = strings.create.mediaLabel;
      document.getElementById("mediaHint").textContent = strings.create.mediaHint;
      document.getElementById("messageLabel").textContent = strings.create.messageLabel;
      messageInput.placeholder = strings.create.messagePlaceholder;
      document.getElementById("locationLabel").textContent = strings.create.locationLabel;
      locationInput.placeholder = strings.create.locationPlaceholder;
      document.getElementById("colorLabel").textContent = strings.create.colorLabel;
      document.getElementById("fontLabel").textContent = strings.create.fontLabel;
      backLink.textContent = strings.create.backLinkLabel;
    });

    return PostcardEngine.init().then(function () {
      renderer.setMuted(true);
      renderer.fallbackText = "Choose a photo or video";
      state.color = PostcardEngine.PALETTE[0];
      state.font = PostcardEngine.FONTS[0].id;
      buildSwatches();
      buildFontOptions();
      refresh();
      renderer.start();

      messageInput.addEventListener("input", function () { state.message = messageInput.value; refresh(); });
      locationInput.addEventListener("input", function () { state.location = locationInput.value; refresh(); });
      mediaInput.addEventListener("change", function () { handleMediaFile(mediaInput.files[0]); });
    });
  }

  init();
})();
