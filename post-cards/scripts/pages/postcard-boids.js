(function () {
  "use strict";

  var canvas = document.getElementById("boidsCanvas");
  if (!canvas) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var ctx = canvas.getContext("2d");
  var width = 0, height = 0;
  var boids = [];
  var startTime = performance.now();
  var C = null;
  var separationDistanceSq = 0;
  var envelopeRgb = "";

  function resolveColor() {
    return getComputedStyle(document.documentElement).getPropertyValue(C.colorVar).trim();
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function spawnBoids() {
    boids = [];
    var order = [];
    for (var i = 0; i < C.flockSize; i++) order.push(i);
    order.sort(function () { return Math.random() - 0.5; });

    for (var j = 0; j < C.flockSize; j++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * C.maxSpeed;
      boids.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spawnTime: startTime + (order[j] / C.flockSize) * C.phasePeriodMs
      });
    }
  }

  function normalize(x, y) {
    var mag = Math.sqrt(x * x + y * y);
    return mag === 0 ? { x: 0, y: 0 } : { x: x / mag, y: y / mag };
  }

  function limit(x, y, max) {
    var mag = Math.sqrt(x * x + y * y);
    return mag > max ? { x: (x / mag) * max, y: (y / mag) * max } : { x: x, y: y };
  }

  function wrapAxisDelta(a, b, size) {
    var d = b - a;
    if (d > size / 2) d -= size;
    if (d < -size / 2) d += size;
    return d;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function herdPhaseFactor(now) {
    return (Math.sin((2 * Math.PI * (now - startTime)) / C.phasePeriodMs) + 1) / 2;
  }

  function currentParams(now) {
    var t = herdPhaseFactor(now);
    return {
      alignment: lerp(C.scatter.alignment, C.herd.alignment, t),
      cohesion: lerp(C.scatter.cohesion, C.herd.cohesion, t),
      separation: lerp(C.scatter.separation, C.herd.separation, t),
      perception: lerp(C.scatter.perception, C.herd.perception, t)
    };
  }

  function step(params, now) {
    var perceptionSq = params.perception * params.perception;

    boids.forEach(function (b) {
      if (b.spawnTime > now) return;

      var alignX = 0, alignY = 0, alignN = 0;
      var cohX = 0, cohY = 0, cohN = 0;
      var sepX = 0, sepY = 0;

      boids.forEach(function (other) {
        if (other === b || other.spawnTime > now) return;
        var wx = wrapAxisDelta(b.x, other.x, width), wy = wrapAxisDelta(b.y, other.y, height);
        var distSq = wx * wx + wy * wy;
        if (distSq < perceptionSq) {
          alignX += other.vx; alignY += other.vy; alignN++;
          cohX += wx; cohY += wy; cohN++;
        }
        if (distSq < separationDistanceSq) {
          sepX -= wx; sepY -= wy;
        }
      });

      var align = alignN ? normalize(alignX / alignN - b.vx, alignY / alignN - b.vy) : { x: 0, y: 0 };
      var coh = cohN ? normalize(cohX / cohN, cohY / cohN) : { x: 0, y: 0 };
      var sep = normalize(sepX, sepY);

      var ax = (align.x * params.alignment + coh.x * params.cohesion + sep.x * params.separation) * C.accelerationScale;
      var ay = (align.y * params.alignment + coh.y * params.cohesion + sep.y * params.separation) * C.accelerationScale;
      var a = limit(ax, ay, C.maxForce);

      var flockSpeed = C.maxSpeed + alignN * C.speedPerNeighbor;
      var v = limit(b.vx + a.x, b.vy + a.y, flockSpeed);
      b.vx = v.x; b.vy = v.y;
      b.x += b.vx; b.y += b.vy;

      if (b.x < 0) b.x += width;
      if (b.y < 0) b.y += height;
      if (b.x >= width) b.x -= width;
      if (b.y >= height) b.y -= height;
    });
  }

  var tracePathPoints = window.PostcardRenderUtils.tracePathPoints;

  function drawEnvelope(x, y, rotation) {
    var w = C.envelopeWidth, h = C.envelopeHeight;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    tracePathPoints(ctx, C.envelopeShape.body, w, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    tracePathPoints(ctx, C.envelopeShape.flap, w, h);
    ctx.stroke();

    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(" + envelopeRgb + "," + C.colorAlpha * 0.35 + ")";
    ctx.strokeStyle = "rgba(" + envelopeRgb + "," + C.colorAlpha + ")";
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    boids.forEach(function (b) {
      if (b.spawnTime > now) return;
      drawEnvelope(b.x, b.y, Math.atan2(b.vx, -b.vy) + Math.PI / 2);
    });
  }

  function loop() {
    var now = performance.now();
    step(currentParams(now), now);
    draw(now);
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);

  fetch("/post-cards/data/background/boids.json")
    .then(function (r) { return r.json(); })
    .then(function (config) {
      C = config;
      separationDistanceSq = C.separationDistance * C.separationDistance;
      envelopeRgb = hexToRgbString(resolveColor());
      resize();
      spawnBoids();
      requestAnimationFrame(loop);
    });

  function hexToRgbString(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return "58,58,68";
    return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
  }
})();
