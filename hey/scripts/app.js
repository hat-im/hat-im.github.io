(function () {
  var BASE = "hey/";
  var STRINGS_URL = BASE + "strings.json";
  var PUZZLES_URL = BASE + "data/puzzles.json";

  var STR = {};
  var PUZZLES = { main: [], finalUnlock: null };

  var countdownTimer;
  var timeLeft = 5;
  var userClicked = false;
  var redirectAborted = false;

  function fmt(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (_, key) {
      return vars[key];
    });
  }

  async function fetchJson(url) {
    var res = await fetch(url);
    return res.json();
  }

  function renderStaticText() {
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
    document.getElementById("countdownText").innerHTML = fmt(STR.countdown.template, {
      timer: timeLeft,
    });
    document.getElementById("abortButton").textContent = STR.countdown.stayHere;

    document.querySelector(".footer-text").innerHTML = STR.footer.initial;

    document.getElementById("hiddenMessage").textContent = STR.hiddenMessage;

    document.getElementById("puzzleCardTitle").textContent = STR.puzzleCard.title;
    document.getElementById("puzzleCardClose").innerHTML = STR.puzzleCard.close;
  }

  function animateFooterChange(newText, callback) {
    const footer = document.querySelector(".footer-text");
    footer.classList.add("fade-out");

    setTimeout(() => {
      footer.innerHTML = newText;
      footer.classList.remove("fade-out");
      if (callback) callback();
    }, 400);
  }

  function enterPuzzles(clickedByUser = false) {
    userClicked = clickedByUser;

    // Disable the button
    const button = document.getElementById("entryButton");
    button.disabled = true;
    button.style.opacity = "0.5";
    button.style.cursor = "not-allowed";
    button.textContent = STR.entryButton.starting;

    if (userClicked) {
      // User clicked sequence
      animateFooterChange(STR.footer.perfectTiming, () => {
        setTimeout(() => {
          animateFooterChange(STR.footer.letsGetStarted, () => {
            setTimeout(() => {
              showCountdown();
            }, 2500);
          });
        }, 2000);
      });
    } else {
      // Auto-redirect sequence
      animateFooterChange(STR.footer.notThatMuchTime, () => {
        setTimeout(() => {
          animateFooterChange(STR.footer.illRedirectYou, () => {
            setTimeout(() => {
              showCountdown();
            }, 2500);
          });
        }, 3500);
      });
    }
  }

  function abortRedirect() {
    redirectAborted = true;
    clearInterval(countdownTimer);

    const countdown = document.getElementById("countdown");
    countdown.classList.remove("show");

    // Re-enable the begin button
    const button = document.getElementById("entryButton");
    button.disabled = false;
    button.style.opacity = "1";
    button.style.cursor = "pointer";
    button.textContent = STR.entryButton.default;

    // Reset timer
    timeLeft = 5;

    animateFooterChange(STR.footer.aborted);
  }

  function showCountdown() {
    if (redirectAborted) return;

    const countdown = document.getElementById("countdown");
    countdown.classList.add("show");

    // Start countdown
    countdownTimer = setInterval(() => {
      if (redirectAborted) {
        clearInterval(countdownTimer);
        return;
      }

      timeLeft--;
      document.getElementById("timer").textContent = timeLeft;

      if (timeLeft <= 0) {
        clearInterval(countdownTimer);
        if (!redirectAborted) {
          window.location.href = "dear-sam.html";
        }
      }
    }, 1000);
  }

  // Puzzle Card Functions
  function checkCompletedPuzzles() {
    const puzzles = PUZZLES.main.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        url: atob(p.url),
        completed: localStorage.getItem(p.storageKey) === "true",
      };
    });

    // Check if all main puzzles are completed
    const allMainPuzzlesCompleted = puzzles.every((puzzle) => puzzle.completed);

    // Add scrabble-fight if all main puzzles are completed
    if (allMainPuzzlesCompleted && PUZZLES.finalUnlock) {
      puzzles.push({
        id: PUZZLES.finalUnlock.id,
        name: PUZZLES.finalUnlock.name,
        url: atob(PUZZLES.finalUnlock.url),
        completed: true, // Always show as available once unlocked
      });
    }

    // Filter to only completed puzzles
    const completedPuzzles = puzzles.filter((puzzle) => puzzle.completed);

    if (completedPuzzles.length > 0) {
      // Clear existing grid
      const puzzleGrid = document.getElementById("puzzleGrid");
      puzzleGrid.innerHTML = "";

      // Dynamically adjust grid layout based on number of completed puzzles
      updateGridLayout(completedPuzzles.length);

      // Add only completed puzzles
      completedPuzzles.forEach((puzzle) => {
        const link = document.createElement("a");
        link.href = puzzle.url;
        link.className = "puzzle-button";
        link.id = puzzle.id;
        link.textContent = puzzle.name;

        // Special styling for Scrabble Fight as the final unlock
        if (puzzle.id === "scrabblefight") {
          link.classList.add("final-unlock");
        }

        puzzleGrid.appendChild(link);
      });

      // Show the toggle button
      document.getElementById("puzzleToggle").classList.add("show");

      // Auto-show the card briefly if this is the first time
      const cardShown = localStorage.getItem("puzzle_card_shown") === "true";
      if (!cardShown) {
        setTimeout(() => {
          showPuzzleCard();
          localStorage.setItem("puzzle_card_shown", "true");

          // Auto-hide after 5 seconds
          setTimeout(() => {
            hidePuzzleCard();
          }, 5000);
        }, 1000);
      }
    }
  }

  function updateGridLayout(numPuzzles) {
    const puzzleGrid = document.getElementById("puzzleGrid");

    // Remove existing grid positioning CSS
    puzzleGrid.style.gridTemplateColumns = "";
    puzzleGrid.style.gridTemplateRows = "";
    puzzleGrid.style.justifyItems = "";

    if (numPuzzles === 1) {
      puzzleGrid.style.gridTemplateColumns = "1fr";
      puzzleGrid.style.justifyItems = "center";
    } else if (numPuzzles === 2) {
      puzzleGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
    } else if (numPuzzles === 3) {
      puzzleGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
    } else if (numPuzzles === 4) {
      puzzleGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
      puzzleGrid.style.gridTemplateRows = "repeat(2, 1fr)";
    } else if (numPuzzles === 5) {
      puzzleGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
      puzzleGrid.style.gridTemplateRows = "repeat(2, 1fr)";
    } else if (numPuzzles === 6) {
      puzzleGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
      puzzleGrid.style.gridTemplateRows = "repeat(2, 1fr)";
    } else {
      // 7 puzzles - 3x3 grid with center cell for scrabble-fight
      puzzleGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
      puzzleGrid.style.gridTemplateRows = "repeat(3, 1fr)";
    }
  }

  function togglePuzzleCard() {
    const card = document.getElementById("puzzleCard");
    if (card.classList.contains("show")) {
      hidePuzzleCard();
    } else {
      showPuzzleCard();
    }
  }

  function showPuzzleCard() {
    const card = document.getElementById("puzzleCard");
    const toggle = document.getElementById("puzzleToggle");

    card.classList.add("show");
    toggle.style.display = "none";
  }

  function hidePuzzleCard() {
    const card = document.getElementById("puzzleCard");
    const toggle = document.getElementById("puzzleToggle");

    card.classList.remove("show");
    toggle.style.display = "block";
  }

  function checkForReturnVisitor() {
    // Check if user has visited before
    const hasVisitedBefore = localStorage.getItem("hey_page_visited") === "true";

    if (hasVisitedBefore) {
      // Show welcome back message
      showWelcomeBackMessage();
    }

    // Mark this visit
    localStorage.setItem("hey_page_visited", "true");
  }

  function showWelcomeBackMessage() {
    const surpriseMessage = document.getElementById("surpriseMessage");
    const welcomeBackText = STR.surprise.welcomeBack;

    surpriseMessage.classList.add("typing");
    surpriseMessage.innerHTML = "";

    let charIndex = 0;

    function typeWelcomeBack() {
      if (charIndex < welcomeBackText.length) {
        surpriseMessage.innerHTML =
          welcomeBackText.substring(0, charIndex + 1) +
          '<span class="typing-cursor">|</span>';
        charIndex++;
        setTimeout(typeWelcomeBack, 80);
      } else {
        // Remove cursor and add show class
        surpriseMessage.innerHTML = welcomeBackText;
        surpriseMessage.classList.add("show");

        // After 3 seconds, start deleting
        setTimeout(() => {
          deleteWelcomeBackMessage(surpriseMessage, welcomeBackText);
        }, 3000);
      }
    }

    typeWelcomeBack();
  }

  function deleteWelcomeBackMessage(element, text) {
    let charIndex = text.length;

    function deleteNextChar() {
      if (charIndex > 0) {
        element.innerHTML = text.substring(0, charIndex) + '<span class="typing-cursor">|</span>';
        charIndex--;
        setTimeout(deleteNextChar, 50); // Faster deletion
      } else {
        // Remove everything including cursor
        element.classList.remove("show", "typing");
        element.innerHTML = "";
      }
    }

    deleteNextChar();
  }

  // Hidden message in JavaScript variable (not easily found)
  const projectSignature = "Made with love";

  // Scratch-off functionality
  function toggleScratchItem(item) {
    if (!item.classList.contains("scratched-off")) {
      item.classList.add("scratched-off");
    } else {
      item.classList.remove("scratched-off");
    }
    checkAllItemsCompleted();
  }

  function checkAllItemsCompleted() {
    const items = document.querySelectorAll(".instruction-item");
    const scratchedItems = document.querySelectorAll(".instruction-item.scratched-off");

    if (scratchedItems.length === items.length) {
      startTypingMessage();
    } else {
      const surpriseMessage = document.getElementById("surpriseMessage");
      surpriseMessage.classList.remove("show", "typing");
      surpriseMessage.innerHTML = "";
      const button = document.getElementById("entryButton");
      button.textContent = STR.entryButton.ready;
    }
  }

  function startTypingMessage() {
    const message = STR.surprise.letsGo;
    const surpriseMessage = document.getElementById("surpriseMessage");

    surpriseMessage.classList.add("typing");
    surpriseMessage.innerHTML = "";

    let charIndex = 0;

    function typeNextChar() {
      if (charIndex < message.length) {
        surpriseMessage.innerHTML =
          message.substring(0, charIndex + 1) + '<span class="typing-cursor">|</span>';
        charIndex++;
        setTimeout(typeNextChar, 100); // Adjust typing speed here
      } else {
        // Remove cursor and add show class
        surpriseMessage.innerHTML = message;
        surpriseMessage.classList.add("show");

        // Update button text
        setTimeout(() => {
          const button = document.getElementById("entryButton");
          button.textContent = STR.entryButton.excited;
        }, 200);
      }
    }

    typeNextChar();
  }

  function bindEvents() {
    document.querySelectorAll(".instruction-item").forEach(function (item) {
      item.addEventListener("click", function () {
        toggleScratchItem(item);
      });
    });

    document.getElementById("entryButton").addEventListener("click", function () {
      enterPuzzles(true);
    });

    document.getElementById("abortButton").addEventListener("click", abortRedirect);

    document.getElementById("puzzleToggle").addEventListener("click", togglePuzzleCard);

    document.getElementById("puzzleCardClose").addEventListener("click", hidePuzzleCard);

    // Auto-redirect after 60 seconds of inactivity
    setTimeout(() => {
      if (timeLeft === 5 && !userClicked && !redirectAborted) {
        enterPuzzles(false);
      }
    }, 60000);

    // Add some keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (timeLeft === 5) {
          // Only if countdown hasn't started
          enterPuzzles(true);
        }
      }
    });

    // Check for completed puzzles on load
    checkCompletedPuzzles();
    checkForReturnVisitor();

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
    const results = await Promise.all([fetchJson(STRINGS_URL), fetchJson(PUZZLES_URL)]);
    STR = results[0];
    PUZZLES = results[1];

    renderStaticText();
    bindEvents();
  }

  init();
})();
