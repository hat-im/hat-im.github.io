(function (PL) {
  // Distances are in canvas-space units (the SVG viewBox), not screen pixels,
  // so these stay correct regardless of how large the SVG is actually rendered.
  PL.SNAP_RADIUS = 8;
  PL.HOVER_RADIUS = 90;

  PL.distance = function (a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Converts a pointer event's screen coordinates into the SVG's own
  // viewBox coordinate space, accounting for however it's actually scaled/positioned.
  PL.svgPoint = function (clientX, clientY) {
    var svg = document.getElementById("dotsCanvas");
    var point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };

  PL.renderDots = function () {
    var dots = PL.state.joke.dots;
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

    PL.resetDrawing();
  };

  PL.resetDrawing = function () {
    document.getElementById("linesLayer").innerHTML = "";

    PL.state.joke.dots.forEach(function (dot, index) {
      var circle = document.getElementById("dot-" + index);
      circle.setAttribute("class", "dot" + (index === 0 ? " next" : ""));
      document.getElementById("dot-ping-" + index).classList.remove("active");
    });
  };

  PL.markConnected = function (index) {
    document.getElementById("dot-" + index).setAttribute("class", "dot connected");
    document.getElementById("dot-ping-" + index).classList.remove("active");
  };

  PL.markNext = function (index) {
    var dots = PL.state.joke.dots;
    if (index < dots.length) {
      document.getElementById("dot-" + index).setAttribute("class", "dot next");
    }
  };

  PL.setHover = function (index, isHovering) {
    var dots = PL.state.joke.dots;
    if (index >= dots.length) return;
    var ping = document.getElementById("dot-ping-" + index);
    ping.classList.toggle("active", isHovering);
  };

  // The visual stroke traces the actual pointer path (paint-like), independent
  // of the straight-line dot positions used for snap/advancement logic below.
  PL.beginStroke = function (point) {
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "dot-stroke");
    path.setAttribute("d", "M " + point.x + " " + point.y);
    document.getElementById("linesLayer").appendChild(path);
    PL.state.currentPath = path;
  };

  PL.extendStroke = function (point) {
    var path = PL.state.currentPath;
    if (!path) return;
    path.setAttribute("d", path.getAttribute("d") + " L " + point.x + " " + point.y);
  };
})(window.Punchlines);
