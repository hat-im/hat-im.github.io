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
  var shapePath2Ds = {};
  var separationDistanceSq = 0;

  function resolveColorRgb(colorVar) {
    var hex = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return "58,58,68";
    return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function pickWeighted(items) {
    var totalWeight = items.reduce(function (sum, item) { return sum + item.weight; }, 0);
    var r = Math.random() * totalWeight;
    for (var i = 0; i < items.length; i++) {
      r -= items[i].weight;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function spawnBoids() {
    boids = [];
    var order = [];
    for (var i = 0; i < C.flockSize; i++) order.push(i);
    order.sort(function () { return Math.random() - 0.5; });

    for (var j = 0; j < C.flockSize; j++) {
      var category = pickWeighted(C.categories);
      var shapeId = category.shapeIds[Math.floor(Math.random() * category.shapeIds.length)];
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * category.maxSpeed;
      var vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
      var depth = Math.random() * 2 - 1;
      boids.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: vx,
        vy: vy,
        rotation: Math.atan2(vx, -vy) + Math.PI / 2,
        flutterPhase: Math.random() * Math.PI * 2,
        category: category,
        path2d: shapePath2Ds[shapeId],
        shade: 1 + depth * category.colorAlphaVariance,
        speedScale: 1 + depth * category.depthSpeedVariance,
        sizeScale: 1 + depth * category.depthSizeVariance + (Math.random() * 2 - 1) * category.sizeJitter,
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

  function wrapAngleDelta(d) {
    d = d % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function lerpAngle(a, b, t) {
    return a + wrapAngleDelta(b - a) * t;
  }

  function windVector(now) {
    var wander = Math.sin((2 * Math.PI * (now - startTime)) / C.wind.periodMs) * C.wind.angleVariance;
    var angle = C.wind.angle + wander;
    return { x: Math.cos(angle) * C.wind.speed, y: Math.sin(angle) * C.wind.speed };
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
      wind: C.wind.weight,
      perception: lerp(C.scatter.perception, C.herd.perception, t)
    };
  }

  function steeringForces(b, params, windVec, now) {
    var perceptionSq = params.perception * params.perception;
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

    return {
      align: alignN ? normalize(alignX / alignN - b.vx, alignY / alignN - b.vy) : { x: 0, y: 0 },
      coh: cohN ? normalize(cohX / cohN, cohY / cohN) : { x: 0, y: 0 },
      sep: normalize(sepX, sepY),
      wind: normalize(windVec.x - b.vx, windVec.y - b.vy),
      neighborCount: alignN
    };
  }

  function step(params, now) {
    var windVec = windVector(now);

    boids.forEach(function (b) {
      if (b.spawnTime > now) return;

      var f = steeringForces(b, params, windVec, now);

      var ax = (f.align.x * params.alignment + f.coh.x * params.cohesion + f.sep.x * params.separation + f.wind.x * params.wind) * C.accelerationScale;
      var ay = (f.align.y * params.alignment + f.coh.y * params.cohesion + f.sep.y * params.separation + f.wind.y * params.wind) * C.accelerationScale;
      var a = limit(ax, ay, C.maxForce);

      var flockSpeed = (b.category.maxSpeed + f.neighborCount * b.category.speedPerNeighbor) * b.speedScale;
      var v = limit(b.vx + a.x, b.vy + a.y, flockSpeed);
      b.vx = v.x; b.vy = v.y;
      b.x += b.vx; b.y += b.vy;

      var targetRotation = Math.atan2(b.vx, -b.vy) + Math.PI / 2;
      b.rotation = lerpAngle(b.rotation, targetRotation, b.category.rotationSmoothing);
      var flutter = Math.sin(now * b.category.flutterSpeed + b.flutterPhase) * b.category.flutterAmplitude;
      b.displayRotation = b.rotation + flutter;

      if (b.x < 0) b.x += width;
      if (b.y < 0) b.y += height;
      if (b.x >= width) b.x -= width;
      if (b.y >= height) b.y -= height;
    });
  }

  function drawIcon(x, y, rotation, sizeScale, category, path2d) {
    var scale = (category.iconSize * sizeScale) / C.shapeViewBox;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-C.shapeViewBox / 2, -C.shapeViewBox / 2);
    ctx.fill(path2d);
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    boids.forEach(function (b) {
      if (b.spawnTime > now) return;
      var alpha = Math.max(0, Math.min(1, b.category.colorAlpha * b.shade));
      ctx.fillStyle = "rgba(" + b.category.rgb + "," + alpha + ")";
      drawIcon(b.x, b.y, b.displayRotation, b.sizeScale, b.category, b.path2d);
    });
  }

  function loop() {
    var now = performance.now();
    step(currentParams(now), now);
    draw(now);
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);

  Promise.all([
    fetch("/post-cards/data/background/boids.json").then(function (r) { return r.json(); }),
    fetch("/post-cards/data/background/boids-shapes.json").then(function (r) { return r.json(); })
  ]).then(function (results) {
    C = results[0];
    var shapes = results[1].shapes;

    Object.keys(shapes).forEach(function (id) {
      shapePath2Ds[id] = new Path2D(shapes[id]);
    });
    C.categories.forEach(function (category) {
      category.rgb = resolveColorRgb(category.colorVar);
    });

    separationDistanceSq = C.separationDistance * C.separationDistance;
    resize();
    spawnBoids();
    requestAnimationFrame(loop);
  });
})();
