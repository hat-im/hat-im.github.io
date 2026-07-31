(function (DJ) {
  // Distances are in canvas-space units (the SVG viewBox), not screen pixels,
  // so these stay correct regardless of how large the SVG is actually rendered.
  DJ.SNAP_RADIUS = 8;
  DJ.HOVER_RADIUS = 90;

  DJ.distance = function (a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Converts a pointer event's screen coordinates into the SVG's own
  // viewBox coordinate space, accounting for however it's actually scaled/positioned.
  DJ.svgPoint = function (clientX, clientY) {
    var svg = document.getElementById("dotsCanvas");
    var point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };

  DJ.renderDots = function () {
    var dots = DJ.state.joke.dots;
    var dotsLayer = document.getElementById("dotsLayer");
    dotsLayer.innerHTML = "";

    dots.forEach(function (dot, index) {
      var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("id", "dot-" + index);
      circle.setAttribute("class", "dot");
      circle.setAttribute("cx", dot.x);
      circle.setAttribute("cy", dot.y);
      circle.setAttribute("r", 3);
      dotsLayer.appendChild(circle);

      // A separate ring that only appears while hovering, so it can grow/fade
      // (a radar-blip ping) without affecting the dot's own fixed radius.
      var ping = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ping.setAttribute("id", "dot-ping-" + index);
      ping.setAttribute("class", "dot-ping");
      ping.setAttribute("cx", dot.x);
      ping.setAttribute("cy", dot.y);
      ping.setAttribute("r", 3);
      dotsLayer.appendChild(ping);

      var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "dot-number");
      label.setAttribute("x", dot.x + 7);
      label.setAttribute("y", dot.y - 7);
      label.setAttribute("text-anchor", "start");
      label.textContent = index + 1;
      dotsLayer.appendChild(label);
    });

    DJ.resetDrawing();
  };

  DJ.resetDrawing = function () {
    document.getElementById("linesLayer").innerHTML = "";

    DJ.state.joke.dots.forEach(function (dot, index) {
      var circle = document.getElementById("dot-" + index);
      circle.setAttribute("class", "dot" + (index === 0 ? " next" : ""));
      document.getElementById("dot-ping-" + index).classList.remove("active");
    });
  };

  DJ.markConnected = function (index) {
    document.getElementById("dot-" + index).setAttribute("class", "dot connected");
    document.getElementById("dot-ping-" + index).classList.remove("active");
  };

  DJ.markNext = function (index) {
    var dots = DJ.state.joke.dots;
    if (index < dots.length) {
      document.getElementById("dot-" + index).setAttribute("class", "dot next");
    }
  };

  DJ.setHover = function (index, isHovering) {
    var dots = DJ.state.joke.dots;
    if (index >= dots.length) return;
    var ping = document.getElementById("dot-ping-" + index);
    ping.classList.toggle("active", isHovering);
  };

  // The visual stroke traces the actual pointer path (paint-like), independent
  // of the straight-line dot positions used for snap/advancement logic below.
  DJ.beginStroke = function (point) {
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "dot-stroke");
    path.setAttribute("d", "M " + point.x + " " + point.y);
    document.getElementById("linesLayer").appendChild(path);
    DJ.state.currentPath = path;
  };

  DJ.extendStroke = function (point) {
    var path = DJ.state.currentPath;
    if (!path) return;
    path.setAttribute("d", path.getAttribute("d") + " L " + point.x + " " + point.y);
  };
})(window.DadJokes);
