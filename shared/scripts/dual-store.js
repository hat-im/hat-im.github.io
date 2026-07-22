// Persists to both the artifact storage API (window.storage - the only
// store that actually works inside Claude.ai) and localStorage (inert in
// Claude.ai, but functional if a page is exported and opened/embedded
// elsewhere). Each saved entry carries a ts timestamp; whichever entry is
// newer wins if the two stores disagree, and the older store is resynced.
(function(global){

function normalizeEntry(parsed){
  if(parsed && typeof parsed === 'object' && 'data' in parsed && 'ts' in parsed) return parsed;
  return {data: parsed || null, ts: 0};
}

function create(storageKey){
  function readLocal(){
    try{
      var raw = localStorage.getItem(storageKey);
      if(raw) return normalizeEntry(JSON.parse(raw));
    }catch(e){}
    return null;
  }

  function writeLocal(entry){
    try{ localStorage.setItem(storageKey, JSON.stringify(entry)); }catch(e){}
  }

  async function readRemote(){
    try{
      var res = await window.storage.get(storageKey, false);
      if(res && res.value) return normalizeEntry(JSON.parse(res.value));
    }catch(e){}
    return null;
  }

  async function writeRemote(entry){
    try{ await window.storage.set(storageKey, JSON.stringify(entry), false); }catch(e){}
  }

  async function load(){
    var local = readLocal();
    var remote = await readRemote();

    var winner = null;
    if(local && remote){
      winner = (remote.ts >= local.ts) ? remote : local;
    }else{
      winner = local || remote;
    }

    if(winner){
      if(!local || local.ts < winner.ts) writeLocal(winner);
      if(!remote || remote.ts < winner.ts) writeRemote(winner);
    }

    return winner; // null when nothing has been saved anywhere yet
  }

  async function save(data){
    var entry = {data: data, ts: Date.now()};
    writeLocal(entry);
    await writeRemote(entry);
    return entry;
  }

  return {load: load, save: save};
}

global.DualStore = {create: create};

})(window);
