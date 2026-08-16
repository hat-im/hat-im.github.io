(function(){

var CRON_FIELDS = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];

// Parses a standard 5-field cron expression ("m h dom month dow") into named fields,
// with "*" read as null (wildcard/unconstrained).
function parseCron(expr) {
  var values = expr.trim().split(/\s+/);
  var parsed = {};
  CRON_FIELDS.forEach(function(field, i) {
    var value = values[i];
    parsed[field] = value === "*" ? null : parseInt(value, 10);
  });
  return parsed;
}

function cronMinutesOfDay(expr) {
  var fields = parseCron(expr);
  return fields.hour * 60 + fields.minute;
}

async function init(){
  var res = await fetch('index/data/config.json');
  var cfg = await res.json();

  var text = cfg.text;
  var alphabet = cfg.alphabet;
  var fontSize = cfg.fontSize;
  var lineHeight = cfg.lineHeight;
  var fontFamily = cfg.fontFamily;
  var delay = cfg.delay;
  var baseDecay = cfg.baseDecay;
  var revealDurationMs = cfg.revealDurationMs;
  var rampDurationMs = cfg.rampDurationMs;
  var rampExponent = cfg.rampExponent;
  var mouseFalloff = cfg.mouseFalloff;
  var mouseBoost = cfg.mouseBoost;
  var reduceFactor = cfg.reduceFactor;
  var darkModeStartCron = cfg.darkModeStartCron;
  var darkModeEndCron = cfg.darkModeEndCron;

  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");

  var cols, rows, grid = [], textIndices = [], startTime = 0, lastFrame = 0;
  var charWidth, charHeight;
  var mouseX = -1000, mouseY = -1000;
  var canvasTextColor = "";

  function checkDarkMode() {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    var startMinutes = cronMinutesOfDay(darkModeStartCron);
    var endMinutes = cronMinutesOfDay(darkModeEndCron);
    var darkMode = startMinutes <= endMinutes
      ? nowMinutes >= startMinutes && nowMinutes < endMinutes
      : nowMinutes >= startMinutes || nowMinutes < endMinutes;
    document.documentElement.classList.toggle("dark", darkMode);
    canvasTextColor = getComputedStyle(document.documentElement).getPropertyValue("--canvas-text").trim();
  }

  window.addEventListener("mousemove", function(e){
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function measureFontMetrics() {
    ctx.font = fontSize + "px " + fontFamily;
    var metrics = ctx.measureText("M");
    charWidth = metrics.width;
    charHeight = fontSize * lineHeight;
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    measureFontMetrics();
    cols = Math.ceil(window.innerWidth / charWidth);
    rows = Math.ceil(window.innerHeight / charHeight);

    grid = [];
    textIndices = [];
    var total = cols * rows;

    var startCol = Math.floor((cols - text.length) / 2);
    var startRow = Math.floor(rows / 2);
    var textStartIndex = startRow * cols + startCol;

    for (var i = 0; i < total; i++) {
      var o =
        i >= textStartIndex && i < textStartIndex + text.length
          ? text[i - textStartIndex]
          : " ";
      var isFinal = o !== " ";
      if (isFinal) textIndices.push(i);
      grid.push({ x: null, y: isFinal, z: 0, o: o });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = canvasTextColor;
    ctx.font = fontSize + "px " + fontFamily;
    ctx.textBaseline = "top";

    var topPadding = 1;
    for (var i = 0; i < grid.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var ch = grid[i].x === null ? " " : grid[i].x;
      var x = col * charWidth;
      var y = row * charHeight + topPadding;
      ctx.fillText(ch, x, y);
    }
  }

  function update(t) {
    if (!startTime) startTime = t;
    if (t - lastFrame < delay) return;

    var elapsed = t - startTime;
    var T = elapsed / revealDurationMs;
    var progress = Math.max(0, (elapsed - revealDurationMs) / rampDurationMs);
    var decayRate = Math.pow(Math.min(progress, 1), rampExponent) * baseDecay;
    var changed = false;

    if (T < 1) {
      var count = Math.floor(T * text.length) + 1;
      for (var i = 0; i < count && i < textIndices.length; i++) {
        var idx = textIndices[i];
        var g = grid[idx];
        if (g.o && g.x !== g.o) {
          g.x = g.o;
          changed = true;
        }
      }
    } else {
      grid.forEach(function(g, i){
        if (g.y) return;

        var col = i % cols;
        var row = Math.floor(i / cols);
        var cx = col * charWidth + charWidth / 2;
        var cy = row * charHeight + charHeight / 2;
        var dx = cx - mouseX;
        var dy = cy - mouseY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var boost = Math.exp(-dist * mouseFalloff);
        var decay = decayRate * (1 + mouseBoost * boost);
        var chance = 1 - Math.exp(-decay * (t - lastFrame));

        if (g.x === null) {
          if (Math.random() < chance) {
            g.n = 0;
            g.x = alphabet[g.n];
            g.z = t;
            changed = true;
          }
        } else {
          var reduceChance = 1 - Math.exp(-decay * (t - lastFrame) * reduceFactor);
          if (Math.random() < reduceChance) {
            g.n = (g.n + 1) % alphabet.length;
            g.x = alphabet[g.n];
            g.z = t;
            changed = true;
          }
        }
      });
    }

    if (changed) {
      draw();
      lastFrame = t;
    }
  }

  function loop(t) {
    update(t);
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", function(){
    resize();
    draw();
  });

  checkDarkMode();
  resize();
  draw();
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

window.addEventListener("load", init);

})();
