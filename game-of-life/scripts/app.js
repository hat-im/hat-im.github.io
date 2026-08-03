(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // ----- dimensions -----
  let COLS = 80;
  let ROWS = 60;
  let CELL = 10;

  function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const w = container.clientWidth;
    const h = container.clientHeight;
    let cols = Math.floor(w / 10);
    let rows = Math.floor(h / 10);
    if (cols < 40) cols = 40;
    if (rows < 30) rows = 30;
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    const cell = Math.min(cellW, cellH, 14);
    const finalCols = Math.floor(w / cell);
    const finalRows = Math.floor(h / cell);
    COLS = Math.min(finalCols, 120);
    ROWS = Math.min(finalRows, 90);
    CELL = Math.floor(Math.min(w / COLS, h / ROWS));
    if (CELL < 4) CELL = 4;
    const usedCols = Math.floor(w / CELL);
    const usedRows = Math.floor(h / CELL);
    COLS = Math.min(usedCols, 140);
    ROWS = Math.min(usedRows, 100);
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    if (grid) draw();
  }

  // ----- custom paint colour (default red) -----
  let customPaint = { r: 255, g: 60, b: 60 };

  // DOM refs
  const rInput = document.getElementById('r-input');
  const gInput = document.getElementById('g-input');
  const bInput = document.getElementById('b-input');
  const swatchEl = document.getElementById('custom-swatch');

  function updateCustomSwatch() {
    const { r, g, b } = customPaint;
    swatchEl.style.background = `rgb(${r},${g},${b})`;
    // also update inputs if they don't match (avoid loops)
    if (parseInt(rInput.value) !== r) rInput.value = r;
    if (parseInt(gInput.value) !== g) gInput.value = g;
    if (parseInt(bInput.value) !== b) bInput.value = b;
  }

  function syncFromInputs() {
    let r = parseInt(rInput.value);
    let g = parseInt(gInput.value);
    let b = parseInt(bInput.value);
    if (isNaN(r)) r = 0;
    if (isNaN(g)) g = 0;
    if (isNaN(b)) b = 0;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    customPaint.r = r;
    customPaint.g = g;
    customPaint.b = b;
    updateCustomSwatch();
  }

  rInput.addEventListener('input', syncFromInputs);
  gInput.addEventListener('input', syncFromInputs);
  bInput.addEventListener('input', syncFromInputs);
  // also on blur to clamp
  [rInput, gInput, bInput].forEach(inp => {
    inp.addEventListener('blur', () => {
      let val = parseInt(inp.value);
      if (isNaN(val)) val = 0;
      val = Math.min(255, Math.max(0, val));
      inp.value = val;
      syncFromInputs();
    });
  });

  // quick presets: R, G, B keys
  function setPreset(r, g, b) {
    customPaint.r = r;
    customPaint.g = g;
    customPaint.b = b;
    updateCustomSwatch();
  }

  // initial swatch
  updateCustomSwatch();

  // ----- grid -----
  function createGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }
  let grid = createGrid();

  // ----- draw -----
  function draw() {
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        if (cell) {
          ctx.fillStyle = `rgb(${cell.r | 0},${cell.g | 0},${cell.b | 0})`;
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
        ctx.strokeStyle = '#252525';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  // ----- neighbours -----
  function neighbours(x, y) {
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
          const c = grid[ny][nx];
          if (c) list.push(c);
        }
      }
    }
    return list;
  }

  // ----- colour mixing (competition + jitter) -----
  function averageColour(neighbours) {
    let r = 0, g = 0, b = 0;
    const len = neighbours.length;
    if (len === 0) return { r: 140, g: 140, b: 140 };

    for (const c of neighbours) {
      r += c.r; g += c.g; b += c.b;
    }
    r /= len; g /= len; b /= len;

    const diff = (Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) / (3 * 255);
    const strength = Math.min(1, diff * 1.3 + 0.12);

    let dr = (r - g) * strength * 0.55;
    let dg = (g - b) * strength * 0.55;
    let db = (b - r) * strength * 0.55;

    r += dr - db;
    g += dg - dr;
    b += db - dg;

    const jitter = 5 * strength + 1.5;
    r += (Math.random() * 2 - 1) * jitter;
    g += (Math.random() * 2 - 1) * jitter;
    b += (Math.random() * 2 - 1) * jitter;

    return {
      r: Math.max(0, Math.min(255, Math.round(r))),
      g: Math.max(0, Math.min(255, Math.round(g))),
      b: Math.max(0, Math.min(255, Math.round(b)))
    };
  }

  // ----- step -----
  function step() {
    const next = createGrid();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const alive = grid[y][x];
        const n = neighbours(x, y);
        if (alive) {
          if (n.length === 2 || n.length === 3) {
            next[y][x] = alive;
          }
        } else {
          if (n.length === 3) {
            next[y][x] = averageColour(n);
          }
        }
      }
    }
    grid = next;
    draw();
  }

  // ----- random (full RGB) -----
  function randomGrid() {
    grid = createGrid();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (Math.random() < 0.25) {
          grid[y][x] = {
            r: Math.floor(Math.random() * 256),
            g: Math.floor(Math.random() * 256),
            b: Math.floor(Math.random() * 256)
          };
        }
      }
    }
    draw();
  }

  // ----- clear -----
  function clearGrid() {
    grid = createGrid();
    draw();
  }

  // ----- controls -----
  let running = false;
  let timer = null;

  function getFps() {
    return Number(document.getElementById('speed').value);
  }

  function startStop() {
    running = !running;
    document.getElementById('start').textContent = running ? 'Pause' : 'Start';
    if (running) {
      timer = setInterval(step, 1000 / getFps());
    } else {
      clearInterval(timer);
      timer = null;
    }
  }

  const speedSlider = document.getElementById('speed');
  const speedLabel = document.getElementById('speed-label');
  speedSlider.addEventListener('input', function () {
    const val = this.value;
    speedLabel.textContent = val;
    if (running) {
      clearInterval(timer);
      timer = setInterval(step, 1000 / getFps());
    }
  });

  document.getElementById('start').addEventListener('click', startStop);
  document.getElementById('step').addEventListener('click', () => {
    if (!running) step();
  });
  document.getElementById('random').addEventListener('click', randomGrid);
  document.getElementById('clear').addEventListener('click', clearGrid);

  // ----- painting (left / right) -----
  function getCellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const x = Math.floor(mx / CELL);
    const y = Math.floor(my / CELL);
    return { x, y };
  }

  canvas.addEventListener('click', (e) => {
    const { x, y } = getCellFromEvent(e);
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      grid[y][x] = { ...customPaint };
      draw();
    }
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { x, y } = getCellFromEvent(e);
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      grid[y][x] = null;
      draw();
    }
  });

  // ----- keyboard: R, G, B presets (also keep RGB inputs) -----
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'r') {
      setPreset(255, 40, 40);
      e.preventDefault();
    } else if (key === 'g') {
      setPreset(40, 240, 50);
      e.preventDefault();
    } else if (key === 'b') {
      setPreset(40, 100, 255);
      e.preventDefault();
    }
  });

  // ----- resize -----
  let resizeTimeout;
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const oldGrid = grid;
      const oldCols = COLS;
      const oldRows = ROWS;
      resizeCanvas();
      const newGrid = createGrid();
      for (let y = 0; y < Math.min(oldRows, ROWS); y++) {
        for (let x = 0; x < Math.min(oldCols, COLS); x++) {
          if (oldGrid[y] && oldGrid[y][x]) {
            newGrid[y][x] = { ...oldGrid[y][x] };
          }
        }
      }
      grid = newGrid;
      draw();
    }, 60);
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 200);
  });

  // initial
  resizeCanvas();
  randomGrid();
})();
