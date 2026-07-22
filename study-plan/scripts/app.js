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

var manualStatus = {};
var activeBooks = new Set();
var unmetMemo = {};
var store = null;

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

function renderCard(c, col, base, flagged){
  var b = BOOKS[c.book];
  var locked = col === 'not-ready';
  var div = document.createElement('div');
  div.className = 'card' + (locked ? ' locked' : '');
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

    body =
      '<div class="card-top">'+badge+'<span class="card-book" style="color:'+b.color+'">'+b.name+'</span></div>'+
      '<div class="card-title">'+c.title+'</div>'+
      flagBadge+
      extraNote+
      '<div class="card-actions">'+cardActions(c, col, flagged)+'</div>';
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

  div.querySelectorAll('button[data-to]').forEach(function(btn){
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

  return div;
}

function render(){
  var res = computeAll();
  var base = res.base, display = res.display, needsRevision = res.needsRevision;

  unmetMemo = {};

  renderChips(base);
  renderOverall(base);

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

  renderStaticText();
  bindStaticControls();
  await loadData();
}

init();

})();
