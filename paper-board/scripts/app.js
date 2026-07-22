(function () {
  'use strict';

  var BASE = 'paper-board/';
  var STRINGS_URL = BASE + 'strings.json';
  var SEED_URL = BASE + 'data/seed.json';

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
    hoveredCardId: null,
    keywordsExpanded: false,
    authorsExpanded: false,
    venuesExpanded: false,
    sortBy: { 'to-read': 'none', suggested: 'none', reading: 'none', read: 'none' }
  };

  var AUTHOR_CHIP_MIN_COUNT = 3;
  var VENUE_CHIP_MIN_COUNT = 2;
  var STATUSES = ['to-read', 'suggested', 'reading', 'read'];
  var MAX_SUGGESTIONS = 5;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function fmt(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, key) { return vars[key]; });
  }

  // ---------- Persistence ----------

  async function loadState() {
    var winner = await store.load();

    if (winner) {
      state.papers = winner.data.papers;
      state.keywordColors = winner.data.keywordColors || SEED.keywordColors;
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

  function relatedPapers(paper, pool) {
    return pool.filter(function (other) {
      if (other.id === paper.id) return false;
      var shared = other.keywords.filter(function (k) { return paper.keywords.indexOf(k) !== -1; });
      return shared.length > 0;
    }).map(function (other) {
      var shared = other.keywords.filter(function (k) { return paper.keywords.indexOf(k) !== -1; });
      return { paper: other, sharedCount: shared.length };
    });
  }

  // ---------- Rendering ----------

  function formatAuthors(authors) {
    return authors.join(', ');
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
  // as fit on a single row are shown, followed by a "See more" toggle chip
  // (also kept on that row). When expanded, all buttons are shown followed
  // by a "See less" toggle chip.
  function renderCollapsibleRow(container, buttons, expanded, onToggle) {
    container.innerHTML = '';
    container.style.flexWrap = 'wrap';

    if (buttons.length === 0) return;

    if (expanded) {
      buttons.forEach(function (b) { container.appendChild(b); });
      container.appendChild(makeToggleChip(STR.collapsibleRow.seeLess, onToggle));
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

    var toggle = makeToggleChip(STR.collapsibleRow.seeMore, onToggle);
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
    renderCollapsibleRow(kwContainer, kwButtons, state.keywordsExpanded, function () {
      state.keywordsExpanded = !state.keywordsExpanded;
      renderChips();
    });

    var authorContainer = document.getElementById('authorChips');
    var authors = filterableAuthors();
    var authorButtons = authors.map(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip author-chip' + (state.activeAuthors.has(a) ? ' active' : '');
      btn.textContent = a;
      btn.addEventListener('click', function () {
        if (state.activeAuthors.has(a)) state.activeAuthors.delete(a);
        else state.activeAuthors.add(a);
        renderAll();
      });
      return btn;
    });
    renderCollapsibleRow(authorContainer, authorButtons, state.authorsExpanded, function () {
      state.authorsExpanded = !state.authorsExpanded;
      renderChips();
    });

    var venueContainer = document.getElementById('venueChips');
    var venues = filterableVenues();
    var venueButtons = venues.map(function (v) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip venue-chip' + (state.activeVenues.has(v) ? ' active' : '');
      btn.textContent = v;
      btn.addEventListener('click', function () {
        if (state.activeVenues.has(v)) state.activeVenues.delete(v);
        else state.activeVenues.add(v);
        renderAll();
      });
      return btn;
    });
    renderCollapsibleRow(venueContainer, venueButtons, state.venuesExpanded, function () {
      state.venuesExpanded = !state.venuesExpanded;
      renderChips();
    });
  }

  function renderProgress() {
    var total = state.papers.length;
    var read = state.papers.filter(function (p) { return p.status === 'read'; }).length;
    document.getElementById('progressText').textContent = fmt(STR.progress.countTemplate, { read: read, total: total });

    var byKeyword = {};
    state.papers.forEach(function (p) {
      p.keywords.forEach(function (kw) {
        if (!byKeyword[kw]) byKeyword[kw] = { total: 0, read: 0 };
        byKeyword[kw].total++;
        if (p.status === 'read') byKeyword[kw].read++;
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

  function actionButtonsFor(paper) {
    var actions = STR.card.actions;
    if (paper.status === 'to-read' || paper.status === 'suggested') {
      return [{ label: actions.start, next: 'reading', primary: true }];
    }
    if (paper.status === 'reading') {
      var list = [{ label: actions.finish, next: 'read', primary: true }];
      if (getPaperUrl(paper)) list.push({ label: actions.open, type: 'open', primary: false });
      return list;
    }
    return [{ label: actions.reopen, next: 'reading', primary: false }];
  }

  function buildCard(paper) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('tabindex', '0');
    card.dataset.id = paper.id;

    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = paper.title;
    card.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'card-meta';
    var metaParts = [];
    if (paper.authors.length) metaParts.push(formatAuthors(paper.authors));
    if (paper.year) metaParts.push(String(paper.year));
    if (paper.journal) metaParts.push(paper.journal);
    if (typeof paper.citations === 'number') metaParts.push(fmt(STR.card.citationsSuffixTemplate, { n: paper.citations }));
    meta.textContent = metaParts.join(' · ');
    meta.title = metaParts.join(' · ');
    card.appendChild(meta);

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
      btn.textContent = a.label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (a.type === 'open') {
          var url = getPaperUrl(paper);
          if (url) window.open(url, '_blank', 'noopener');
          return;
        }
        setStatus(paper.id, a.next);
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

    // Hover / focus thread lines
    card.addEventListener('mouseenter', function () { state.hoveredCardId = paper.id; drawThreads(); });
    card.addEventListener('mouseleave', function () { state.hoveredCardId = null; drawThreads(); });
    card.addEventListener('focus', function () { state.hoveredCardId = paper.id; drawThreads(); });
    card.addEventListener('blur', function () { state.hoveredCardId = null; drawThreads(); });

    return card;
  }

  function firstAuthorSurname(paper) {
    if (!paper.authors.length) return '';
    var first = paper.authors[0];
    if (first === 'et al.') return '';
    var comma = first.indexOf(',');
    return (comma === -1 ? first : first.slice(0, comma)).trim().toLowerCase();
  }

  function sortPapers(list, sortKey) {
    var sorted = list.slice();
    if (sortKey === 'author') {
      sorted.sort(function (a, b) { return firstAuthorSurname(a).localeCompare(firstAuthorSurname(b)); });
    } else if (sortKey === 'year') {
      sorted.sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
    } else if (sortKey === 'citations') {
      sorted.sort(function (a, b) { return (b.citations || 0) - (a.citations || 0); });
    }
    return sorted;
  }

  function setupSortSelects() {
    STATUSES.forEach(function (status) {
      var select = document.getElementById('sort-' + status);
      select.innerHTML = '';
      STR.sortOptions.forEach(function (opt) {
        var el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        select.appendChild(el);
      });
      select.value = state.sortBy[status];
      select.addEventListener('change', function () {
        state.sortBy[status] = select.value;
        renderBoard();
      });
    });
  }

  function renderBoard() {
    var pool = visiblePapers();
    var byStatus = { 'to-read': [], suggested: [], reading: [], read: [] };
    pool.forEach(function (p) { byStatus[p.status].push(p); });

    STATUSES.forEach(function (status) {
      var dropEl = document.getElementById('drop-' + status);
      dropEl.innerHTML = '';
      var list = sortPapers(byStatus[status], state.sortBy[status]);
      document.getElementById('count-' + status).textContent = list.length;
      if (list.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-column';
        empty.textContent = STR.emptyColumn[status];
        dropEl.appendChild(empty);
        return;
      }
      list.forEach(function (p) { dropEl.appendChild(buildCard(p)); });
    });

    drawThreads();
  }

  function drawThreads() {
    var svg = document.getElementById('threadOverlay');
    svg.innerHTML = '';
    if (!state.hoveredCardId) return;

    var pool = visiblePapers();
    var hovered = pool.find(function (p) { return p.id === state.hoveredCardId; });
    if (!hovered) return;

    var related = relatedPapers(hovered, pool);
    if (related.length === 0) return;

    var mostCited = related.reduce(function (best, rel) {
      return (!best || (rel.paper.citations || 0) > (best.paper.citations || 0)) ? rel : best;
    }, null);
    var mostRecent = related.reduce(function (best, rel) {
      return (!best || (rel.paper.year || 0) > (best.paper.year || 0)) ? rel : best;
    }, null);

    var links = [];
    if (mostCited) links.push({ rel: mostCited, dashed: false });
    if (mostRecent && mostRecent.paper.id !== mostCited.paper.id) links.push({ rel: mostRecent, dashed: true });

    var scrollRect = document.getElementById('boardScroll').getBoundingClientRect();
    var hoveredEl = document.querySelector('.card[data-id="' + cssEscape(hovered.id) + '"]');
    if (!hoveredEl) return;
    var hRect = hoveredEl.getBoundingClientRect();
    var hx = hRect.left + hRect.width / 2 - scrollRect.left;
    var hy = hRect.top + hRect.height / 2 - scrollRect.top;

    links.forEach(function (link) {
      var el = document.querySelector('.card[data-id="' + cssEscape(link.rel.paper.id) + '"]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      var rx = r.left + r.width / 2 - scrollRect.left;
      var ry = r.top + r.height / 2 - scrollRect.top;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', hx);
      line.setAttribute('y1', hy);
      line.setAttribute('x2', rx);
      line.setAttribute('y2', ry);
      line.setAttribute('stroke', '#4a4842');
      line.setAttribute('stroke-width', 2);
      line.setAttribute('stroke-opacity', '0.55');
      if (link.dashed) line.setAttribute('stroke-dasharray', '5 4');
      svg.appendChild(line);
    });
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) {
      return '\\' + c;
    });
  }

  function applySuggestions(paper) {
    var candidates = relatedPapers(paper, state.papers).filter(function (rel) {
      return rel.paper.status === 'to-read';
    });
    candidates.sort(function (a, b) { return (b.paper.citations || 0) - (a.paper.citations || 0); });
    candidates.slice(0, MAX_SUGGESTIONS).forEach(function (rel) {
      rel.paper.status = 'suggested';
    });
  }

  function setStatus(id, status) {
    var paper = state.papers.find(function (p) { return p.id === id; });
    if (!paper) return;
    var wasRead = paper.status === 'read';
    paper.status = status;
    if (status === 'read' && !wasRead) applySuggestions(paper);
    saveState();
    renderAll();
  }

  function renderAll() {
    renderChips();
    renderProgress();
    renderBoard();
  }

  // ---------- Static text ----------

  function renderStaticText() {
    document.title = STR.pageTitle;
    document.getElementById('pageTitle').textContent = STR.pageTitle;
    document.getElementById('pageSubtitle').textContent = STR.subheading;
    document.getElementById('actionsBtnLabel').textContent = STR.actionsButtonLabel;
    document.getElementById('restoreBtn').textContent = STR.dropdown.restore;
    document.getElementById('resetBtn').textContent = STR.dropdown.clear;
    document.getElementById('returnToChatLabel').textContent = STR.dropdown.returnToChat;
    document.getElementById('searchInput').setAttribute('placeholder', STR.searchPlaceholder);
    document.getElementById('popoverTitle').textContent = STR.progress.popoverTitle;
    document.getElementById('modalCancel').textContent = STR.modal.cancel;

    STATUSES.forEach(function (status) {
      document.getElementById('columnTitle-' + status).textContent = STR.columns[status];
    });
  }

  // ---------- Drop zones ----------

  function setupDropZones() {
    STATUSES.forEach(function (status) {
      var dropEl = document.getElementById('drop-' + status);
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
        setStatus(id, status);
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

  // ---------- Actions dropdown (Reset / Clear / Return to chat) ----------

  var RETURN_TO_CHAT_URL = 'https://claude.ai/chat/b51476f5-ba8c-473c-a1f5-ad5cb52f4032';

  function closeActionsDropdown() {
    var menu = document.getElementById('actionsMenu');
    var dropdown = document.getElementById('actionsDropdown');
    var btn = document.getElementById('actionsBtn');
    dropdown.classList.remove('open');
    menu.setAttribute('data-open', 'false');
    btn.setAttribute('aria-expanded', 'false');
  }

  function setupActionsMenu() {
    var menu = document.getElementById('actionsMenu');
    var btn = document.getElementById('actionsBtn');
    var dropdown = document.getElementById('actionsDropdown');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.classList.toggle('open');
      menu.setAttribute('data-open', isOpen ? 'true' : 'false');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target)) closeActionsDropdown();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeActionsDropdown();
    });

    document.getElementById('returnToChatBtn').addEventListener('click', function () {
      closeActionsDropdown();
      window.open(RETURN_TO_CHAT_URL, '_blank', 'noopener');
    });
  }

  // ---------- Confirmation modal (Clear board / Restore seed papers) ----------

  function setupResetModal() {
    var backdrop = document.getElementById('modalBackdrop');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    var confirmBtn = document.getElementById('modalConfirm');
    var pendingAction = 'clear';

    function openModal(action) {
      pendingAction = action;
      var copy = STR.modal[action];
      titleEl.textContent = copy.title;
      bodyEl.textContent = copy.body;
      confirmBtn.textContent = copy.confirm;
      backdrop.classList.add('open');
    }

    document.getElementById('resetBtn').addEventListener('click', function () {
      closeActionsDropdown();
      openModal('clear');
    });
    document.getElementById('restoreBtn').addEventListener('click', function () {
      closeActionsDropdown();
      openModal('restore');
    });
    document.getElementById('modalCancel').addEventListener('click', function () {
      backdrop.classList.remove('open');
    });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
    confirmBtn.addEventListener('click', async function () {
      if (pendingAction === 'restore') {
        state.papers = clone(SEED.papers);
        state.keywordColors = clone(SEED.keywordColors);
      } else {
        state.papers = [];
      }
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

  // ---------- Window resize redraw ----------

  window.addEventListener('resize', function () { drawThreads(); });
  document.getElementById('boardScroll') && document.getElementById('boardScroll').addEventListener('scroll', function () { drawThreads(); });

  // ---------- Init ----------

  async function fetchJson(url) {
    var res = await fetch(url);
    return res.json();
  }

  async function init() {
    var results = await Promise.all([fetchJson(STRINGS_URL), fetchJson(SEED_URL)]);
    STR = results[0];
    SEED = results[1];
    store = DualStore.create(STORAGE_KEY);

    renderStaticText();
    await loadState();
    setupDropZones();
    setupSearch();
    setupResetModal();
    setupSortSelects();
    setupActionsMenu();
    renderAll();
  }

  init();
})();
