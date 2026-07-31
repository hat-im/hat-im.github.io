window.DadJokes = window.DadJokes || {};

(function (DJ) {
  DJ.BASE = "dad-jokes/";
  DJ.STRINGS_URL = DJ.BASE + "strings.json";
  DJ.JOKES_URL = DJ.BASE + "data/jokes.json";

  DJ.state = {
    STR: {},
    DATA: { canvas: { width: 1000, height: 600 }, jokes: [] },
    joke: null,
  };

  DJ.fetchJson = async function (url) {
    var res = await fetch(url, { cache: "no-cache" });
    return res.json();
  };
})(window.DadJokes);
