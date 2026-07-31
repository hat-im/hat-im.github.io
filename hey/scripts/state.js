window.Hey = window.Hey || {};

(function (Hey) {
  Hey.BASE = "hey/";
  Hey.STRINGS_URL = Hey.BASE + "strings.json";
  Hey.GAMES_URL = Hey.BASE + "data/games.json";
  Hey.FACTS_URL = Hey.BASE + "data/funfacts.json";

  Hey.state = {
    STR: {},
    GAMES: { main: [] },
    FACTS: { facts: [] },
    countdownTimer: undefined,
    timeLeft: 5,
    userClicked: false,
    redirectAborted: false,
    currentSurpriseToken: null,
  };

  Hey.fmt = function (template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, key) {
      return vars[key];
    });
  };

  Hey.fetchJson = async function (url) {
    var res = await fetch(url);
    return res.json();
  };

  Hey.wait = function (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };
})(window.Hey);
