(function (Hey) {
  // Hidden message in JavaScript variable (not easily found)
  const projectSignature = "Made with love";

  function bindEvents() {
    document.querySelectorAll(".instruction-item").forEach(function (item) {
      item.addEventListener("click", function () {
        Hey.toggleScratchItem(item);
      });
    });

    document.getElementById("entryButton").addEventListener("click", function () {
      Hey.enterGames(true);
    });

    document.getElementById("abortButton").addEventListener("click", Hey.abortRedirect);

    document.getElementById("gameToggle").addEventListener("click", Hey.toggleGameCard);

    document.getElementById("gameCardClose").addEventListener("click", Hey.hideGameCard);

    // Auto-redirect after 60 seconds of inactivity
    setTimeout(() => {
      if (Hey.state.timeLeft === 5 && !Hey.state.userClicked && !Hey.state.redirectAborted) {
        Hey.enterGames(false);
      }
    }, 60000);

    // Add some keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (Hey.state.timeLeft === 5) {
          // Only if countdown hasn't started
          Hey.enterGames(true);
        }
      }
    });

    Hey.renderGameGrid();
    Hey.checkForReturnVisitor();

    // Add animations for button celebration
    const style = document.createElement("style");
    style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
        `;
    document.head.appendChild(style);
  }

  async function init() {
    const results = await Promise.all([
      Hey.fetchJson(Hey.STRINGS_URL),
      Hey.fetchJson(Hey.GAMES_URL),
      Hey.fetchJson(Hey.FACTS_URL),
      Hey.fetchJson(Hey.LAST_UPDATED_URL),
    ]);
    Hey.state.STR = results[0];
    Hey.state.GAMES = results[1];
    Hey.state.FACTS = results[2];

    Hey.renderStaticText();
    Hey.renderFactTicker();
    Hey.renderLastUpdated(results[3]);
    bindEvents();
  }

  init();
})(window.Hey);
