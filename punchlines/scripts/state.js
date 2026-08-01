window.Punchlines = window.Punchlines || {};

(function (PL) {
  PL.BASE = "punchlines/";
  PL.STRINGS_URL = PL.BASE + "strings.json";
  PL.JOKES_URL = PL.BASE + "data/jokes.json";

  PL.state = {
    STR: {},
    DATA: { canvas: { width: 1000, height: 600 }, jokes: [] },
    joke: null,
  };

  PL.fetchJson = async function (url) {
    var res = await fetch(url, { cache: "no-cache" });
    return res.json();
  };
})(window.Punchlines);
