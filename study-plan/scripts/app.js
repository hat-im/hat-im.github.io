(function(){

var BASE = 'study-plan/';
var STRINGS_URL = BASE + 'strings.json';
var BOOKS_URL = BASE + 'data/books.json';
var CHAPTERS_URL = BASE + 'data/chapters.json';
var CONFIG_URL = BASE + 'data/config.json';

var STR = {};
var BOOKS = {};
var BOOK_ORDER = [];
var COLUMN_ORDER = [];
var STORAGE_KEY = 'chapter-status-v3';
var CHAPTERS = [];
var CH_BY_CODE = {};
var DEPENDENTS = {};
var CRITICAL_PATH = new Set();

var manualStatus = {};
var activeBooks = new Set();
var unmetMemo = {};
var store = null;

var searchQuery = '';
var viewMode = 'board';
var showCriticalPath = false;
var bookCollapseState = {};

function fmt(template, vars){
  return template.replace(/\{(\w+)\}/g, function(_, key){ return vars[key]; });
}

function computeAll(){
  var base = {};
  CHAPTERS.forEach(function(c){
    var m = manualStatus[c.code];
    if(m){ base[c.code] = m.status; return; }
    var ok = c.hard.every(function(p){ return base[p] === 'done'; });
    base[c.code] = ok ? 'ready' : 'not-ready';
  });

  var display = {};
  var needsRevision = {};
  CHAPTERS.forEach(function(c){
    var m = manualStatus[c.code];
    if(m && m.status === 'done'){
      var allSoftMet = c.soft.length ? c.soft.every(function(p){ return base[p] === 'done'; }) : false;
      if(m.forceRevision || (allSoftMet && !m.softSeen)){
        display[c.code] = 'ready';
        needsRevision[c.code] = true;
        return;
      }
    }
    display[c.code] = base[c.code];
  });
  return {base:base, display:display, needsRevision:needsRevision};
}

async function loadData(){
  var winner = await store.load();
  manualStatus = winner ? (winner.data || {}) : {};
  render();
}

function saveData(){
  store.save(manualStatus);
}

function setStatus(code, status, extra){
  extra = extra || {};
  if(status === 'ready'){
    delete manualStatus[code];
  }else{
    manualStatus[code] = {
      status:status,
      softSeen: !!extra.softSeen,
      forceRevision: !!extra.forceRevision,
      revising: !!extra.revising
    };
  }
  saveData();
  render();
}

function unmetAncestors(code, base, memo){
  if(memo[code]) return memo[code];
  var result = new Set();
  memo[code] = result; // guard against cycles while computing
  var c = CH_BY_CODE[code];
  c.hard.forEach(function(p){
    if(base[p] !== 'done') result.add(p);
    unmetAncestors(p, base, memo).forEach(function(x){ result.add(x); });
  });
  memo[code] = result;
  return result;
}

function directUnmetHard(code, base){
  var c = CH_BY_CODE[code];
  return c.hard.filter(function(p){ return base[p] !== 'done'; });
}

function buildDependents(){
  var dep = {};
  CHAPTERS.forEach(function(c){ dep[c.code] = []; });
  CHAPTERS.forEach(function(c){
    c.hard.forEach(function(p){ dep[p].push(c.code); });
  });
  return dep;
}

function computeCriticalPath(){
  var memo = {};
  function longest(code){
    if(memo[code]) return memo[code];
    var c = CH_BY_CODE[code];
    var best = 0, bestPrev = null;
    memo[code] = {len:1, prev:null}; // guard against cycles while computing
    c.hard.forEach(function(p){
      var pl = longest(p);
      if(pl.len > best){ best = pl.len; bestPrev = p; }
    });
    var result = {len: best + 1, prev: bestPrev};
    memo[code] = result;
    return result;
  }
  var maxCode = null, maxLen = 0;
  CHAPTERS.forEach(function(c){
    var r = longest(c.code);
    if(r.len > maxLen){ maxLen = r.len; maxCode = c.code; }
  });
  var path = new Set();
  var cur = maxCode;
  while(cur){
    path.add(cur);
    cur = memo[cur].prev;
  }
  return path;
}

function reachableCount(code, base){
  var seen = new Set();
  var stack = DEPENDENTS[code].slice();
  while(stack.length){
    var cur = stack.pop();
    if(seen.has(cur) || base[cur] === 'done') continue;
    seen.add(cur);
    DEPENDENTS[cur].forEach(function(d){ stack.push(d); });
  }
  return seen.size;
}

function matchesSearch(c){
  if(!searchQuery) return true;
  return c.code.toLowerCase().indexOf(searchQuery) !== -1 || c.title.toLowerCase().indexOf(searchQuery) !== -1;
}

function renderStaticText(){
  document.title = STR.pageTitle;
  document.getElementById('pageHeading').textContent = STR.heading;
  document.getElementById('pageSubheading').textContent = STR.subheading;
  document.getElementById('legendRequired').textContent = STR.legend.required;
  document.getElementById('legendRelated').textContent = STR.legend.related;
  document.getElementById('infoBtn').setAttribute('aria-label', STR.progress.infoButtonLabel);
  document.getElementById('resetBtn').textContent = STR.resetButton;
  document.getElementById('resetModalTitle').textContent = STR.resetModal.title;
  document.getElementById('resetModalBody').textContent = STR.resetModal.body;
  document.getElementById('resetCancel').textContent = STR.resetModal.cancel;
  document.getElementById('resetConfirm').textContent = STR.resetModal.confirm;
  document.getElementById('graphFab').textContent = STR.graphFab;
  document.getElementById('graphTitle').textContent = STR.graph.title;
  document.getElementById('graphClose').textContent = STR.graph.close;
  document.getElementById('graphLegendRequired').textContent = STR.legend.required;
  document.getElementById('graphLegendRelated').textContent = STR.legend.related;
  document.getElementById('searchInput').setAttribute('placeholder', STR.toolbar.searchPlaceholder);
  document.getElementById('viewBoardBtn').textContent = STR.toolbar.viewBoard;
  document.getElementById('viewListBtn').textContent = STR.toolbar.viewList;
  document.getElementById('critPathBtn').textContent = STR.toolbar.criticalPath;
}

function renderChips(base){
  var row = document.getElementById('chipRow');
  row.innerHTML = '';
  Object.keys(BOOKS).sort(function(a,b){ return BOOK_ORDER.indexOf(a)-BOOK_ORDER.indexOf(b); }).forEach(function(key){
    var b = BOOKS[key];
    var chip = document.createElement('div');
    chip.className = 'chip' + (activeBooks.has(key) ? ' active' : ' dim');
    chip.tabIndex = 0;
    chip.setAttribute('role','button');
    chip.setAttribute('aria-pressed', activeBooks.has(key));
    chip.innerHTML =
      '<span class="dot" style="background:'+b.color+'"></span>'+
      '<span>'+b.name+'</span>'+
      '<div class="popover">'+
        '<p class="p-title">'+b.title+'</p>'+
        '<p class="p-authors">'+b.name+'</p>'+
        '<p class="p-meta">'+b.meta+'</p>'+
        '<p class="p-desc">'+b.desc+'</p>'+
      '</div>';
    chip.addEventListener('click', function(e){
      if(e.target.closest('.popover')) return;
      if(activeBooks.has(key)){
        if(activeBooks.size===1){ activeBooks = new Set(Object.keys(BOOKS)); }
        else{ activeBooks.delete(key); }
      }else{
        activeBooks.add(key);
      }
      render();
    });
    chip.addEventListener('keydown', function(e){
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); chip.click(); }
    });
    row.appendChild(chip);
  });
}

function renderOverall(base){
  var total = CHAPTERS.length;
  var mastered = CHAPTERS.filter(function(c){return base[c.code]==='done';}).length;
  document.getElementById('overallFill').style.width = (total? (mastered/total*100) : 0) + '%';
  document.getElementById('overallCount').textContent = fmt(STR.progress.countTemplate, {done:mastered, total:total});

  var popEl = document.getElementById('bookProgress');
  popEl.innerHTML = BOOK_ORDER.map(function(key){
    var b = BOOKS[key];
    var chs = CHAPTERS.filter(function(c){return c.book===key;});
    var done = chs.filter(function(c){return base[c.code]==='done';}).length;
    var pct = chs.length ? (done/chs.length*100) : 0;
    return '<div class="book-row">'+
      '<span class="b-name">'+b.name+'</span>'+
      '<span class="b-bar-line"><span class="b-track"><span class="b-fill" style="width:'+pct+'%;background:'+b.color+'"></span></span>'+
      '<span class="b-frac tabular">'+done+'/'+chs.length+'</span></span>'+
    '</div>';
  }).join('');
}

function cardActions(c, col, flagged){
  var actions = STR.card.actions;
  var b = [];
  if(col==='ready'){
    if(flagged){
      b.push('<button class="btn primary" data-code="'+c.code+'" data-to="studying" data-revising="1">'+actions.revise+'</button>');
    }else{
      b.push('<button class="btn primary" data-code="'+c.code+'" data-to="studying" data-revising="0">'+actions.study+'</button>');
    }
  }else if(col==='studying'){
    var revising = manualStatus[c.code] && manualStatus[c.code].revising;
    b.push('<button class="btn primary" data-code="'+c.code+'" data-to="done" data-softseen="'+(revising?'1':'0')+'">'+actions.finish+'</button>');
    b.push('<button class="btn secondary" data-code="'+c.code+'" data-to="ready">'+actions.pause+'</button>');
  }else if(col==='done'){
    b.push('<button class="btn secondary" data-code="'+c.code+'" data-to="done" data-force="1">'+actions.revisit+'</button>');
    b.push('<button class="btn secondary" data-code="'+c.code+'" data-to="studying" data-revising="0">'+actions.restudy+'</button>');
  }
  return b.join('');
}

function chapterNum(code){
  return code.replace(/^[A-Z]+/, '');
}

function unlocksPopoverHtml(c, base){
  var deps = DEPENDENTS[c.code].filter(function(d){ return base[d] !== 'done'; });
  if(!deps.length) return '';
  var fully = [], partial = [];
  deps.forEach(function(d){
    var unmet = directUnmetHard(d, base);
    if(unmet.length === 1 && unmet[0] === c.code) fully.push(CH_BY_CODE[d].title);
    else partial.push(CH_BY_CODE[d].title);
  });
  var lines = '';
  if(fully.length) lines += '<p class="pop-list">'+fully.join(', ')+'</p>';
  if(partial.length) lines += '<p class="pop-list muted">'+partial.join(', ')+'</p>';
  return '<div class="card-popover unlocks-popover"><p class="pop-label">'+STR.card.unlocksLabel+'</p>'+lines+'</div>';
}

function extraStateClasses(c){
  var cls = '';
  if(searchQuery) cls += matchesSearch(c) ? ' search-match' : ' search-dim';
  if(showCriticalPath && CRITICAL_PATH.has(c.code)) cls += ' critical-path';
  return cls;
}

function renderCard(c, col, base, flagged){
  var b = BOOKS[c.book];
  var locked = col === 'not-ready';
  var div = document.createElement('div');
  div.className = 'card' + (locked ? ' locked' : '') + extraStateClasses(c);
  div.style.borderLeftColor = locked ? 'transparent' : b.color;
  div.setAttribute('data-code', c.code);
  div.draggable = !locked;
  div.tabIndex = 0;
  div.title = c.code + ' — ' + c.title;

  var badge = '<span class="num-badge" style="background:'+b.color+'">'+chapterNum(c.code)+'</span>';

  var body = '';

  if(locked){
    var missing = directUnmetHard(c.code, base);
    var SHOW = 4;
    var shown = missing.slice(0, SHOW).map(function(p){ return CH_BY_CODE[p].title; });
    var extra = missing.length - shown.length;
    var listText = shown.join(', ') + (extra > 0 ? fmt(STR.card.moreSuffixTemplate, {n:extra}) : '');
    var away = unmetAncestors(c.code, base, unmetMemo).size;
    var awayTemplate = away === 1 ? STR.card.awayTagTemplate.singular : STR.card.awayTagTemplate.plural;

    body =
      '<div class="card-top">'+badge+'<span class="card-book" style="color:'+b.color+'">'+b.name+'</span></div>'+
      '<div class="card-title">'+c.title+'</div>'+
      '<div class="away-tag">'+fmt(awayTemplate, {n:away})+'</div>'+
      '<div class="card-popover"><p class="pop-label">'+STR.card.waitingOnLabel+'</p><p class="pop-list">'+listText+'</p></div>';
  }else{
    var extraNote = '';
    if(col==='done' && c.soft.length){
      var pendingSoft = c.soft.filter(function(p){ return base[p] !== 'done'; });
      if(pendingSoft.length){
        var list = pendingSoft.map(function(p){return CH_BY_CODE[p].title;}).join(', ');
        extraNote = '<div class="revisit">'+fmt(STR.card.revisitNoteTemplate, {list:list})+'</div>';
      }
    }
    var flagBadge = flagged ? '<div class="flag-badge">'+STR.card.needsRevisionBadge+'</div>' : '';
    var unlocks = (col==='ready' || col==='studying') ? unlocksPopoverHtml(c, base) : '';

    body =
      '<div class="card-top">'+badge+'<span class="card-book" style="color:'+b.color+'">'+b.name+'</span></div>'+
      '<div class="card-title">'+c.title+'</div>'+
      flagBadge+
      extraNote+
      '<div class="card-actions">'+cardActions(c, col, flagged)+'</div>'+
      unlocks;
  }

  div.innerHTML = body;

  if(!locked){
    div.addEventListener('dragstart', function(e){
      div.classList.add('dragging');
      e.dataTransfer.setData('text/plain', c.code);
      e.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', function(){ div.classList.remove('dragging'); });
    div.addEventListener('mouseenter', function(){ drawStrings(c.code); });
    div.addEventListener('mouseleave', clearStrings);
    div.addEventListener('focus', function(){ drawStrings(c.code); });
    div.addEventListener('blur', clearStrings);
  }

  bindActionButtons(div);

  return div;
}

function bindActionButtons(el){
  el.querySelectorAll('button[data-to]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var code = btn.getAttribute('data-code');
      var to = btn.getAttribute('data-to');
      var extra = {
        softSeen: btn.getAttribute('data-softseen') === '1',
        forceRevision: btn.getAttribute('data-force') === '1',
        revising: btn.getAttribute('data-revising') === '1'
      };
      setStatus(code, to, extra);
    });
  });
}

function render(){
  var res = computeAll();
  var base = res.base, display = res.display, needsRevision = res.needsRevision;

  unmetMemo = {};

  renderChips(base);
  renderOverall(base);
  renderSuggestedNext(base);

  document.getElementById('boardWrap').style.display = viewMode === 'board' ? '' : 'none';
  document.getElementById('listWrap').style.display = viewMode === 'list' ? '' : 'none';

  if(viewMode === 'list'){
    renderListView(base, display, needsRevision);
  }else{
    renderBoard(base, display, needsRevision);
  }
}

function renderSuggestedNext(base){
  var el = document.getElementById('suggestedNext');
  var candidates = CHAPTERS.filter(function(c){
    return activeBooks.has(c.book) && base[c.code] === 'ready';
  });
  if(!candidates.length){
    el.classList.remove('show');
    el.innerHTML = '';
    return;
  }
  var best = candidates[0], bestScore = reachableCount(best.code, base);
  candidates.forEach(function(c){
    var score = reachableCount(c.code, base);
    if(score > bestScore){ bestScore = score; best = c; }
  });
  var impact = STR.suggestedNext.impact;
  var impactText = bestScore === 0 ? impact.zero : fmt(bestScore === 1 ? impact.singular : impact.plural, {n:bestScore});
  var bk = BOOKS[best.book];
  el.classList.add('show');
  el.innerHTML =
    '<span class="sn-label">'+STR.suggestedNext.label+'</span>'+
    '<span class="sn-dot" style="background:'+bk.color+'"></span>'+
    '<span class="sn-title">'+best.title+'</span>'+
    '<span class="sn-impact">'+impactText+'</span>'+
    '<button class="btn primary sn-btn" type="button">'+STR.card.actions.study+'</button>';
  el.querySelector('.sn-btn').addEventListener('click', function(){
    setStatus(best.code, 'studying', {revising:false});
  });
}

function renderBoard(base, display, needsRevision){
  var board = document.getElementById('board');
  board.innerHTML = '<svg id="strings"></svg>';

  var visible = CHAPTERS.filter(function(c){return activeBooks.has(c.book);});

  COLUMN_ORDER.forEach(function(colId){
    var colChapters = visible.filter(function(c){return display[c.code] === colId;});

    colChapters.sort(function(x,y){
      if(colId === 'not-ready'){
        var rx = unmetAncestors(x.code, base, unmetMemo).size, ry = unmetAncestors(y.code, base, unmetMemo).size;
        if(rx !== ry) return rx - ry;
      }
      var bx = BOOK_ORDER.indexOf(x.book), by = BOOK_ORDER.indexOf(y.book);
      if(bx !== by) return bx - by;
      return CHAPTERS.indexOf(x) - CHAPTERS.indexOf(y);
    });

    var colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.innerHTML =
      '<div class="column-head"><span class="name">'+STR.columns[colId]+'</span><span class="num tabular">'+colChapters.length+'</span></div>'+
      '<div class="cardlist"></div>';

    var list = colEl.querySelector('.cardlist');
    if(colChapters.length === 0){
      var empty = document.createElement('div');
      empty.className = 'empty-col';
      empty.textContent = colId === 'not-ready' ? STR.emptyColumn['not-ready'] : STR.emptyColumn['default'];
      list.appendChild(empty);
    }else{
      colChapters.forEach(function(c){
        list.appendChild(renderCard(c, colId, base, !!needsRevision[c.code]));
      });
    }

    if(colId !== 'not-ready'){
      colEl.addEventListener('dragover', function(e){ e.preventDefault(); colEl.classList.add('dragover'); });
      colEl.addEventListener('dragleave', function(){ colEl.classList.remove('dragover'); });
      colEl.addEventListener('drop', function(e){
        e.preventDefault();
        colEl.classList.remove('dragover');
        var code = e.dataTransfer.getData('text/plain');
        if(code) setStatus(code, colId);
      });
    }

    board.appendChild(colEl);
  });

  var svg = document.getElementById('strings');
  svg.setAttribute('width', board.scrollWidth);
  svg.setAttribute('height', board.scrollHeight);
}

function renderListView(base, display, needsRevision){
  var listView = document.getElementById('listView');
  listView.innerHTML = '';

  var visible = CHAPTERS.filter(function(c){ return activeBooks.has(c.book); });
  var forceOpen = !!searchQuery;

  BOOK_ORDER.filter(function(key){ return activeBooks.has(key); }).forEach(function(key){
    var chs = visible.filter(function(c){ return c.book === key; });
    if(!chs.length) return;
    var bk = BOOKS[key];
    var done = chs.filter(function(c){ return base[c.code] === 'done'; }).length;

    if(bookCollapseState[key] === undefined){
      bookCollapseState[key] = done !== chs.length;
    }

    var group = document.createElement('details');
    group.className = 'book-group';
    group.open = forceOpen || bookCollapseState[key];

    var summary = document.createElement('summary');
    summary.innerHTML =
      '<span class="bg-caret">&#9656;</span>'+
      '<span class="bg-dot" style="background:'+bk.color+'"></span>'+
      '<span class="bg-name">'+bk.name+'</span>'+
      '<span class="bg-frac tabular">'+done+'/'+chs.length+'</span>';
    group.appendChild(summary);
    group.addEventListener('toggle', function(){ bookCollapseState[key] = group.open; });

    chs.forEach(function(c){
      group.appendChild(renderListRow(c, display[c.code], base, !!needsRevision[c.code]));
    });

    listView.appendChild(group);
  });

  if(!visible.length){
    var empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = STR.emptyColumn['default'];
    listView.appendChild(empty);
  }
}

function renderListRow(c, col, base, flagged){
  var b = BOOKS[c.book];
  var locked = col === 'not-ready';
  var row = document.createElement('div');
  row.className = 'list-row' + (locked ? ' locked' : '') + extraStateClasses(c);
  row.setAttribute('data-code', c.code);
  row.tabIndex = 0;
  row.title = c.code + ' — ' + c.title;

  var badge = '<span class="num-badge" style="background:'+b.color+'">'+chapterNum(c.code)+'</span>';
  var body = badge + '<span class="list-title">'+c.title+'</span>';

  if(locked){
    var missing = directUnmetHard(c.code, base);
    var SHOW = 4;
    var shown = missing.slice(0, SHOW).map(function(p){ return CH_BY_CODE[p].title; });
    var extra = missing.length - shown.length;
    var listText = shown.join(', ') + (extra > 0 ? fmt(STR.card.moreSuffixTemplate, {n:extra}) : '');
    var away = unmetAncestors(c.code, base, unmetMemo).size;
    body +=
      '<span class="list-tag">'+fmt(STR.card.awayShort, {n:away})+'</span>'+
      '<div class="card-popover"><p class="pop-label">'+STR.card.waitingOnLabel+'</p><p class="pop-list">'+listText+'</p></div>';
  }else{
    var flagBadge = flagged ? '<span class="list-flag">'+STR.card.needsRevisionBadge+'</span>' : '';
    var unlocks = (col==='ready' || col==='studying') ? unlocksPopoverHtml(c, base) : '';
    body += flagBadge + '<div class="list-actions">'+cardActions(c, col, flagged)+'</div>' + unlocks;
  }

  row.innerHTML = body;
  bindActionButtons(row);
  return row;
}

function clearStrings(){
  var svg = document.getElementById('strings');
  if(svg) svg.innerHTML = '';
}

function drawStrings(code){
  var svg = document.getElementById('strings');
  var board = document.getElementById('board');
  if(!svg || !board) return;
  svg.innerHTML = '';
  var c = CH_BY_CODE[code];
  var srcEl = board.querySelector('.card[data-code="'+code+'"]');
  if(!srcEl) return;
  var boardRect = board.getBoundingClientRect();
  var srcRect = srcEl.getBoundingClientRect();
  var srcX = srcRect.left - boardRect.left + srcRect.width/2 + board.scrollLeft;
  var srcY = srcRect.top - boardRect.top + srcRect.height/2 + board.scrollTop;

  function link(otherCode, dashed){
    var el = board.querySelector('.card[data-code="'+otherCode+'"]');
    if(!el) return;
    var r = el.getBoundingClientRect();
    var x = r.left - boardRect.left + r.width/2 + board.scrollLeft;
    var y = r.top - boardRect.top + r.height/2 + board.scrollTop;
    var mx = (srcX+x)/2, my = Math.min(srcY,y) - 22;
    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M'+srcX+','+srcY+' Q'+mx+','+my+' '+x+','+y);
    path.setAttribute('stroke', dashed ? '#a89d87' : '#4a463e');
    path.setAttribute('stroke-width', dashed ? '1.6' : '2');
    path.setAttribute('fill','none');
    path.setAttribute('stroke-linecap','round');
    if(dashed) path.setAttribute('stroke-dasharray','4,4');
    svg.appendChild(path);
  }

  c.hard.forEach(function(p){ link(p, false); });
  c.soft.forEach(function(p){ link(p, true); });
  CHAPTERS.forEach(function(other){
    if(other.hard.indexOf(code) !== -1) link(other.code, false);
    if(other.soft.indexOf(code) !== -1) link(other.code, true);
  });
}

function bindStaticControls(){
  document.getElementById('resetBtn').addEventListener('click', function(){
    document.getElementById('resetOverlay').classList.add('open');
  });
  document.getElementById('resetCancel').addEventListener('click', function(){
    document.getElementById('resetOverlay').classList.remove('open');
  });
  document.getElementById('resetOverlay').addEventListener('click', function(e){
    if(e.target.id === 'resetOverlay') e.currentTarget.classList.remove('open');
  });
  document.getElementById('resetConfirm').addEventListener('click', function(){
    manualStatus = {};
    saveData();
    render();
    document.getElementById('resetOverlay').classList.remove('open');
  });

  document.getElementById('graphFab').addEventListener('click', openGraph);
  document.getElementById('graphClose').addEventListener('click', closeGraph);
  document.getElementById('graphOverlay').addEventListener('click', function(e){
    if(e.target.id === 'graphOverlay') closeGraph();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeGraph();
  });

  var searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', function(){
    searchQuery = searchInput.value.trim().toLowerCase();
    render();
  });
  searchInput.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var wrap = viewMode === 'list' ? document.getElementById('listView') : document.getElementById('board');
    var match = wrap.querySelector('.search-match');
    if(match) match.scrollIntoView({block:'center', behavior:'smooth'});
  });

  var boardBtn = document.getElementById('viewBoardBtn');
  var listBtn = document.getElementById('viewListBtn');
  function setView(mode){
    viewMode = mode;
    boardBtn.classList.toggle('active', mode==='board');
    listBtn.classList.toggle('active', mode==='list');
    render();
  }
  boardBtn.addEventListener('click', function(){ setView('board'); });
  listBtn.addEventListener('click', function(){ setView('list'); });

  document.getElementById('critPathBtn').addEventListener('click', function(){
    showCriticalPath = !showCriticalPath;
    this.classList.toggle('active', showCriticalPath);
    render();
  });
}

var graphSim = null;

function openGraph(){
  document.getElementById('graphOverlay').classList.add('open');
  buildGraph();
}

function closeGraph(){
  document.getElementById('graphOverlay').classList.remove('open');
  if(graphSim){ graphSim.stop(); graphSim = null; }
}

function buildGraph(){
  var res = computeAll();
  var display = res.display, needsRevision = res.needsRevision;

  var wrap = document.querySelector('.graph-canvas-wrap');
  var width = wrap.clientWidth, height = wrap.clientHeight;

  var svg = d3.select('#graphSvg');
  svg.selectAll('*').remove();
  svg.attr('viewBox', '0 0 '+width+' '+height);

  var zoomLayer = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', function(ev){
    zoomLayer.attr('transform', ev.transform);
  }));

  var dependents = {};
  CHAPTERS.forEach(function(c){
    c.hard.concat(c.soft).forEach(function(p){
      dependents[p] = (dependents[p] || 0) + 1;
    });
  });

  var nodes = CHAPTERS.map(function(c){
    var b = BOOKS[c.book];
    var st = display[c.code];
    var r = 9 + Math.min(dependents[c.code] || 0, 8) * 0.8;
    return {
      id:c.code, title:c.title, book:c.book, color:b.color,
      status:st, flagged: !!needsRevision[c.code], r:r,
      num: chapterNum(c.code)
    };
  });

  var links = [];
  CHAPTERS.forEach(function(c){
    c.hard.forEach(function(p){ links.push({source:p, target:c.code, type:'hard'}); });
    c.soft.forEach(function(p){ links.push({source:p, target:c.code, type:'soft'}); });
  });

  var neighborMap = {};
  nodes.forEach(function(n){ neighborMap[n.id] = new Set([n.id]); });
  links.forEach(function(l){
    neighborMap[l.source].add(l.target);
    neighborMap[l.target].add(l.source);
  });

  var linkSel = zoomLayer.append('g').selectAll('path')
    .data(links).enter().append('path')
    .attr('class', function(d){ return 'g-link' + (d.type==='soft' ? ' soft' : ''); })
    .attr('stroke', function(d){ return d.type==='soft' ? '#a89d87' : '#4a463e'; })
    .attr('stroke-width', function(d){ return d.type==='soft' ? 1.2 : 1.6; })
    .attr('stroke-dasharray', function(d){ return d.type==='soft' ? '3,3' : null; });

  var nodeSel = zoomLayer.append('g').selectAll('g')
    .data(nodes).enter().append('g')
    .attr('class', 'g-node')
    .call(d3.drag()
      .on('start', function(ev, d){ if(!ev.active) graphSim.alphaTarget(0.25).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag', function(ev, d){ d.fx=ev.x; d.fy=ev.y; })
      .on('end', function(ev, d){ if(!ev.active) graphSim.alphaTarget(0); d.fx=null; d.fy=null; })
    );

  nodeSel.append('circle')
    .attr('r', function(d){ return d.r; })
    .attr('fill', function(d){
      if(d.status==='done') return d.color;
      if(d.status==='studying') return d.color;
      return d.status==='ready' ? '#ffffff' : '#f2f0ea';
    })
    .attr('fill-opacity', function(d){ return d.status==='studying' ? 0.55 : 1; })
    .attr('stroke', function(d){ return d.status==='not-ready' ? '#d8d4c6' : d.color; })
    .attr('stroke-width', function(d){ return d.status==='ready' ? 2 : 1.4; });

  nodeSel.append('text')
    .attr('font-size', function(d){ return Math.max(8, d.r*0.62); })
    .attr('fill', function(d){ return (d.status==='done' || d.status==='studying') ? '#fbfaf6' : d.color; })
    .text(function(d){ return d.num; });

  nodeSel.append('title').text(function(d){ return d.title; });

  nodeSel.on('mouseenter', function(ev, d){
    var keep = neighborMap[d.id];
    nodeSel.classed('g-dim', function(o){ return !keep.has(o.id); });
    linkSel.classed('g-dim', function(l){ return l.source.id !== d.id && l.target.id !== d.id; });
  });
  nodeSel.on('mouseleave', function(){
    nodeSel.classed('g-dim', false);
    linkSel.classed('g-dim', false);
  });

  graphSim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(function(d){return d.id;}).distance(42).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-70))
    .force('collide', d3.forceCollide().radius(function(d){return d.r+5;}))
    .force('center', d3.forceCenter(width/2, height/2))
    .on('tick', function(){
      linkSel.attr('d', function(d){ return 'M'+d.source.x+','+d.source.y+' L'+d.target.x+','+d.target.y; });
      nodeSel.attr('transform', function(d){ return 'translate('+d.x+','+d.y+')'; });
    });
}

async function fetchJson(url){
  var res = await fetch(url);
  return res.json();
}

async function init(){
  var results = await Promise.all([
    fetchJson(STRINGS_URL),
    fetchJson(BOOKS_URL),
    fetchJson(CHAPTERS_URL),
    fetchJson(CONFIG_URL)
  ]);
  STR = results[0];
  BOOKS = results[1].books;
  BOOK_ORDER = results[1].bookOrder;
  CHAPTERS = results[2].map(function(r){
    return {code:r[0], book:r[1], title:r[2], hard:r[3], soft:r[4]};
  });
  STORAGE_KEY = results[3].storageKey;
  COLUMN_ORDER = results[3].columnOrder;
  store = DualStore.create(STORAGE_KEY);

  CH_BY_CODE = {};
  CHAPTERS.forEach(function(c){ CH_BY_CODE[c.code] = c; });
  activeBooks = new Set(Object.keys(BOOKS));
  DEPENDENTS = buildDependents();
  CRITICAL_PATH = computeCriticalPath();

  renderStaticText();
  bindStaticControls();
  await loadData();
}

init();

})();
