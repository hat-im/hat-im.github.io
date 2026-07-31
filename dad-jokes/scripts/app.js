(function (DJ) {
  async function init() {
    var results = await Promise.all([
      DJ.fetchJson(DJ.STRINGS_URL),
      DJ.fetchJson(DJ.JOKES_URL),
    ]);
    DJ.state.STR = results[0];
    DJ.state.DATA = results[1];

    DJ.pickTodaysJoke();
    DJ.typeSetup();
    DJ.renderDots();
    DJ.bindModalEvents();
    DJ.bindDrawingEvents();
    DJ.checkAutoComplete();
  }

  init();
})(window.DadJokes);
