(function (DJ) {
  // Seeded PRNG (mulberry32) so the joke-of-the-day pick is stable for a given seed
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dateSeed() {
    var today = new Date();
    var dateStr =
      today.getFullYear() + "-" + today.getMonth() + "-" + today.getDate();
    var hash = 0;
    for (var i = 0; i < dateStr.length; i++) {
      hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
    }
    return hash;
  }

  var SEEN_KEY = "dadJokes_seenIds";

  function getSeenIds() {
    try {
      return JSON.parse(sessionStorage.getItem(SEEN_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function markSeen(id) {
    var seen = getSeenIds();
    if (seen.indexOf(id) === -1) {
      seen.push(id);
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  }

  DJ.pickTodaysJoke = function () {
    var jokes = DJ.state.DATA.jokes;
    var rand = mulberry32(dateSeed());
    var index = Math.floor(rand() * jokes.length);
    DJ.state.joke = jokes[index];
    markSeen(DJ.state.joke.id);
    return DJ.state.joke;
  };

  // Picks a joke that hasn't been shown yet this tab session (tracked in
  // sessionStorage, so it survives reloads within the tab but not across
  // tabs/new sessions). Once every joke has been seen, the pool resets and
  // starts over from a fresh random pick.
  DJ.pickNextJoke = function () {
    var jokes = DJ.state.DATA.jokes;
    var seen = getSeenIds();
    var unseen = jokes.filter(function (joke) {
      return seen.indexOf(joke.id) === -1;
    });

    if (unseen.length === 0) {
      sessionStorage.removeItem(SEEN_KEY);
      unseen = jokes;
    }

    var picked = unseen[Math.floor(Math.random() * unseen.length)];
    DJ.state.joke = picked;
    markSeen(picked.id);
    return DJ.state.joke;
  };

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // A different slight tilt each time, so it reads as handwritten-askew
  // rather than a fixed design choice.
  function applyRandomTilt(el) {
    var angle = (Math.random() * 6 - 3).toFixed(2);
    el.style.transform = "rotate(" + angle + "deg)";
  }

  DJ.typeSetup = async function () {
    document.title = DJ.state.STR.pageTitle;

    var text = DJ.state.joke.setup;
    var el = document.getElementById("setupBox");
    var buffer = "";

    applyRandomTilt(el);

    el.innerHTML = "";
    for (var i = 0; i < text.length; i++) {
      buffer += text[i];
      el.innerHTML = buffer + '<span class="typing-cursor">|</span>';
      await wait(70);
    }
    el.innerHTML = buffer;
  };

  DJ.renderNextLink = function () {
    var link = document.getElementById("nextLink");
    link.textContent = DJ.state.STR.nextLink;
    applyRandomTilt(link);
  };
})(window.DadJokes);
