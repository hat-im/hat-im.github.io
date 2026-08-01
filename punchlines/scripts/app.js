(function (PL) {
  async function init() {
    var results = await Promise.all([
      PL.fetchJson(PL.STRINGS_URL),
      PL.fetchJson(PL.JOKES_URL),
    ]);
    PL.state.STR = results[0];
    PL.state.DATA = results[1];

    PL.pickTodaysJoke();
    PL.typeSetup();
    PL.renderDots();
    PL.bindModalEvents();
    PL.bindDrawingEvents();
    PL.checkAutoComplete();
  }

  init();
})(window.Punchlines);
