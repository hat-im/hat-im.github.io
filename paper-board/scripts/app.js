(function () {
  'use strict';

  var BASE = 'paper-board/';
  var STRINGS_URL = BASE + 'strings.json';
  var SEED_URL = BASE + 'data/papers.json';
  var JOURNALS_URL = BASE + 'data/journals.json';
  var AUTHORS_URL = BASE + 'data/authors.json';
  var KEYWORDS_URL = BASE + 'data/keywords.json';

  var STR = {};
  var SEED = null;
  var STORAGE_KEY = 'paper-board-state-v1';
  var store = null;

  var state = {
    papers: [],
    keywordColors: {},
    activeKeywords: new Set(),
    activeAuthors: new Set(),
    activeVenues: new Set(),
    searchTerm: '',
    keywordsExpanded: false,
    authorsExpanded: false,
    venuesExpanded: false,
    sortBy: { unread: 'added-desc', 'pass-1': 'added-desc', 'pass-2': 'added-desc', 'pass-3': 'added-desc' }
  };

  var AUTHOR_CHIP_MIN_COUNT = 3;
  var VENUE_CHIP_MIN_COUNT = 2;
  // One column per pass level (0-3): unread (nothing done yet) through
  // pass-3 (fully read). Column index === pass level.
  var PASS_COLUMNS = ['unread', 'pass-1', 'pass-2', 'pass-3'];
  var PASS_COLUMN_LEVEL = { unread: 0, 'pass-1': 1, 'pass-2': 2, 'pass-3': 3 };
  var STALE_MS = 14 * 24 * 60 * 60 * 1000;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function nowISO() { return new Date().toISOString(); }

  function fmt(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, key) { return vars[key]; });
  }

  // ---------- Persistence ----------

  async function loadState() {
    var winner = await store.load();

    if (winner) {
      state.papers = winner.data.papers;
      state.keywordColors = winner.data.keywordColors || SEED.keywordColors;

      var seedById = {};
      SEED.papers.forEach(function (p) { seedById[p.id] = p; });

      var dirty = false;
      state.papers.forEach(function (p) {
        var seed = seedById[p.id];
        if (!seed) return;
        if (seed.added && p.added !== seed.added) {
          p.added = seed.added;
          dirty = true;
        }
        if (seed.journalType && p.journalType !== seed.journalType) {
          p.journalType = seed.journalType;
          dirty = true;
        }
      });

      // Migrate pre-pass-columns state: fold the old to-read/suggested/reading/read
      // status into a pass level, then drop the field entirely.
      state.papers.forEach(function (p) {
        if ('status' in p) {
          if (typeof p.pass !== 'number') p.pass = (p.status === 'read') ? 3 : 0;
          delete p.status;
          dirty = true;
        }
        if (!p.passEnteredAt) {
          p.passEnteredAt = p.added || nowISO();
          dirty = true;
        }
      });

      // Papers deleted from the seed should disappear from cached state too
      var pruned = state.papers.filter(function (p) { return seedById[p.id]; });
      if (pruned.length !== state.papers.length) {
        state.papers = pruned;
        dirty = true;
      }

      var knownIds = {};
      state.papers.forEach(function (p) { knownIds[p.id] = true; });
      var newPapers = SEED.papers.filter(function (p) { return !knownIds[p.id]; });
      if (newPapers.length) {
        state.papers = state.papers.concat(clone(newPapers));
        state.keywordColors = Object.assign({}, SEED.keywordColors, state.keywordColors);
        dirty = true;
      }
      if (dirty) await saveState();
      return;
    }

    state.papers = clone(SEED.papers);
    state.keywordColors = clone(SEED.keywordColors);
    await saveState();
  }

  async function saveState() {
    await store.save({ papers: state.papers, keywordColors: state.keywordColors });
  }

  // ---------- Derived data ----------

  function allKeywords() {
    var set = new Set();
    state.papers.forEach(function (p) { p.keywords.forEach(function (k) { set.add(k); }); });
    return Array.from(set).sort();
  }

  function authorCounts() {
    var counts = {};
    state.papers.forEach(function (p) {
      p.authors.forEach(function (a) {
        if (a === 'et al.') return;
        counts[a] = (counts[a] || 0) + 1;
      });
    });
    return counts;
  }

  function filterableAuthors() {
    var counts = authorCounts();
    return Object.keys(counts)
      .filter(function (a) { return counts[a] >= AUTHOR_CHIP_MIN_COUNT; })
      .sort(function (a, b) { return counts[b] - counts[a]; });
  }

  function venueCounts() {
    var counts = {};
    state.papers.forEach(function (p) {
      if (!p.journal) return;
      counts[p.journal] = (counts[p.journal] || 0) + 1;
    });
    return counts;
  }

  function filterableVenues() {
    var counts = venueCounts();
    return Object.keys(counts)
      .filter(function (v) { return counts[v] >= VENUE_CHIP_MIN_COUNT; })
      .sort(function (a, b) { return counts[b] - counts[a]; });
  }

  function keywordColor(kw) {
    return state.keywordColors[kw] || { bg: '#eeece3', text: '#5c594f' };
  }

  // Hue-code the author chips by collaboration: authors in the same
  // co-authorship cluster get neighbouring hues, unrelated clusters sit
  // further apart on the wheel.
  function computeAuthorColors() {
    var names = filterableAuthors();
    var nameSet = new Set(names);
    var adj = {};
    names.forEach(function (n) { adj[n] = new Set(); });
    state.papers.forEach(function (p) {
      var as = p.authors.filter(function (a) { return a !== 'et al.' && nameSet.has(a); });
      for (var i = 0; i < as.length; i++) {
        for (var k = i + 1; k < as.length; k++) {
          adj[as[i]].add(as[k]);
          adj[as[k]].add(as[i]);
        }
      }
    });

    var seen = new Set();
    var components = [];
    names.forEach(function (n) {
      if (seen.has(n)) return;
      var queue = [n];
      var comp = [];
      seen.add(n);
      while (queue.length) {
        var cur = queue.shift();
        comp.push(cur);
        adj[cur].forEach(function (nb) {
          if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
        });
      }
      components.push(comp);
    });
    components.sort(function (a, b) { return b.length - a.length; });

    var GAP = 2; // wheel units left empty between clusters
    var totalUnits = names.length + GAP * Math.max(0, components.length - 1);
    var colors = {};
    var unit = 0;
    components.forEach(function (comp, ci) {
      if (ci > 0) unit += GAP;
      comp.forEach(function (n) {
        var hue = Math.round((unit / totalUnits) * 360) % 360;
        colors[n] = {
          bg: 'hsl(' + hue + ', 41%, 90%)',
          text: 'hsl(' + hue + ', 45%, 32%)'
        };
        unit += 1;
      });
    });
    return colors;
  }

  function passLevel(paper) {
    return typeof paper.pass === 'number' ? paper.pass : 0;
  }

  // Column index === pass level: unread (0), pass-1 (1), pass-2 (2), pass-3 (3).
  function columnForPaper(paper) {
    var lvl = Math.max(0, Math.min(3, passLevel(paper)));
    return PASS_COLUMNS[lvl];
  }

  function isStale(paper) {
    var lvl = passLevel(paper);
    if (lvl >= 3) return false;
    var since = paper.passEnteredAt ? new Date(paper.passEnteredAt).getTime() : 0;
    return since > 0 && Date.now() - since > STALE_MS;
  }

  function daysSince(iso) {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  }

  function matchesSearch(paper, term) {
    if (!term) return true;
    var hay = [
      paper.title,
      paper.authors.join(' '),
      paper.journal,
      paper.keywords.join(' ')
    ].join(' ').toLowerCase();
    return hay.indexOf(term.toLowerCase()) !== -1;
  }

  function visiblePapers() {
    return state.papers.filter(function (p) {
      if (!matchesSearch(p, state.searchTerm)) return false;
      if (state.activeKeywords.size > 0) {
        var hasKw = p.keywords.some(function (k) { return state.activeKeywords.has(k); });
        if (!hasKw) return false;
      }
      if (state.activeAuthors.size > 0) {
        var hasAuthor = p.authors.some(function (a) { return state.activeAuthors.has(a); });
        if (!hasAuthor) return false;
      }
      if (state.activeVenues.size > 0) {
        if (!state.activeVenues.has(p.journal)) return false;
      }
      return true;
    });
  }

  // ---------- Rendering ----------

  function formatAuthors(authors) {
    return authors.join(', ');
  }

  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDate(dateStr) {
    var m = /^(\d{4})-(\d{2})$/.exec(dateStr || '');
    if (!m) return dateStr || '';
    var month = parseInt(m[2], 10);
    return (month >= 1 && month <= 12 ? MONTH_ABBR[month - 1] + ' ' : '') + m[1];
  }

  function makeToggleChip(label, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip toggle-chip';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Renders `buttons` into `container`. When collapsed, only as many buttons
  // as fit on a single row are shown, followed by a "More {label}" toggle
  // chip (also kept on that row). When expanded, all buttons are shown
  // followed by a "Fewer {label}" toggle chip.
  function renderCollapsibleRow(container, buttons, expanded, label, onToggle) {
    container.innerHTML = '';
    container.style.flexWrap = 'wrap';

    if (buttons.length === 0) return;

    if (expanded) {
      buttons.forEach(function (b) { container.appendChild(b); });
      container.appendChild(makeToggleChip(fmt(STR.collapsibleRow.seeLessTemplate, { label: label }), onToggle));
      return;
    }

    buttons.forEach(function (b) { container.appendChild(b); });
    var rowTop = buttons[0].offsetTop;
    var firstOverflowIndex = -1;
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].offsetTop !== rowTop) { firstOverflowIndex = i; break; }
    }

    if (firstOverflowIndex === -1) {
      // everything already fits on one row, nothing to collapse
      return;
    }

    var toggle = makeToggleChip(fmt(STR.collapsibleRow.seeMoreTemplate, { label: label }), onToggle);
    var keepCount = firstOverflowIndex;
    while (keepCount >= 0) {
      while (container.children.length > keepCount) container.removeChild(container.lastChild);
      container.appendChild(toggle);
      if (toggle.offsetTop === rowTop) break;
      container.removeChild(toggle);
      keepCount--;
    }
  }

  function renderChips() {
    var kwContainer = document.getElementById('keywordChips');
    var keywords = allKeywords();
    var kwButtons = keywords.map(function (kw) {
      var c = keywordColor(kw);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (state.activeKeywords.has(kw) ? ' active' : '');
      btn.style.background = c.bg;
      btn.style.color = c.text;
      btn.textContent = kw;
      btn.addEventListener('click', function () {
        if (state.activeKeywords.has(kw)) state.activeKeywords.delete(kw);
        else state.activeKeywords.add(kw);
        renderAll();
      });
      return btn;
    });
    renderCollapsibleRow(kwContainer, kwButtons, state.keywordsExpanded, STR.collapsibleRow.labels.keywords, function () {
      state.keywordsExpanded = !state.keywordsExpanded;
      renderChips();
    });

    var authorContainer = document.getElementById('authorChips');
    var authors = filterableAuthors();
    var authorColors = computeAuthorColors();
    var authorButtons = authors.map(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip author-chip' + (state.activeAuthors.has(a) ? ' active' : '');
      var color = authorColors[a];
      if (color) {
        btn.style.background = color.bg;
        btn.style.color = color.text;
      }
      btn.textContent = a;
      btn.addEventListener('click', function () {
        if (state.activeAuthors.has(a)) state.activeAuthors.delete(a);
        else state.activeAuthors.add(a);
        renderAll();
      });
      return btn;
    });
    renderCollapsibleRow(authorContainer, authorButtons, state.authorsExpanded, STR.collapsibleRow.labels.authors, function () {
      state.authorsExpanded = !state.authorsExpanded;
      renderChips();
    });

    var venueContainer = document.getElementById('venueChips');
    var venues = filterableVenues();
    var typeByVenue = {};
    state.papers.forEach(function (p) {
      if (p.journal && p.journalType) typeByVenue[p.journal] = p.journalType;
    });
    var venueButtons = venues.map(function (v) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip venue-chip' + (typeByVenue[v] ? ' venue-type-' + typeByVenue[v] : '') + (state.activeVenues.has(v) ? ' active' : '');
      btn.textContent = v;
      btn.addEventListener('click', function () {
        if (state.activeVenues.has(v)) state.activeVenues.delete(v);
        else state.activeVenues.add(v);
        renderAll();
      });
      return btn;
    });
    renderCollapsibleRow(venueContainer, venueButtons, state.venuesExpanded, STR.collapsibleRow.labels.venues, function () {
      state.venuesExpanded = !state.venuesExpanded;
      renderChips();
    });
  }

  function renderProgress() {
    var total = state.papers.length;
    var read = state.papers.filter(function (p) { return passLevel(p) >= 3; }).length;
    document.getElementById('progressText').textContent = fmt(STR.progress.countTemplate, { read: read, total: total });

    var byKeyword = {};
    state.papers.forEach(function (p) {
      p.keywords.forEach(function (kw) {
        if (!byKeyword[kw]) byKeyword[kw] = { total: 0, read: 0 };
        byKeyword[kw].total++;
        if (passLevel(p) >= 3) byKeyword[kw].read++;
      });
    });
    var keys = Object.keys(byKeyword).sort(function (a, b) { return byKeyword[b].total - byKeyword[a].total; });
    var body = document.getElementById('popoverBody');
    body.innerHTML = '';
    keys.forEach(function (kw) {
      var info = byKeyword[kw];
      var pct = info.total ? Math.round((info.read / info.total) * 100) : 0;
      var c = keywordColor(kw);
      var row = document.createElement('div');
      row.className = 'mini-bar-row';
      var label = document.createElement('span');
      label.className = 'mini-bar-label';
      label.textContent = kw;
      var track = document.createElement('div');
      track.className = 'mini-bar-track';
      var fill = document.createElement('div');
      fill.className = 'mini-bar-fill';
      fill.style.width = pct + '%';
      fill.style.background = c.text;
      track.appendChild(fill);
      var countSpan = document.createElement('span');
      countSpan.className = 'mini-bar-count';
      countSpan.textContent = info.read + '/' + info.total;
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(countSpan);
      body.appendChild(row);
    });
  }

  function getPaperUrl(paper) {
    if (!paper.doi) return null;
    if (/^10\./.test(paper.doi)) return 'https://doi.org/' + paper.doi;
    if (/^https?:\/\//.test(paper.doi)) return paper.doi;
    return null;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Small external-link glyph: signals that the button navigates off-site.
  function buildExternalIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ext-icon');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('fill', 'none');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M5 2H2.75A.75.75 0 0 0 2 2.75v6.5c0 .414.336.75.75.75h6.5A.75.75 0 0 0 10 9.25V7M7 2h3v3M10 2 5.5 6.5');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  // Secondary action(s) first, primary last — buttons group together on
  // the right with the heaviest (primary) button rightmost.
  function actionButtonsFor(paper) {
    var actions = STR.card.actions;
    var lvl = passLevel(paper);
    var list = [];
    if (getPaperUrl(paper)) list.push({ label: actions.open, type: 'open', primary: false });
    if (lvl < 3) {
      list.push({ label: actions.advanceVerbs[lvl], next: lvl + 1, primary: true });
    } else {
      list.push({ label: actions.reopen, next: 2, primary: false });
    }
    return list;
  }

  var VENUE_TYPE_COLOR = {
    journal: '#5484b8',
    conference: '#62a350',
    preprint: '#8b62b0',
    report: '#b8933f'
  };
  var STALE_COLOR = '#b8863a';

  function buildCard(paper) {
    var card = document.createElement('div');
    var stale = isStale(paper);
    card.className = 'card' + (stale ? ' card-stale' : '');
    card.setAttribute('draggable', 'true');
    card.setAttribute('tabindex', '0');
    card.dataset.id = paper.id;

    // Left-edge accent: the stale warning takes priority over the paper's
    // venue-type colour when both would apply.
    var accentColor = stale ? STALE_COLOR : VENUE_TYPE_COLOR[paper.journalType];
    if (accentColor) card.style.borderLeftColor = accentColor;

    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = paper.title;
    card.appendChild(title);

    var metaBits = [];
    if (paper.authors.length) metaBits.push(formatAuthors(paper.authors));
    if (paper.journal) metaBits.push(paper.journal);
    if (paper.date) metaBits.push(formatDate(paper.date));
    if (typeof paper.citations === 'number') metaBits.push(fmt(STR.card.citationsSuffixTemplate, { n: paper.citations }));
    if (metaBits.length) {
      var meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.textContent = metaBits.join(' · ');
      card.appendChild(meta);
    }

    if (stale) {
      var flag = document.createElement('span');
      flag.className = 'card-flag flag-stale';
      flag.textContent = fmt(STR.highlights.staleTemplate, { n: daysSince(paper.passEnteredAt) });
      card.appendChild(flag);
    }

    var kwWrap = document.createElement('div');
    kwWrap.className = 'card-keywords';
    paper.keywords.forEach(function (kw) {
      var c = keywordColor(kw);
      var pill = document.createElement('span');
      pill.className = 'kw-pill';
      pill.style.background = c.bg;
      pill.style.color = c.text;
      pill.textContent = kw;
      kwWrap.appendChild(pill);
    });
    card.appendChild(kwWrap);

    var actionsWrap = document.createElement('div');
    actionsWrap.className = 'card-actions';
    actionButtonsFor(paper).forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn' + (a.primary ? ' primary' : '');
      if (a.type === 'open') btn.appendChild(buildExternalIcon());
      btn.appendChild(document.createTextNode(a.label));
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (a.type === 'open') {
          var url = getPaperUrl(paper);
          if (url) window.open(url, '_blank', 'noopener');
          return;
        }
        setPass(paper.id, a.next);
      });
      actionsWrap.appendChild(btn);
    });
    card.appendChild(actionsWrap);

    // Drag events
    card.addEventListener('dragstart', function (e) {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', paper.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
    });

    return card;
  }

  function firstAuthorSurname(paper) {
    if (!paper.authors.length) return '';
    var first = paper.authors[0];
    if (first === 'et al.') return '';
    var comma = first.indexOf(',');
    return (comma === -1 ? first : first.slice(0, comma)).trim().toLowerCase();
  }

  function sortPapers(list, sortValue) {
    var sorted = list.slice();
    var dash = sortValue.lastIndexOf('-');
    var key = sortValue.slice(0, dash);
    var dir = sortValue.slice(dash + 1);

    if (key === 'author') {
      sorted.sort(function (a, b) { return firstAuthorSurname(a).localeCompare(firstAuthorSurname(b)); });
    } else if (key === 'year') {
      sorted.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    } else if (key === 'citations') {
      sorted.sort(function (a, b) { return (a.citations || 0) - (b.citations || 0); });
    } else if (key === 'added') {
      sorted.sort(function (a, b) { return (a.added || '').localeCompare(b.added || ''); });
    }
    if (dir === 'desc') sorted.reverse();
    return sorted;
  }

  function setupSortSelects() {
    PASS_COLUMNS.forEach(function (col) {
      var select = document.getElementById('sort-' + col);
      select.innerHTML = '';
      STR.sortOptions.forEach(function (opt) {
        var el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        select.appendChild(el);
      });
      select.value = state.sortBy[col];
      select.addEventListener('change', function () {
        state.sortBy[col] = select.value;
        renderBoard();
      });
    });
  }

  function renderBoard() {
    var pool = visiblePapers();
    var byColumn = { unread: [], 'pass-1': [], 'pass-2': [], 'pass-3': [] };
    pool.forEach(function (p) { byColumn[columnForPaper(p)].push(p); });

    PASS_COLUMNS.forEach(function (col) {
      var dropEl = document.getElementById('drop-' + col);
      dropEl.innerHTML = '';
      var list = sortPapers(byColumn[col], state.sortBy[col]);
      document.getElementById('count-' + col).textContent = list.length;
      if (list.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-column';
        empty.textContent = STR.emptyColumn[col];
        dropEl.appendChild(empty);
        return;
      }
      list.forEach(function (p) { dropEl.appendChild(buildCard(p)); });
    });
  }

  // Sets a paper's pass level (0-3) and bumps passEnteredAt so stale
  // highlighting resets from the moment it last changed.
  function setPass(id, level) {
    var paper = state.papers.find(function (p) { return p.id === id; });
    if (!paper) return;
    var prev = passLevel(paper);
    if (prev === level) return;
    paper.pass = level;
    paper.passEnteredAt = nowISO();
    saveState();
    renderAll();
  }

  function renderAll() {
    renderChips();
    renderProgress();
    renderBoard();
    updateColumnHeights();
  }

  // ---------- Static text ----------

  function renderStaticText() {
    document.title = STR.pageTitle;
    document.getElementById('pageTitle').textContent = STR.pageTitle;
    document.getElementById('pageSubtitle').textContent = STR.subheading;
    document.getElementById('resetBtn').textContent = STR.resetButtonLabel;
    document.getElementById('searchInput').setAttribute('placeholder', STR.searchPlaceholder);
    document.getElementById('popoverTitle').textContent = STR.progress.popoverTitle;
    document.getElementById('modalCancel').textContent = STR.modal.cancel;

    PASS_COLUMNS.forEach(function (col) {
      document.getElementById('columnTitle-' + col).textContent = STR.columns[col];
    });
  }

  // ---------- Drop zones ----------

  function setupDropZones() {
    PASS_COLUMNS.forEach(function (col) {
      var dropEl = document.getElementById('drop-' + col);
      dropEl.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropEl.classList.add('drag-over');
      });
      dropEl.addEventListener('dragleave', function () {
        dropEl.classList.remove('drag-over');
      });
      dropEl.addEventListener('drop', function (e) {
        e.preventDefault();
        dropEl.classList.remove('drag-over');
        var id = e.dataTransfer.getData('text/plain');
        setPass(id, PASS_COLUMN_LEVEL[col]);
      });
    });
  }

  // ---------- Search ----------

  function setupSearch() {
    var input = document.getElementById('searchInput');
    input.addEventListener('input', function () {
      state.searchTerm = input.value;
      renderAll();
    });
  }

  // ---------- Progress popover (click "N read / M total" to see the breakdown) ----------

  function closeProgressPopover() {
    var toggle = document.getElementById('progressToggle');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function setupProgressPopover() {
    var toggle = document.getElementById('progressToggle');

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = toggle.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (!toggle.contains(e.target)) closeProgressPopover();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeProgressPopover();
    });
  }

  // ---------- Confirmation modal (Reset to seed papers) ----------

  function setupResetModal() {
    var backdrop = document.getElementById('modalBackdrop');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    var confirmBtn = document.getElementById('modalConfirm');

    document.getElementById('resetBtn').addEventListener('click', function () {
      var copy = STR.modal.restore;
      titleEl.textContent = copy.title;
      bodyEl.textContent = copy.body;
      confirmBtn.textContent = copy.confirm;
      backdrop.classList.add('open');
    });
    document.getElementById('modalCancel').addEventListener('click', function () {
      backdrop.classList.remove('open');
    });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
    confirmBtn.addEventListener('click', async function () {
      state.papers = clone(SEED.papers);
      state.keywordColors = clone(SEED.keywordColors);
      state.activeKeywords = new Set();
      state.activeAuthors = new Set();
      state.activeVenues = new Set();
      state.searchTerm = '';
      document.getElementById('searchInput').value = '';
      await saveState();
      backdrop.classList.remove('open');
      renderAll();
    });
  }

  // ---------- Three-pass method info modal ----------

  function setupThreePassModal() {
    var backdrop = document.getElementById('threePassBackdrop');
    var btn = document.getElementById('threePassBtn');
    var closeBtn = document.getElementById('threePassCloseBtn');
    var list = document.getElementById('threePassList');

    document.getElementById('threePassTitle').textContent = STR.threePassInfo.modalTitle;
    document.getElementById('threePassIntro').textContent = STR.threePassInfo.intro;
    closeBtn.textContent = STR.threePassInfo.close;
    btn.setAttribute('aria-label', STR.threePassInfo.buttonLabel);

    STR.passTracker.passes.forEach(function (info) {
      var row = document.createElement('div');
      row.className = 'three-pass-row';

      var head = document.createElement('div');
      head.className = 'three-pass-row-head';
      var title = document.createElement('span');
      title.className = 'three-pass-title';
      title.textContent = info.title;
      var time = document.createElement('span');
      time.className = 'three-pass-time';
      time.textContent = info.time;
      head.appendChild(title);
      head.appendChild(time);

      var body = document.createElement('p');
      body.className = 'three-pass-body';
      body.textContent = info.body;

      row.appendChild(head);
      row.appendChild(body);
      list.appendChild(row);
    });

    btn.addEventListener('click', function () {
      backdrop.classList.add('open');
    });
    closeBtn.addEventListener('click', function () {
      backdrop.classList.remove('open');
    });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  }

  // ---------- Column height sync ----------

  function updateColumnHeights() {
    var board = document.getElementById('board');
    if (!board) return;
    var top = board.getBoundingClientRect().top;
    var maxHeight = Math.max(160, window.innerHeight - top - 24);
    document.documentElement.style.setProperty('--column-max-height', maxHeight + 'px');
  }

  // ---------- Window resize redraw ----------

  window.addEventListener('resize', updateColumnHeights);

  // ---------- Init ----------

  async function fetchJson(url) {
    var res = await fetch(url);
    return res.json();
  }

  function expandSeed(rawSeed, journals, authors, keywords) {
    var keywordColors = {};
    Object.keys(keywords).forEach(function (id) {
      var kw = keywords[id];
      keywordColors[kw.label] = { bg: kw.bg, text: kw.text };
    });

    var papers = rawSeed.papers.map(function (p) {
      return {
        id: p.id,
        doi: p.doi,
        title: p.title,
        authors: p.authorIds.map(function (id) { return authors[id]; }),
        date: p.date,
        journal: p.journalId ? journals[p.journalId].name : '',
        journalType: p.journalId ? journals[p.journalId].type : '',
        keywords: p.keywordIds.map(function (id) { return keywords[id].label; }),
        pass: 0,
        passEnteredAt: p.added || nowISO(),
        citations: p.citations,
        added: p.added
      };
    });

    return { papers: papers, keywordColors: keywordColors };
  }

  async function init() {
    var results = await Promise.all([
      fetchJson(STRINGS_URL),
      fetchJson(SEED_URL),
      fetchJson(JOURNALS_URL),
      fetchJson(AUTHORS_URL),
      fetchJson(KEYWORDS_URL)
    ]);
    STR = results[0];
    SEED = expandSeed(results[1], results[2], results[3], results[4]);
    store = DualStore.create(STORAGE_KEY);

    renderStaticText();
    await loadState();
    setupDropZones();
    setupSearch();
    setupResetModal();
    setupThreePassModal();
    setupSortSelects();
    setupProgressPopover();
    renderAll();
  }

  init();
})();
