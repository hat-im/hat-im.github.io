(function (Hey) {
  // Seeded PRNG (mulberry32) so the shuffle is stable for a given seed
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

  function shuffleWithSeed(array, seed) {
    var rand = mulberry32(seed);
    var result = array.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  Hey.renderStaticText = function () {
    const STR = Hey.state.STR;

    document.title = STR.pageTitle;
    document.getElementById("pageHeading").textContent = STR.heading;
    document.getElementById("pageSubheading").textContent = STR.subheading;
    document.getElementById("dedication").textContent = STR.dedication;
    document.getElementById("welcomeMessage").textContent = STR.welcomeMessage;
    document.getElementById("checklistTitle").textContent = STR.checklistTitle;

    var textEls = document.querySelectorAll(".instruction-text");
    textEls.forEach(function (el, i) {
      el.textContent = STR.instructions[i];
    });

    document.getElementById("entryButton").textContent = STR.entryButton.default;
    document.getElementById("countdownText").innerHTML = Hey.fmt(STR.countdown.template, {
      timer: Hey.state.timeLeft,
    });
    document.getElementById("abortButton").textContent = STR.countdown.stayHere;

    document.querySelector(".footer-text").innerHTML = STR.footer.initial;

    document.getElementById("hiddenMessage").textContent = STR.hiddenMessage;

    document.getElementById("gameCardTitle").textContent = STR.gameCard.title;
    document.getElementById("gameCardClose").innerHTML = STR.gameCard.close;
  };

  Hey.renderLastUpdated = function (lastUpdated) {
    var el = document.getElementById("lastUpdated");
    if (!el || !lastUpdated || !lastUpdated.timestamp) return;
    var date = new Date(lastUpdated.timestamp);
    var formatted = date.toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    });
    el.textContent = "Last updated " + formatted;
  };

  // Constant scroll speed regardless of how long the facts are, so the
  // ticker doesn't crawl for short text or zip by for long text.
  var FACT_TICKER_SPEED_PX_PER_SEC = 60;

  Hey.renderFactTicker = function () {
    const FACTS = Hey.state.FACTS;
    if (!FACTS.facts || FACTS.facts.length === 0) return;

    var shuffled = shuffleWithSeed(FACTS.facts, dateSeed());
    var tickerText = shuffled.join("   •   ");

    const content = document.getElementById("factTickerContent");
    const contentDup = document.getElementById("factTickerContentDup");
    const track = document.getElementById("factTickerTrack");

    content.textContent = tickerText;
    contentDup.textContent = tickerText;

    const duration = content.offsetWidth / FACT_TICKER_SPEED_PX_PER_SEC;
    track.style.animationDuration = duration + "s";
  };
})(window.Hey);
