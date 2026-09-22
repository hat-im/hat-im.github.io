(function () {
  "use strict";

  // Captures each video's first frame into an offscreen canvas, keyed by src, so a postcard
  // navigated to can show that instantly as a poster while its real video loads in the
  // background (see PostcardRenderer.setPosterImage). cache[src] is null while a capture is
  // still pending, so warm() never starts the same src twice.
  var cache = {};

  function captureFirstFrame(src) {
    return new Promise(function (resolve) {
      var video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";

      var finish = function (canvas) {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
        resolve(canvas);
      };
      var onReady = function () {
        var canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (!canvas.width || !canvas.height) { finish(null); return; }
        try {
          canvas.getContext("2d").drawImage(video, 0, 0);
          finish(canvas);
        } catch (e) {
          finish(null);
        }
      };
      var onError = function () { finish(null); };

      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = src;
      video.load();
    });
  }

  function warm(src) {
    if (!src || Object.prototype.hasOwnProperty.call(cache, src)) return;
    cache[src] = null;
    captureFirstFrame(src).then(function (canvas) { cache[src] = canvas; });
  }

  function get(src) {
    return (src && cache[src]) || null;
  }

  window.PostcardVideoCache = { warm: warm, get: get };
})();
