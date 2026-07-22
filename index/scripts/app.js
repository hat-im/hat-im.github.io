(function(){

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

  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");

  var cols, rows, grid = [], textIndices = [], startTime = 0, lastFrame = 0;
  var charWidth, charHeight;
  var mouseX = -1000, mouseY = -1000;
  var darkMode = false;

  function checkDarkMode() {
    var hour = new Date().getHours();
    darkMode = hour >= 18 || hour < 6;
    document.body.style.background = darkMode ? "#111" : "#fefefe";
    document.body.style.color = darkMode ? "#fefefe" : "#111";
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
      grid.push({ x: " ", y: isFinal, z: 0, o: o });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = darkMode ? "#fefefe" : "#333";
    ctx.font = fontSize + "px " + fontFamily;
    ctx.textBaseline = "top";

    var topPadding = 1;
    for (var i = 0; i < grid.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var ch = grid[i].x;
      var x = col * charWidth;
      var y = row * charHeight + topPadding;
      ctx.fillText(ch, x, y);
    }
  }

  function update(t) {
    if (!startTime) startTime = t;
    if (t - lastFrame < delay) return;

    var elapsed = t - startTime;
    var T = elapsed / 2000;
    var progress = Math.max(0, (elapsed - 2000) / 20000);
    var decayRate = Math.pow(Math.min(progress, 1), 10) * baseDecay;
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
        var boost = Math.exp(-dist * 0.02);
        var decay = decayRate * (1 + 35 * boost);
        var chance = 1 - Math.exp(-decay * (t - lastFrame));

        if (g.x === " ") {
          if (Math.random() < chance) {
            g.x = alphabet[Math.floor(Math.random() * alphabet.length)];
            g.z = t;
            changed = true;
          }
        } else {
          var reduceChance = 1 - Math.exp(-decay * (t - lastFrame) * 0.3);
          if (Math.random() < reduceChance) {
            g.x = alphabet[Math.floor(Math.random() * alphabet.length)];
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
