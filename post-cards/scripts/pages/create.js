(function () {
  "use strict";

  var canvas = document.getElementById("postcardCanvas");
  var mediaInput = document.getElementById("mediaInput");
  var toInput = document.getElementById("toInput");
  var fromInput = document.getElementById("fromInput");
  var subjectInput = document.getElementById("subjectInput");
  var messageInput = document.getElementById("messageInput");
  var postscriptInput = document.getElementById("postscriptInput");
  var locationInput = document.getElementById("locationInput");
  var colorSwatches = document.getElementById("colorSwatches");
  var backLink = document.getElementById("backLink");
  var shuffleBtn = document.getElementById("shuffleBtn");
  var downloadGifBtn = document.getElementById("downloadGifBtn");

  var lockableInputs = [
    mediaInput, toInput, fromInput, subjectInput, messageInput, postscriptInput, locationInput
  ];

  var GifConfig = window.CreateConfig;
  var gifProgressTimer = null;
  var gifPhraseSequence = [];
  var gifPhraseIndex = -1;

  var renderer = new PostcardEngine.PostcardRenderer(canvas);
  var currentObjectUrl = null;
  var uiStrings = null;
  var state = {
    id: "draft",
    to: "",
    from: "",
    date: new Date().toISOString().slice(0, 10),
    seed: null,
    location: "",
    subject: "",
    message: "",
    postscript: "",
    color: null,
    mediaFps: null
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
      seed: state.seed,
      subject: state.subject,
      message: state.message,
      postscript: state.postscript,
      color: state.color
    });
  }

  function buildSwatches() {
    var names = PostcardEngine.PALETTE_NAMES;
    var entries = Object.keys(names).map(function (name) {
      return { name: name, hex: names[name] };
    });
    entries.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    entries.forEach(function (entry) {
      var color = entry.hex;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.style.background = color;
      btn.title = entry.name;
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

  // Briefly plays the video to sample how many real frames it decodes per second of
  // currentTime — so the GIF export matches what was actually uploaded, not a guess.
  function measureVideoFps(video) {
    if (typeof video.getVideoPlaybackQuality !== "function") return Promise.resolve(null);
    var startFrames = video.getVideoPlaybackQuality().totalVideoFrames;
    var startTime = video.currentTime;
    return video.play().then(function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var frames = video.getVideoPlaybackQuality().totalVideoFrames - startFrames;
          var elapsed = video.currentTime - startTime;
          // keep playing — this is just a sample, the live preview loop still needs the video
          // actually running or it'll sit frozen on whatever frame we stopped sampling on
          video.play().catch(function () {});
          resolve(frames > 0 && elapsed > 0 ? frames / elapsed : null);
        }, GifConfig.GIF_FPS_SAMPLE_MS);
      });
    }).catch(function () { return null; });
  }

  function clampFps(fps) {
    return Math.min(GifConfig.GIF_MAX_FPS, Math.max(GifConfig.GIF_MIN_FPS, fps));
  }

  function handleMediaFile(file) {
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    var isImage = file.type.indexOf("image/") === 0;
    state.mediaFps = null;
    var promise = isImage ? renderer.loadImage(currentObjectUrl) : renderer.loadVideo(currentObjectUrl);
    promise.then(function () {
      renderer.start();
      if (!isImage) {
        return measureVideoFps(renderer.video).then(function (fps) {
          state.mediaFps = clampFps(fps || GifConfig.GIF_FALLBACK_FPS);
        });
      }
    }).catch(function (err) { console.error(err); });
  }

  function shuffleDecorations() {
    state.seed = String(Math.random());
    refresh();
  }

  function setFormLocked(locked) {
    lockableInputs.forEach(function (el) { el.disabled = locked; });
    Array.prototype.forEach.call(colorSwatches.children, function (btn) { btn.disabled = locked; });
    shuffleBtn.disabled = locked;
  }

  function gifFileName() {
    var slug = (state.subject || "postcard").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return (slug || "postcard") + ".gif";
  }

  function stopGifProgress() {
    if (gifProgressTimer) {
      clearInterval(gifProgressTimer);
      gifProgressTimer = null;
    }
  }

  // Shown only before the first real progress step arrives — there's no rendering work to
  // report on yet, so this is the one place an animation runs on a timer instead of a step.
  function startGifEllipsis() {
    var base = (uiStrings && uiStrings.downloadGifBusyLabel) || "Generating";
    var dots = 0;
    stopGifProgress();
    downloadGifBtn.textContent = base;
    gifProgressTimer = setInterval(function () {
      dots = (dots + 1) % 4;
      downloadGifBtn.textContent = base + ".".repeat(dots);
    }, GifConfig.GIF_PROGRESS_ELLIPSIS_MS);
  }

  // Picks N phrases from the pool via random forward-only hops, fixed for one export run.
  function pickPhraseSequence(pool, n) {
    var sequence = [];
    if (!pool || !pool.length) return sequence;
    var i = Math.floor(Math.random() * pool.length);
    for (var k = 0; k < n; k++) {
      sequence.push(pool[i]);
      i = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    }
    return sequence;
  }

  // Advances the button to the sequence's next phrase the moment real progress (0-1) crosses
  // into a new step, so the text only ever changes in step with actual capture/encode work.
  function showGifStep(fraction) {
    if (!gifPhraseSequence.length) return;
    var idx = Math.min(gifPhraseSequence.length - 1, Math.floor(fraction * gifPhraseSequence.length));
    if (idx === gifPhraseIndex) return;
    gifPhraseIndex = idx;
    stopGifProgress();
    downloadGifBtn.textContent = gifPhraseSequence[idx] + "…";
  }

  function resetGifButton() {
    stopGifProgress();
    gifPhraseSequence = [];
    gifPhraseIndex = -1;
    downloadGifBtn.disabled = false;
    downloadGifBtn.textContent = (uiStrings && uiStrings.downloadGifLabel) || "Generate GIF";
    setFormLocked(false);
  }

  function showGifSuccess() {
    stopGifProgress();
    downloadGifBtn.textContent = (uiStrings && uiStrings.downloadGifSuccessLabel) || "Saved!";
    setTimeout(resetGifButton, GifConfig.GIF_SUCCESS_DISPLAY_MS);
  }

  // Seeks the video (or just captures once, for a static card) frame by frame across one loop
  // so the GIF captures real motion instead of a single still — gif.js copies each frame's
  // pixels the moment addFrame() runs, so this must stay strictly sequential. Each frame comes
  // from captureExportFrame(), the untilted card-only render, not the live rotated canvas.
  function captureFrames(gif, onProgress) {
    var duration = renderer.getLoopDuration();
    if (!duration) {
      gif.addFrame(renderer.captureExportFrame(), { copy: true, delay: GifConfig.GIF_STATIC_DELAY_MS });
      return Promise.resolve();
    }
    var fps = state.mediaFps || GifConfig.GIF_FALLBACK_FPS;
    var frameCount = Math.min(GifConfig.GIF_MAX_FRAMES, Math.max(1, Math.round(duration * fps)));
    var delayMs = Math.max(20, Math.round((duration * 1000) / frameCount));
    var i = 0;
    function next() {
      if (i >= frameCount) return Promise.resolve();
      var t = (duration * i) / frameCount;
      return renderer.renderFrameAtTime(t).then(function () {
        gif.addFrame(renderer.captureExportFrame(), { copy: true, delay: delayMs });
        i += 1;
        if (onProgress) onProgress(i / frameCount);
        return next();
      });
    }
    return next();
  }

  function downloadGif() {
    if (downloadGifBtn.disabled) return;
    downloadGifBtn.disabled = true;
    setFormLocked(true);
    gifPhraseSequence = pickPhraseSequence(uiStrings && uiStrings.gifProgressPhrases, GifConfig.GIF_PHRASE_STEPS);
    gifPhraseIndex = -1;
    startGifEllipsis();

    renderer.stop();
    renderer.video.pause();

    // however capture/encoding goes, the live preview must resume — otherwise a failed or
    // hung export leaves the canvas frozen with no way to recover short of reloading the page
    function resumePreview() {
      renderer.start();
    }

    var exportCanvas = renderer.captureExportFrame();
    var gif = new GIF({
      workers: 2,
      quality: 1,
      width: exportCanvas.width,
      height: exportCanvas.height,
      workerScript: "/post-cards/scripts/vendor/gif.worker.js"
    });

    // capture is the first half of the work, encoding (gif.js's own progress) the second —
    // together they drive every phrase change, so the button only updates on real progress
    gif.on("progress", function (fraction) { showGifStep(0.5 + fraction * 0.5); });

    gif.on("finished", function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = gifFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      resumePreview();
      showGifSuccess();
    });
    gif.on("abort", function () {
      resumePreview();
      resetGifButton();
    });

    captureFrames(gif, function (fraction) { showGifStep(fraction * 0.5); }).then(function () {
      gif.render();
    }).catch(function (err) {
      console.error(err);
      resumePreview();
      resetGifButton();
    });
  }

  function init() {
    fetch("/post-cards/strings.json").then(function (r) { return r.json(); }).then(function (strings) {
      uiStrings = strings.create;
      document.title = strings.create.pageHeading;
      document.getElementById("pageHeading").textContent = strings.create.pageHeading;
      document.getElementById("pageIntro").textContent = strings.create.pageIntro;
      document.getElementById("mediaLabel").textContent = strings.create.mediaLabel;
      document.getElementById("mediaHint").textContent = strings.create.mediaHint;
      renderer.fallbackText = strings.create.mediaFallbackText;
      document.getElementById("subjectLabel").textContent = strings.create.subjectLabel;
      subjectInput.placeholder = strings.create.subjectPlaceholder;
      document.getElementById("messageLabel").textContent = strings.create.messageLabel;
      messageInput.placeholder = strings.create.messagePlaceholder;
      document.getElementById("postscriptLabel").textContent = strings.create.postscriptLabel;
      postscriptInput.placeholder = strings.create.postscriptPlaceholder;
      document.getElementById("locationLabel").textContent = strings.create.locationLabel;
      locationInput.placeholder = strings.create.locationPlaceholder;
      document.getElementById("colorLabel").textContent = strings.create.colorLabel;
      document.getElementById("toLabel").textContent = strings.create.toLabel;
      toInput.placeholder = strings.create.toPlaceholder;
      document.getElementById("fromLabel").textContent = strings.create.fromLabel;
      fromInput.placeholder = strings.create.fromPlaceholder;
      backLink.textContent = strings.create.backLinkLabel;
      shuffleBtn.textContent = strings.create.shuffleLabel;
      downloadGifBtn.textContent = strings.create.downloadGifLabel;
    });

    return PostcardEngine.init().then(function () {
      renderer.setMuted(true);
      state.color = PostcardEngine.PALETTE[0];
      buildSwatches();
      refresh();
      renderer.start();

      toInput.addEventListener("input", function () { state.to = toInput.value; refresh(); });
      fromInput.addEventListener("input", function () { state.from = fromInput.value; refresh(); });
      subjectInput.addEventListener("input", function () { state.subject = subjectInput.value; refresh(); });
      messageInput.addEventListener("input", function () { state.message = messageInput.value; refresh(); });
      postscriptInput.addEventListener("input", function () { state.postscript = postscriptInput.value; refresh(); });
      locationInput.addEventListener("input", function () { state.location = locationInput.value; refresh(); });
      mediaInput.addEventListener("change", function () { handleMediaFile(mediaInput.files[0]); });
      shuffleBtn.addEventListener("click", shuffleDecorations);
      downloadGifBtn.addEventListener("click", downloadGif);
    });
  }

  init();
})();
