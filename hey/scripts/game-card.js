(function (Hey) {
  function updateGridLayout(numGames) {
    const gameGrid = document.getElementById("gameGrid");

    // Remove existing grid positioning CSS
    gameGrid.style.gridTemplateColumns = "";
    gameGrid.style.gridTemplateRows = "";
    gameGrid.style.justifyItems = "";

    if (numGames === 1) {
      gameGrid.style.gridTemplateColumns = "1fr";
      gameGrid.style.justifyItems = "center";
    } else if (numGames === 2) {
      gameGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
    } else if (numGames === 3) {
      gameGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
    } else if (numGames === 4) {
      gameGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
      gameGrid.style.gridTemplateRows = "repeat(2, 1fr)";
    } else if (numGames === 5) {
      gameGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
      gameGrid.style.gridTemplateRows = "repeat(2, 1fr)";
    } else if (numGames === 6) {
      gameGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
      gameGrid.style.gridTemplateRows = "repeat(2, 1fr)";
    } else {
      // 7+ games - 3x3 grid
      gameGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
      gameGrid.style.gridTemplateRows = "repeat(3, 1fr)";
    }
  }

  Hey.showGameCard = function () {
    const card = document.getElementById("gameCard");
    const toggle = document.getElementById("gameToggle");

    card.classList.add("show");
    toggle.style.display = "none";
  };

  Hey.hideGameCard = function () {
    const card = document.getElementById("gameCard");
    const toggle = document.getElementById("gameToggle");

    card.classList.remove("show");
    toggle.style.display = "block";
  };

  Hey.toggleGameCard = function () {
    const card = document.getElementById("gameCard");
    if (card.classList.contains("show")) {
      Hey.hideGameCard();
    } else {
      Hey.showGameCard();
    }
  };

  Hey.renderGameGrid = function () {
    const games = Hey.state.GAMES.main;
    if (games.length === 0) return;

    const gameGrid = document.getElementById("gameGrid");
    gameGrid.innerHTML = "";

    updateGridLayout(games.length);

    games.forEach((game) => {
      if (game.comingSoon) {
        const dummy = document.createElement("div");
        dummy.className = "game-button disabled";
        dummy.id = game.id;
        dummy.textContent = game.name;
        if (game.hoverText) dummy.title = game.hoverText;
        gameGrid.appendChild(dummy);
        return;
      }

      const link = document.createElement("a");
      link.href = game.url;
      link.className = "game-button";
      link.id = game.id;
      link.textContent = game.name;
      gameGrid.appendChild(link);
    });

    document.getElementById("gameToggle").classList.add("show");

    // Auto-show the card briefly if this is the first time
    const cardShown = localStorage.getItem("game_card_shown") === "true";
    if (!cardShown) {
      setTimeout(() => {
        Hey.showGameCard();
        localStorage.setItem("game_card_shown", "true");

        // Auto-hide after 5 seconds
        setTimeout(() => {
          Hey.hideGameCard();
        }, 5000);
      }, 1000);
    }
  };
})(window.Hey);
