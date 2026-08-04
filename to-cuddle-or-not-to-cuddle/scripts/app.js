(function () {
  var LEVELS_URL = "to-cuddle-or-not-to-cuddle/data/levels.json";
  var ANIMALS_URL = "to-cuddle-or-not-to-cuddle/data/animals.json";

  // The slider's underlying scale is fine-grained so dragging feels smooth,
  // even though only `dangerLevels.length` discrete categories actually
  // exist — see bucketIndex/levelAtSliderValue below.
  var RANGE_MAX = 1000;

  // How long the slider sits colored (correct/wrong), uncovered by the
  // modal, before the fact popup appears — gives that feedback a beat to
  // register on its own.
  var RESOLVE_PAUSE_MS = 550;

  var state = {
    dangerLevels: [],
    deck: [],
    deckIndex: 0,
    seen: 0,
    correct: 0,
    locked: false,
    touched: false,
  };

  var els = {};

  function shuffled(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function currentAnimal() {
    return state.deck[state.deckIndex];
  }

  function updateStats() {
    els.stats.textContent = state.correct + "/" + state.seen;
  }

  // Maps the slider's continuous 0..RANGE_MAX value onto one of the N
  // discrete danger levels.
  function bucketIndex(value) {
    var n = state.dangerLevels.length;
    var idx = Math.floor((value / RANGE_MAX) * n);
    return Math.min(n - 1, Math.max(0, idx));
  }

  function levelAtSliderValue() {
    return state.dangerLevels[bucketIndex(els.range.valueAsNumber)];
  }

  function updateReadout() {
    var level = levelAtSliderValue();
    els.readout.textContent = level.label;
    els.readout.style.background = level.color;
  }

  // Hard-edged color bands, one per level, rather than a smooth blend —
  // built from whatever levels.json actually contains, so the track always
  // matches the current category count/colors.
  function buildTrackGradient(levels) {
    var n = levels.length;
    var stops = [];

    levels.forEach(function (level, i) {
      var start = ((i / n) * 100).toFixed(2) + "%";
      var end = (((i + 1) / n) * 100).toFixed(2) + "%";
      stops.push(level.color + " " + start, level.color + " " + end);
    });

    return "linear-gradient(to right, " + stops.join(", ") + ")";
  }

  function resetSlider() {
    els.range.disabled = false;
    els.range.value = 0;
    els.barEl.removeAttribute("data-result");
    state.touched = false;
    updateReadout();
  }

  function renderCard() {
    var animal = currentAnimal();
    els.cardImage.src = animal.image;
    els.cardImage.alt = animal.altText || animal.name;
    state.locked = false;
    resetSlider();
  }

  function levelIndexById(id) {
    for (var i = 0; i < state.dangerLevels.length; i++) {
      if (state.dangerLevels[i].id === id) return i;
    }
    return -1;
  }

  function resolveDrop(guessedLevelId) {
    if (state.locked) return;
    state.locked = true;
    els.range.disabled = true;

    var animal = currentAnimal();
    var isCorrect = guessedLevelId === animal.dangerLevel;

    state.seen++;
    if (isCorrect) state.correct++;
    updateStats();

    els.barEl.dataset.result = isCorrect ? "correct" : "wrong";

    setTimeout(function () {
      showModal(animal, isCorrect, guessedLevelId);
    }, RESOLVE_PAUSE_MS);
  }

  // Wrong guesses never reveal the correct level, but do say which
  // direction the guess was off in — overestimating danger reads
  // differently from underestimating it.
  function resultText(isCorrect, guessedLevelId, correctLevelId) {
    if (isCorrect) return "Correct!";
    return levelIndexById(guessedLevelId) > levelIndexById(correctLevelId)
      ? "Less lethal than you think."
      : "More menace than you measured.";
  }

  function randomFact(animal) {
    var facts = animal.funFacts;
    return facts[Math.floor(Math.random() * facts.length)];
  }

  function showModal(animal, isCorrect, guessedLevelId) {
    els.modalImage.src = animal.image;
    els.modalImage.alt = animal.altText || animal.name;
    els.modalResult.textContent = resultText(isCorrect, guessedLevelId, animal.dangerLevel);
    els.modalResult.className = "modal-result" + (isCorrect ? "" : " wrong");
    els.modalNameLink.textContent = animal.name;
    els.modalNameLink.href = animal.wikipediaUrl;
    els.modalFact.textContent = randomFact(animal);
    els.modalOverlay.classList.add("show");
  }

  function hideModal() {
    els.modalOverlay.classList.remove("show");
  }

  function nextAnimal() {
    hideModal();

    state.deckIndex++;
    if (state.deckIndex >= state.deck.length) {
      state.deck = shuffled(state.deck);
      state.deckIndex = 0;
    }

    renderCard();
  }

  function init(dangerLevels, animals) {
    state.dangerLevels = dangerLevels;
    state.deck = shuffled(animals);
    state.deckIndex = 0;

    els.stats = document.getElementById("stats");
    els.cardImage = document.getElementById("cardImage");
    els.readout = document.getElementById("levelReadout");
    els.barEl = document.querySelector(".danger-slider-bar");
    els.range = document.getElementById("dangerRange");
    els.modalOverlay = document.getElementById("modalOverlay");
    els.modalImage = document.getElementById("modalImage");
    els.modalResult = document.getElementById("modalResult");
    els.modalNameLink = document.getElementById("modalNameLink");
    els.modalFact = document.getElementById("modalFact");
    els.modalNextButton = document.getElementById("modalNextButton");

    els.range.min = 0;
    els.range.max = RANGE_MAX;
    els.range.style.setProperty("--track-gradient", buildTrackGradient(state.dangerLevels));

    renderCard();
    updateStats();

    // Fires continuously while dragging/using arrow keys — just previews
    // which level the handle is currently over. The handle itself moves
    // smoothly; only the readout snaps, at bucket boundaries.
    els.range.addEventListener("input", function () {
      state.touched = true;
      updateReadout();
    });

    // Fires once, on release/commit — this is what actually locks in the
    // guess. Ignoring it when `touched` is false means the slider resting
    // at its default starting position on load doesn't auto-submit anything.
    els.range.addEventListener("change", function () {
      if (!state.touched) return;
      resolveDrop(levelAtSliderValue().id);
    });

    els.modalNextButton.addEventListener("click", nextAnimal);
  }

  Promise.all([
    fetch(LEVELS_URL).then(function (res) {
      return res.json();
    }),
    fetch(ANIMALS_URL).then(function (res) {
      return res.json();
    }),
  ])
    .then(function (results) {
      init(results[0], results[1]);
    })
    .catch(function (err) {
      console.error("Failed to load game data", err);
    });
})();
