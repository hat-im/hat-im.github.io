      // Flag to control next puzzle access
      const NEXT_PUZZLES_ENABLED = false; // Set to true to enable all next puzzles

      // Game data (loaded at runtime from wordle/data/*.json)
      const WORDLE_DATA_BASE = "wordle/data/";
      let WORDS_DATA = [];
      let COMMON_WORDS_BY_LENGTH = {};
      let wordleDataLoaded = false;
      async function loadWordleData() {
        if (wordleDataLoaded) return;
        const [wordsData, commonWords] = await Promise.all([
          fetch(WORDLE_DATA_BASE + "words-data.json").then((r) => r.json()),
          fetch(WORDLE_DATA_BASE + "common-words.json").then((r) => r.json()),
        ]);
        WORDS_DATA = wordsData;
        COMMON_WORDS_BY_LENGTH = commonWords;
        wordleDataLoaded = true;
      }

      // Game state variables
      let currentWordIndex = 0;
      let currentGuessIndex = 0;
      let currentLetterIndex = 0;
      let gameGrid = [];
      let gameState = [];
      let allWordsData = [];
      let usedGuesses = new Set();
      let knownLetters = {};
      let isWordComplete = false;
      let isWordFailed = false;
      let isGameComplete = false;
      let cooldownActive = false;
      let cooldownEndTime = 0;
      let cooldownTimer = null;
      let expandedWords = new Set();
      let collapsedWords = new Set();
      let revealedPunctuation = new Set();
      let hasCompletedFirstWord = false;
      let isAnimating = false;
      let punctuationAnimated = false;
      let showMobileKeyboard = false;
      let gameStats = {
        wordsCompleted: 0,
        wordsFailed: 0,
        totalGuesses: 0,
        perfectWords: 0,
        totalScore: 0,
        maxPossibleScore: 0,
      };

      // Mobile keyboard setup
      function setupMobileKeyboard() {
        const keyboard = document.getElementById("mobile-keyboard");
        const keys = keyboard.querySelectorAll(".keyboard-key");

        keys.forEach((key) => {
          key.addEventListener("touchstart", function (e) {
            e.preventDefault();
            this.style.transform = "scale(0.95)";
          });

          key.addEventListener("touchend", function (e) {
            e.preventDefault();
            this.style.transform = "";

            const keyValue = this.dataset.key;
            if (keyValue === "Enter") {
              makeGuess();
            } else if (keyValue === "Backspace") {
              deleteLetter();
            } else {
              addLetter(keyValue);
            }
          });

          key.addEventListener("touchcancel", function (e) {
            e.preventDefault();
            this.style.transform = "";
          });
        });
      }

      function toggleMobileKeyboard(show) {
        const keyboard = document.getElementById("mobile-keyboard");
        if (show && !showMobileKeyboard) {
          keyboard.classList.add("show");
          showMobileKeyboard = true;
          // Adjust body padding to account for keyboard
          document.body.style.paddingBottom = keyboard.offsetHeight + "px";
        } else if (!show && showMobileKeyboard) {
          keyboard.classList.remove("show");
          showMobileKeyboard = false;
          document.body.style.paddingBottom = "";
        }
      }

      // Initialize the game when page loads
      document.addEventListener("DOMContentLoaded", async function () {
        setupMobileKeyboard();
        await loadWordleData();

        // Check if user wants to continue previous game
        const savedGame = localStorage.getItem("wordleGameState");
        if (savedGame) {
          try {
            const savedState = JSON.parse(savedGame);
            if (!savedState.isGameComplete) {
              // Game in progress - show continue popup
              showContinueGamePopup();
            } else {
              // Game was complete - restore completed state and show results
              loadGameProgress();
              setupCurrentWord();
              updateUI();
              // Show the completion popup again
              setTimeout(() => {
                const completionRate = Math.round(
                  (gameStats.wordsCompleted / WORDS_DATA.length) * 100
                );
                const avgGuesses =
                  gameStats.totalGuesses /
                  Math.max(gameStats.wordsCompleted, 1);
                const accuracy = Math.round(
                  (gameStats.wordsCompleted /
                    (gameStats.wordsCompleted + gameStats.wordsFailed)) *
                    100
                );
                showCongratulationsPopup(completionRate, avgGuesses, accuracy);
              }, 100);
            }
          } catch (error) {
            localStorage.removeItem("wordleGameState");
            initGame();
          }
        } else {
          initGame();
        }
      });

      function initGame() {
        if (WORDS_DATA.length === 0) {
          animateInvalidWord(currentGuessIndex);
          return;
        }
        clearGameState();
        setupCurrentWord();
        updateUI();
        // Show mobile keyboard for current word input
        toggleMobileKeyboard(true);
      }

      function clearGameState() {
        currentWordIndex = 0;
        currentGuessIndex = 0;
        gameGrid = [];
        gameState = [];
        allWordsData = [];
        usedGuesses.clear();
        knownLetters = {};
        isWordComplete = false;
        isWordFailed = false;
        isGameComplete = false;
        cooldownActive = false;
        cooldownEndTime = 0;
        punctuationAnimated = false;
        if (cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
        gameStats = {
          wordsCompleted: 0,
          wordsFailed: 0,
          totalGuesses: 0,
          perfectWords: 0,
          totalScore: 0,
          maxPossibleScore: 0,
        };

        for (let i = 0; i < WORDS_DATA.length; i++) {
          allWordsData[i] = {
            gameGrid: [],
            gameState: [],
            usedGuesses: [],
            knownLetters: {},
            isComplete: false,
            isFailed: false,
            guessCount: 0,
            failedAttempts: 0,
          };
          gameStats.maxPossibleScore += WORDS_DATA[i].max_score;
        }
        localStorage.removeItem("wordleGameState");
      }

      function saveCurrentWordState() {
        if (allWordsData[currentWordIndex]) {
          allWordsData[currentWordIndex].gameGrid = JSON.parse(
            JSON.stringify(gameGrid)
          );
          allWordsData[currentWordIndex].gameState = JSON.parse(
            JSON.stringify(gameState)
          );
          allWordsData[currentWordIndex].usedGuesses = Array.from(usedGuesses);
          allWordsData[currentWordIndex].knownLetters = JSON.parse(
            JSON.stringify(knownLetters)
          );
          allWordsData[currentWordIndex].isComplete = isWordComplete;
          allWordsData[currentWordIndex].isFailed = isWordFailed;
          allWordsData[currentWordIndex].guessCount = currentGuessIndex;
          allWordsData[currentWordIndex].currentLetterIndex =
            currentLetterIndex;
        }
      }

      function loadCurrentWordState() {
        const wordData = allWordsData[currentWordIndex];
        if (wordData) {
          gameGrid = JSON.parse(JSON.stringify(wordData.gameGrid));
          gameState = JSON.parse(JSON.stringify(wordData.gameState));
          usedGuesses = new Set(wordData.usedGuesses);
          knownLetters = JSON.parse(JSON.stringify(wordData.knownLetters));
          isWordComplete = wordData.isComplete;
          isWordFailed = wordData.isFailed || false;
          currentGuessIndex = wordData.guessCount;
          currentLetterIndex = wordData.currentLetterIndex || 0;
        }
      }

      function setupCurrentWord() {
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;

        punctuationAnimated = false;

        if (!allWordsData[currentWordIndex]) {
          allWordsData[currentWordIndex] = {
            gameGrid: [],
            gameState: [],
            usedGuesses: [],
            knownLetters: {},
            isComplete: false,
            guessCount: 0,
          };

          for (let i = 0; i < maxGuesses; i++) {
            allWordsData[currentWordIndex].gameGrid[i] = new Array(
              wordLength
            ).fill("");
            allWordsData[currentWordIndex].gameState[i] = new Array(
              wordLength
            ).fill("");
          }
        }

        loadCurrentWordState();

        if (gameGrid.length === 0) {
          gameGrid = [];
          gameState = [];
          for (let i = 0; i < maxGuesses; i++) {
            gameGrid[i] = new Array(wordLength).fill("");
            gameState[i] = new Array(wordLength).fill("");
          }
          currentGuessIndex = 0;
          currentLetterIndex = 0;
          usedGuesses.clear();
          knownLetters = {};
          isWordComplete = false;
        }
        renderGrid();
      }

      function startCooldown(durationSeconds) {
        cooldownActive = true;
        cooldownEndTime = Date.now() + durationSeconds * 1000;

        // Hide mobile keyboard during cooldown
        toggleMobileKeyboard(false);

        renderGrid();
        updateCooldownDisplay();
        cooldownTimer = setInterval(() => {
          updateCooldownDisplay();
          if (Date.now() >= cooldownEndTime) {
            endCooldown();
          }
        }, 1000);
      }

      async function endCooldown() {
        cooldownActive = false;
        cooldownEndTime = 0;
        if (cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }

        await resetCurrentWordForRetry();
        renderGrid();
        updateUI();

        // Show mobile keyboard again after cooldown
        toggleMobileKeyboard(true);
      }

      function updateCooldownDisplay() {
        if (!cooldownActive) return;
        const timeLeft = Math.max(
          0,
          Math.ceil((cooldownEndTime - Date.now()) / 1000)
        );
        if (timeLeft > 0) {
          updateTimerDisplay();
        }
      }

      async function resetCurrentWordForRetry() {
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;

        await animateGridClear();

        currentGuessIndex = 0;
        currentLetterIndex = 0;
        gameGrid = [];
        gameState = [];
        usedGuesses.clear();
        knownLetters = {};
        isWordComplete = false;
        isWordFailed = false;

        for (let i = 0; i < maxGuesses; i++) {
          gameGrid[i] = new Array(wordLength).fill("");
          gameState[i] = new Array(wordLength).fill("");
        }

        if (allWordsData[currentWordIndex]) {
          allWordsData[currentWordIndex].gameGrid = JSON.parse(
            JSON.stringify(gameGrid)
          );
          allWordsData[currentWordIndex].gameState = JSON.parse(
            JSON.stringify(gameState)
          );
          allWordsData[currentWordIndex].usedGuesses = [];
          allWordsData[currentWordIndex].knownLetters = {};
          allWordsData[currentWordIndex].isComplete = false;
          allWordsData[currentWordIndex].isFailed = false;
          allWordsData[currentWordIndex].guessCount = 0;
        }
      }

      function calculateCooldownDuration(failedAttempts) {
        return 10 * 60; // 10 minutes
      }

      function updateTitle() {
        const titleElement = document.querySelector("h1");
        if (hasCompletedFirstWord && titleElement.textContent === "Wordle") {
          titleElement.textContent = "Wordles";
          titleElement.style.transition = "all 0.5s ease";
        }
      }

      function renderCompletedWordsStack() {
        const stackContainer = document.getElementById("completed-words-stack");
        stackContainer.innerHTML = "";

        const endIndex = isWordComplete
          ? currentWordIndex + 1
          : currentWordIndex;
        for (let i = 0; i < endIndex; i++) {
          const wordData = allWordsData[i];
          const wordInfo = WORDS_DATA[i];
          if (wordData && wordData.isComplete) {
            const wordRow = createCompletedWordRow(i, wordData, wordInfo);
            stackContainer.appendChild(wordRow);

            if (collapsedWords.has(i)) {
              const container = document.getElementById(`completed-word-${i}`);
              const gridWrapper = container?.querySelector(
                ".completed-grid-wrapper"
              );
              if (container && gridWrapper) {
                gridWrapper.classList.add("drawer-collapsed");
                container.classList.add("drawer-collapsed");

                const drawerRows = gridWrapper.querySelectorAll(".drawer-row");
                const correctRow = gridWrapper.querySelector(
                  '[data-correct-row="true"]'
                );
                if (correctRow) {
                  const correctRowIndex = parseInt(correctRow.dataset.rowIndex);
                  drawerRows.forEach((row) => {
                    const rowIndex = parseInt(row.dataset.rowIndex);
                    if (rowIndex !== correctRowIndex) {
                      const isAbove = rowIndex < correctRowIndex;
                      const distance =
                        Math.abs(rowIndex - correctRowIndex) *
                        (parseFloat(
                          getComputedStyle(
                            document.documentElement
                          ).getPropertyValue("--tile-size")
                        ) +
                          parseFloat(
                            getComputedStyle(
                              document.documentElement
                            ).getPropertyValue("--tile-gap")
                          ));
                      if (isAbove) {
                        row.style.transform = `translateY(${distance}px)`;
                      } else {
                        row.style.transform = `translateY(-${distance}px)`;
                      }
                    }
                  });
                }
                revealCompletedWordPunctuation(i);
              }
            }
          }
        }
      }

      function createCompletedWordRow(wordIndex, wordData, wordInfo) {
        const wordContainer = document.createElement("div");
        wordContainer.className = "completed-word-container";
        wordContainer.id = `completed-word-${wordIndex}`;

        const hasP = wordInfo.punctuation && wordInfo.punctuation.trim() !== "";
        // Get computed tile size and gap from a temporary element
        const tempTile = document.createElement("div");
        tempTile.style.width = "var(--tile-size)";
        tempTile.style.height = "var(--tile-size)";
        tempTile.style.marginRight = "var(--tile-gap)";
        tempTile.style.visibility = "hidden";
        tempTile.style.position = "absolute";
        document.body.appendChild(tempTile);
        const computedStyle = getComputedStyle(tempTile);
        const tileSize = parseFloat(computedStyle.width);
        const tileGap = parseFloat(computedStyle.marginRight);
        document.body.removeChild(tempTile);

        const containerWidth = hasP
          ? `${wordInfo.length * (tileSize + tileGap) + tileSize}px`
          : `${wordInfo.length * (tileSize + tileGap) - tileGap}px`;
        wordContainer.style.width = containerWidth;

        const gridWrapper = document.createElement("div");
        gridWrapper.className = "completed-grid-wrapper";
        gridWrapper.style.position = "relative";
        gridWrapper.style.display = "flex";
        gridWrapper.style.flexDirection = "column";
        gridWrapper.style.alignItems = "center";
        gridWrapper.style.gap = "var(--tile-gap)";
        gridWrapper.style.overflow = "hidden";
        gridWrapper.style.width = containerWidth;

        const correctRowIndex = wordData.guessCount - 1;
        const maxGuesses = wordInfo.guesses;

        for (let row = 0; row < maxGuesses; row++) {
          const rowWrapper = document.createElement("div");
          rowWrapper.className = "completed-word-grid drawer-row";
          rowWrapper.dataset.rowIndex = row;
          rowWrapper.dataset.correctRow = row === correctRowIndex;
          rowWrapper.style.gridTemplateColumns = `repeat(${wordInfo.length}, var(--tile-size))`;

          if (row === correctRowIndex && wordInfo.punctuation) {
            rowWrapper.style.width = containerWidth;
            rowWrapper.style.position = "relative";
          }

          rowWrapper.style.transition =
            "transform 0.4s ease, height 0.4s ease, margin 0.4s ease";

          if (row === correctRowIndex) {
            rowWrapper.style.cursor = "pointer";
            rowWrapper.onclick = () => toggleWordDrawer(wordIndex);
            rowWrapper.classList.add("correct-row-clickable");
            rowWrapper.style.zIndex = "10";
            rowWrapper.style.position = "relative";
          } else {
            rowWrapper.style.zIndex = "1";
            rowWrapper.style.position = "relative";
          }

          rowWrapper.style.height = "var(--tile-size)";
          rowWrapper.style.visibility = "visible";

          for (let col = 0; col < wordInfo.length; col++) {
            const tile = document.createElement("div");
            tile.className = "completed-tile";

            const letter =
              wordData.gameGrid[row] && wordData.gameGrid[row][col]
                ? wordData.gameGrid[row][col]
                : "";
            const state =
              wordData.gameState[row] && wordData.gameState[row][col]
                ? wordData.gameState[row][col]
                : "";

            tile.textContent = letter;

            if (state) {
              tile.classList.add(state);
            }
            rowWrapper.appendChild(tile);
          }

          if (row === correctRowIndex && wordInfo.punctuation) {
            const punctuationTile = document.createElement("div");
            punctuationTile.className = "punctuation-tile";
            punctuationTile.id = `completed-punctuation-${wordIndex}`;
            punctuationTile.textContent = wordInfo.punctuation;
            punctuationTile.style.position = "absolute";
            punctuationTile.style.left = `${
              wordInfo.length * (tileSize + tileGap)
            }px`;
            punctuationTile.style.top = "50%";
            punctuationTile.style.transform = "translateY(-50%)";
            punctuationTile.style.width = "var(--tile-size)";
            punctuationTile.style.height = "var(--tile-size)";
            punctuationTile.style.display = "flex";
            punctuationTile.style.alignItems = "center";
            punctuationTile.style.justifyContent = "center";
            punctuationTile.style.fontSize = "clamp(1.2rem, 4vw, 1.8rem)";
            punctuationTile.style.fontWeight = "bold";
            punctuationTile.style.color = "var(--color-text)";

            const isAlreadyRevealed = revealedPunctuation.has(wordIndex);
            punctuationTile.style.opacity = isAlreadyRevealed ? "1" : "0";
            punctuationTile.style.visibility = isAlreadyRevealed
              ? "visible"
              : "hidden";
            punctuationTile.style.transition =
              "opacity 0.5s ease, visibility 0.5s ease";
            rowWrapper.appendChild(punctuationTile);
          }

          gridWrapper.appendChild(rowWrapper);
        }

        wordContainer.appendChild(gridWrapper);
        return wordContainer;
      }

      function toggleWordDrawer(wordIndex) {
        const wordContainer = document.getElementById(
          `completed-word-${wordIndex}`
        );
        if (!wordContainer) return;

        const gridWrapper = wordContainer.querySelector(
          ".completed-grid-wrapper"
        );
        const drawerRows = gridWrapper.querySelectorAll(".drawer-row");
        const correctRow = gridWrapper.querySelector(
          '[data-correct-row="true"]'
        );

        if (!correctRow) return;

        const correctRowIndex = parseInt(correctRow.dataset.rowIndex);
        const isCurrentlyCollapsed =
          gridWrapper.classList.contains("drawer-collapsed");

        // Get computed tile size and gap from a temporary element
        const tempTile = document.createElement("div");
        tempTile.style.width = "var(--tile-size)";
        tempTile.style.height = "var(--tile-size)";
        tempTile.style.marginRight = "var(--tile-gap)";
        tempTile.style.visibility = "hidden";
        tempTile.style.position = "absolute";
        document.body.appendChild(tempTile);
        const computedStyle = getComputedStyle(tempTile);
        const tileSize = parseFloat(computedStyle.width);
        const tileGap = parseFloat(computedStyle.marginRight);
        document.body.removeChild(tempTile);
        const distance = tileSize + tileGap;

        if (isCurrentlyCollapsed) {
          gridWrapper.classList.remove("drawer-collapsed");
          wordContainer.classList.remove("drawer-collapsed");
          collapsedWords.delete(wordIndex);

          drawerRows.forEach((row, index) => {
            const rowIndex = parseInt(row.dataset.rowIndex);
            if (rowIndex !== correctRowIndex) {
              setTimeout(() => {
                row.style.transform = "translateY(0)";
              }, 50);
            }
          });

          setTimeout(() => {
            animateAdjacentWordles();
          }, 450);
        } else {
          gridWrapper.classList.add("drawer-collapsed");
          wordContainer.classList.add("drawer-collapsed");
          collapsedWords.add(wordIndex);

          drawerRows.forEach((row, index) => {
            const rowIndex = parseInt(row.dataset.rowIndex);
            if (rowIndex !== correctRowIndex) {
              const isAbove = rowIndex < correctRowIndex;
              const translateDistance =
                Math.abs(rowIndex - correctRowIndex) * distance;
              if (isAbove) {
                row.style.transform = `translateY(${translateDistance}px)`;
              } else {
                row.style.transform = `translateY(-${translateDistance}px)`;
              }

              if (
                rowIndex ===
                Math.max(
                  ...Array.from(drawerRows).map((r) =>
                    parseInt(r.dataset.rowIndex)
                  )
                )
              ) {
                setTimeout(() => {
                  animateAdjacentWordles();
                  revealCompletedWordPunctuation(wordIndex);
                }, 450);
              }
            }
          });
        }
      }

      function animateAdjacentWordles() {
        const stackContainer = document.getElementById("completed-words-stack");
        if (!stackContainer) return;

        const completedWords = Array.from(
          stackContainer.querySelectorAll(".completed-word-container")
        );

        completedWords.forEach((wordContainer) => {
          wordContainer.style.transition = "transform 0.3s ease";
        });

        requestAnimationFrame(() => {
          stackContainer.offsetHeight;
          setTimeout(() => {
            completedWords.forEach((wordContainer) => {
              wordContainer.style.transition = "";
            });
          }, 300);
        });
      }

      function revealCompletedWordPunctuation(wordIndex) {
        const punctuationElement = document.getElementById(
          `completed-punctuation-${wordIndex}`
        );
        if (punctuationElement) {
          setTimeout(() => {
            punctuationElement.style.opacity = "1";
            punctuationElement.style.visibility = "visible";
            punctuationElement.classList.add("revealed");
            revealedPunctuation.add(wordIndex);
          }, 50);
        }
      }

      function renderCurrentWordGrid() {
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;
        const gridContainer = document.getElementById("game-grid");
        gridContainer.innerHTML = "";
        gridContainer.style.gridTemplateColumns = `repeat(${wordLength}, var(--tile-size))`;

        for (let row = 0; row < maxGuesses; row++) {
          for (let col = 0; col < wordLength; col++) {
            const tile = document.createElement("div");
            tile.className = "tile";
            tile.id = `tile-${row}-${col}`;

            const letter = gameGrid[row] ? gameGrid[row][col] : "";
            tile.textContent = letter;
            if (letter) {
              tile.classList.add("filled");
              const state = gameState[row] ? gameState[row][col] : "";
              if (state) {
                tile.classList.add(state);
              }
            }

            if (
              row === currentGuessIndex &&
              col === currentLetterIndex &&
              !isWordComplete &&
              !isWordFailed &&
              !cooldownActive
            ) {
              tile.classList.add("current");
            }
            gridContainer.appendChild(tile);
          }
        }

        renderPunctuation();
      }

      function renderTimer() {
        const timerContainer = document.getElementById("timer-container");

        if (cooldownActive) {
          timerContainer.classList.remove("hidden");
          timerContainer.style.animation =
            "timerFadeInSlideUp 0.5s ease forwards";
          updateTimerDisplay();
        } else {
          timerContainer.classList.add("hidden");
          timerContainer.style.animation = "";
        }
      }

      function updateTimerDisplay() {
        if (!cooldownActive) return;

        const timeLeft = Math.max(
          0,
          Math.floor((cooldownEndTime - Date.now()) / 1000)
        );

        if (timeLeft <= 0) {
          const timerContainer = document.getElementById("timer-container");
          timerContainer.style.animation =
            "timerFadeOutSlideDown 0.5s ease forwards";
          return;
        }

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        updateTimerDigit("timer-m1", Math.floor(minutes / 10).toString());
        updateTimerDigit("timer-m2", (minutes % 10).toString());
        updateTimerDigit("timer-s1", Math.floor(seconds / 10).toString());
        updateTimerDigit("timer-s2", (seconds % 10).toString());
      }

      function updateTimerDigit(digitId, newDigit) {
        const digit = document.getElementById(digitId);
        if (!digit) return;

        const currentDigit = digit.textContent;
        if (currentDigit !== newDigit) {
          digit.style.willChange = "transform";
          digit.classList.add("flipping");

          setTimeout(() => {
            digit.textContent = newDigit;
          }, 200);

          setTimeout(() => {
            digit.classList.remove("flipping");
            digit.style.willChange = "auto";
          }, 400);
        }
      }

      function renderPunctuation() {
        const punctuationOverlay = document.getElementById(
          "punctuation-overlay"
        );
        if (punctuationAnimated) {
          return;
        }

        if (currentWordIndex >= WORDS_DATA.length) {
          return;
        }

        if (!punctuationAnimated) {
          punctuationOverlay.innerHTML = "";
        }
      }

      function renderGrid() {
        renderCompletedWordsStack();
        renderCurrentWordGrid();
        renderTimer();
        updateTitle();
      }

      function addLetter(letter) {
        const currentWord = WORDS_DATA[currentWordIndex];
        if (isWordComplete || isWordFailed || cooldownActive || isAnimating) {
          return;
        }
        if (currentLetterIndex < currentWord.length) {
          gameGrid[currentGuessIndex][currentLetterIndex] = letter;
          currentLetterIndex++;
          renderGrid();
        }
      }

      function deleteLetter() {
        if (isWordComplete || isWordFailed || cooldownActive || isAnimating) {
          return;
        }
        if (currentLetterIndex > 0) {
          currentLetterIndex--;
          gameGrid[currentGuessIndex][currentLetterIndex] = "";
          renderGrid();
        }
      }

      async function makeGuess() {
        const currentWord = WORDS_DATA[currentWordIndex];

        if (isAnimating || cooldownActive) {
          updateCooldownDisplay();
          return;
        }

        const guess = gameGrid[currentGuessIndex].join("");

        if (guess.length !== currentWord.length) {
          showToast("Not enough letters");
          animateInvalidWord(currentGuessIndex);
          return;
        }

        if (currentGuessIndex >= currentWord.guesses) {
          return;
        }

        if (isWordComplete || isWordFailed) {
          return;
        }

        if (usedGuesses.has(guess)) {
          showToast("Already guessed");
          animateInvalidWord(currentGuessIndex);
          return;
        }

        const constraintError = validateGreenConstraints(guess);
        if (constraintError) {
          showToast(constraintError);
          animateInvalidWord(currentGuessIndex);
          return;
        }

        const isValidWord = await validateGuessWithFallback(guess);
        if (!isValidWord) {
          showToast("Word not in list");
          animateInvalidWord(currentGuessIndex);
          return;
        }

        usedGuesses.add(guess);

        const results = checkWord(guess, currentGuessIndex);
        await animateFlipTiles(currentGuessIndex, results);
        currentGuessIndex++;
        currentLetterIndex = 0;

        if (guess === currentWord.word) {
          isWordComplete = true;

          if (currentWordIndex === 0 && !hasCompletedFirstWord) {
            animateTitleChange();
          }

          const guessesLeft = currentWord.guesses - currentGuessIndex;
          const wordScore = Math.round(
            (currentWord.max_score * (guessesLeft + 1)) / currentWord.guesses
          );
          gameStats.totalScore += wordScore;

          gameStats.wordsCompleted++;
          gameStats.totalGuesses += currentGuessIndex;
          if (currentGuessIndex === 1) gameStats.perfectWords++;

          await animateGridTransition();

          setTimeout(() => {
            if (currentWordIndex < WORDS_DATA.length - 1) {
              nextWord();
            } else {
              handleLastWordCompletion();
            }
          }, 500);
        } else if (currentGuessIndex >= currentWord.guesses) {
          gameStats.wordsFailed++;

          if (!allWordsData[currentWordIndex].failedAttempts) {
            allWordsData[currentWordIndex].failedAttempts = 0;
          }
          allWordsData[currentWordIndex].failedAttempts++;

          const failedAttempts = allWordsData[currentWordIndex].failedAttempts;
          const cooldownDuration = calculateCooldownDuration(failedAttempts);

          startCooldown(cooldownDuration);
        }
        renderGrid();
        saveCurrentWordState();
        saveGameProgress();
      }

      function validateGreenConstraints(guess) {
        // Check if guess respects known correct letter positions
        for (let pos in knownLetters) {
          if (guess[pos] !== knownLetters[pos]) {
            const position = parseInt(pos) + 1; // Convert to 1-based position
            const ordinal = getOrdinal(position);
            return `${ordinal} letter must be ${knownLetters[pos]}`;
          }
        }
        return null; // No constraint violations
      }

      function getOrdinal(num) {
        const lastDigit = num % 10;
        const lastTwoDigits = num % 100;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
          return num + "th";
        }

        switch (lastDigit) {
          case 1:
            return num + "st";
          case 2:
            return num + "nd";
          case 3:
            return num + "rd";
          default:
            return num + "th";
        }
      }

      async function validateGuessWithFallback(word) {
        // Comprehensive word lists organized by length for faster validation
        // Check if the word exists in the appropriate length list
        const wordsByLength = COMMON_WORDS_BY_LENGTH[word.length];
        if (wordsByLength && wordsByLength.includes(word.toUpperCase())) {
          return true;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              return true;
            }
          } else if (response.status === 404) {
            return false;
          }
        } catch (error) {}

        if (word.length < 2 || !/^[A-Z]+$/.test(word)) {
          return false;
        }

        return true;
      }

      function checkWord(guess, rowIndex) {
        const currentWord = WORDS_DATA[currentWordIndex];
        const targetWord = currentWord.word;
        const targetLetters = targetWord.split("");
        const guessLetters = guess.split("");

        const result = new Array(targetWord.length);
        const targetLetterCounts = {};

        for (let letter of targetLetters) {
          targetLetterCounts[letter] = (targetLetterCounts[letter] || 0) + 1;
        }

        for (let i = 0; i < guessLetters.length; i++) {
          if (guessLetters[i] === targetLetters[i]) {
            result[i] = "correct";
            targetLetterCounts[guessLetters[i]]--;
            knownLetters[i] = guessLetters[i];
          }
        }

        for (let i = 0; i < guessLetters.length; i++) {
          if (result[i] === "correct") {
            continue;
          }
          const letter = guessLetters[i];
          if (targetLetterCounts[letter] > 0) {
            result[i] = "present";
            targetLetterCounts[letter]--;
          } else {
            result[i] = "absent";
          }
        }

        for (let i = 0; i < result.length; i++) {
          const tile = document.getElementById(`tile-${rowIndex}-${i}`);
          const state = result[i];
          tile.classList.remove("correct", "present", "absent");
          tile.classList.add(state);
          gameState[rowIndex][i] = state;
        }

        return result;
      }

      function handleLastWordCompletion() {
        const lastWordIndex = currentWordIndex;
        saveCurrentWordState();
        punctuationAnimated = false;

        const punctuationOverlay = document.getElementById(
          "punctuation-overlay"
        );
        if (punctuationOverlay) {
          punctuationOverlay.innerHTML = "";
        }

        currentWordIndex++;

        const currentWordContainer = document.getElementById(
          "current-word-container"
        );
        if (currentWordContainer) {
          currentWordContainer.style.display = "none";
        }

        // Hide mobile keyboard
        toggleMobileKeyboard(false);

        renderCompletedWordsStack();
        updateUI();

        setTimeout(() => {
          const completedWordContainer = document.getElementById(
            `completed-word-${lastWordIndex}`
          );
          if (completedWordContainer) {
            const gridWrapper = completedWordContainer.querySelector(
              ".completed-grid-wrapper"
            );
            if (
              gridWrapper &&
              !gridWrapper.classList.contains("drawer-collapsed")
            ) {
              toggleWordDrawer(lastWordIndex);
              setTimeout(() => {
                revealCompletedWordPunctuation(lastWordIndex);
              }, 450);
            }
          }
        }, 200);

        setTimeout(() => {
          showGameComplete();
        }, 700);
      }

      function nextWord() {
        if (currentWordIndex < WORDS_DATA.length - 1) {
          saveCurrentWordState();
          const previousWordIndex = currentWordIndex;

          punctuationAnimated = false;
          const punctuationOverlay = document.getElementById(
            "punctuation-overlay"
          );
          if (punctuationOverlay) {
            punctuationOverlay.innerHTML = "";
          }

          currentWordIndex++;
          setupCurrentWord();
          updateUI();
          saveGameProgress();

          setTimeout(() => {
            const completedWordContainer = document.getElementById(
              `completed-word-${previousWordIndex}`
            );
            if (completedWordContainer) {
              const gridWrapper = completedWordContainer.querySelector(
                ".completed-grid-wrapper"
              );
              if (
                gridWrapper &&
                !gridWrapper.classList.contains("drawer-collapsed")
              ) {
                toggleWordDrawer(previousWordIndex);
                setTimeout(() => {
                  revealCompletedWordPunctuation(previousWordIndex);
                }, 450);
              }
            }
          }, 200);

          const currentWordContainer = document.getElementById(
            "current-word-container"
          );
          if (currentWordContainer) {
            currentWordContainer.classList.add("fade-in");
            setTimeout(() => {
              currentWordContainer.classList.remove("fade-in");
            }, 500);
          }
        }
      }

      function updateUI() {}

      function showGameComplete() {
        isGameComplete = true;

        if (cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
        cooldownActive = false;

        const completionRate = Math.round(
          (gameStats.wordsCompleted / WORDS_DATA.length) * 100
        );
        const avgGuesses =
          gameStats.totalGuesses / Math.max(gameStats.wordsCompleted, 1);
        const accuracy = Math.round(
          (gameStats.wordsCompleted /
            (gameStats.wordsCompleted + gameStats.wordsFailed)) *
            100
        );

        // Start shaking the 's' and make it clickable
        startTitleShaking();

        localStorage.setItem("wordle_completed", "true");
        showCongratulationsPopup(completionRate, avgGuesses, accuracy);
        // Save the completed game state so it persists on refresh
        saveGameProgress();
      }

      function startTitleShaking() {
        const titleS = document.getElementById("title-s");
        if (titleS && hasCompletedFirstWord) {
          titleS.classList.add("shaking");

          // Add click/tap event listener for navigation
          const handleNavigation = function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Add a brief color change feedback
            titleS.style.color = "var(--color-correct)";
            setTimeout(() => {
              titleS.style.color = "";
              if (NEXT_PUZZLES_ENABLED) {
                window.location.href = "number_bee.html";
              } else {
                showEarlyAccessPopup();
              }
            }, 150);
          };

          // Remove any existing listeners first
          titleS.removeEventListener("click", handleNavigation);
          titleS.removeEventListener("touchend", handleNavigation);

          // Add both click and touch events for cross-platform compatibility
          titleS.addEventListener("click", handleNavigation);
          titleS.addEventListener("touchend", handleNavigation);
        }
      }

      function saveGameProgress() {
        saveCurrentWordState();
        const gameProgressState = {
          currentWordIndex,
          currentGuessIndex,
          gameGrid,
          gameState,
          allWordsData,
          gameStats,
          usedGuesses: Array.from(usedGuesses),
          knownLetters,
          isWordComplete,
          isWordFailed,
          isGameComplete,
          cooldownActive,
          cooldownEndTime,
          expandedWords: Array.from(expandedWords),
          collapsedWords: Array.from(collapsedWords),
          revealedPunctuation: Array.from(revealedPunctuation),
          hasCompletedFirstWord,
          timestamp: Date.now(),
        };
        localStorage.setItem(
          "wordleGameState",
          JSON.stringify(gameProgressState)
        );
      }

      function loadGameProgress() {
        const saved = localStorage.getItem("wordleGameState");
        if (saved) {
          try {
            const savedState = JSON.parse(saved);
            if (Date.now() - savedState.timestamp < 24 * 60 * 60 * 1000) {
              currentWordIndex = savedState.currentWordIndex || 0;
              currentGuessIndex = savedState.currentGuessIndex || 0;
              gameGrid = savedState.gameGrid || [];
              gameState = savedState.gameState || [];
              allWordsData = savedState.allWordsData || [];
              gameStats = savedState.gameStats || gameStats;
              usedGuesses = new Set(savedState.usedGuesses || []);
              knownLetters = savedState.knownLetters || {};
              isWordComplete = savedState.isWordComplete || false;
              isWordFailed = savedState.isWordFailed || false;
              isGameComplete = savedState.isGameComplete || false;
              cooldownActive = savedState.cooldownActive || false;
              cooldownEndTime = savedState.cooldownEndTime || 0;
              expandedWords = new Set(savedState.expandedWords || []);
              collapsedWords = new Set(savedState.collapsedWords || []);
              revealedPunctuation = new Set(
                savedState.revealedPunctuation || []
              );
              hasCompletedFirstWord = savedState.hasCompletedFirstWord || false;

              // Apply visual state for title "s" if first word was completed
              if (hasCompletedFirstWord) {
                const titleS = document.getElementById("title-s");
                if (titleS) {
                  titleS.classList.add("show");
                }
              }

              if (allWordsData.length === 0) {
                for (let i = 0; i < WORDS_DATA.length; i++) {
                  allWordsData[i] = {
                    gameGrid: [],
                    gameState: [],
                    usedGuesses: [],
                    knownLetters: {},
                    isComplete: false,
                    guessCount: 0,
                  };
                }
              }

              if (cooldownActive && cooldownEndTime > Date.now()) {
                renderGrid();
                updateCooldownDisplay();
                cooldownTimer = setInterval(() => {
                  updateCooldownDisplay();
                  if (Date.now() >= cooldownEndTime) {
                    endCooldown();
                  }
                }, 1000);
              } else if (cooldownActive) {
                endCooldown();
              }
            } else {
              localStorage.removeItem("wordleGameState");
            }
          } catch (error) {
            console.error("Error loading game progress:", error);
            localStorage.removeItem("wordleGameState");
          }
        }
      }

      // Physical keyboard handling
      document.addEventListener("keydown", function (event) {
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        if (isWordComplete || isWordFailed || cooldownActive) {
          return;
        }

        const isLetter = /^[a-zA-Z]$/.test(event.key);

        if (event.key === "Enter") {
          event.preventDefault();
          makeGuess();
        } else if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          deleteLetter();
        } else if (isLetter) {
          event.preventDefault();
          addLetter(event.key.toUpperCase());
        }
      });

      function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      async function animateFlipTiles(rowIndex, results) {
        if (!results || !Array.isArray(results)) {
          console.error("Invalid results passed to animateFlipTiles:", results);
          isAnimating = false;
          return;
        }
        isAnimating = true;
        const currentWord = WORDS_DATA[currentWordIndex];

        const rootStyles = getComputedStyle(document.documentElement);
        const flipDurationStr = rootStyles
          .getPropertyValue("--animation-flip-duration")
          .trim();
        const flipDelayStr = rootStyles
          .getPropertyValue("--animation-flip-delay")
          .trim();

        const flipDuration =
          parseFloat(flipDurationStr) *
          (flipDurationStr.includes("ms") ? 1 : 1000);
        const flipDelay =
          parseFloat(flipDelayStr) * (flipDelayStr.includes("ms") ? 1 : 1000);
        const halfFlip = flipDuration / 2;

        const tilesToFlip = [];
        for (let i = 0; i < currentWord.length; i++) {
          const tile = document.getElementById(`tile-${rowIndex}-${i}`);
          if (tile) {
            tilesToFlip.push({ tile: tile, index: i, state: results[i] });
          }
        }

        tilesToFlip.forEach((tileData) => {
          const tile = tileData.tile;
          tile.classList.remove("flipping", "correct", "present", "absent");
        });

        await new Promise((resolve) => setTimeout(resolve, 30));

        const animationPromises = tilesToFlip.map((tileData) => {
          const tile = tileData.tile;
          const index = tileData.index;
          const state = tileData.state;
          return new Promise((resolve) => {
            setTimeout(() => {
              requestAnimationFrame(() => {
                tile.style.willChange = "transform";
                tile.classList.add("flipping");

                setTimeout(() => {
                  tile.classList.add(state);
                  gameState[rowIndex][index] = state;
                }, flipDuration / 2);

                setTimeout(() => {
                  tile.classList.remove("flipping");
                  tile.style.willChange = "auto";
                  resolve();
                }, flipDuration);
              });
            }, index * flipDelay);
          });
        });

        await Promise.all(animationPromises);
        isAnimating = false;
      }

      function animateInvalidWord(rowIndex) {
        if (
          currentWordIndex >= WORDS_DATA.length ||
          !WORDS_DATA[currentWordIndex]
        ) {
          return;
        }
        const currentWord = WORDS_DATA[currentWordIndex];
        for (let i = 0; i < currentWord.length; i++) {
          const tile = document.getElementById(`tile-${rowIndex}-${i}`);
          if (tile) tile.classList.add("shake");
        }
        setTimeout(() => {
          for (let i = 0; i < currentWord.length; i++) {
            const tile = document.getElementById(`tile-${rowIndex}-${i}`);
            if (tile) tile.classList.remove("shake");
          }
        }, 500);
      }

      function animateTitleChange() {
        if (!hasCompletedFirstWord) {
          hasCompletedFirstWord = true;
          const titleS = document.getElementById("title-s");
          if (titleS) {
            setTimeout(() => titleS.classList.add("show"), 500);
          } else {
            console.error('Element with id "title-s" not found');
          }
        }
      }

      async function animateGridTransition() {
        isAnimating = true;
        isAnimating = false;
      }

      async function animateGridClear() {
        isAnimating = true;
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;

        const tilesToClear = [];
        for (let row = 0; row < maxGuesses; row++) {
          for (let col = 0; col < wordLength; col++) {
            const tile = document.getElementById(`tile-${row}-${col}`);
            if (tile && tile.textContent.trim() !== "") {
              tilesToClear.push(tile);
            }
          }
        }

        if (tilesToClear.length === 0) {
          isAnimating = false;
          return;
        }

        const rootStyles = getComputedStyle(document.documentElement);
        const flipDurationStr = rootStyles
          .getPropertyValue("--animation-flip-duration")
          .trim();
        const flipDuration =
          parseFloat(flipDurationStr) *
          (flipDurationStr.includes("ms") ? 1 : 1000);

        const flipDelayStr = rootStyles
          .getPropertyValue("--animation-flip-delay")
          .trim();
        const flipDelay =
          parseFloat(flipDelayStr) * (flipDelayStr.includes("ms") ? 1 : 1000);

        const clearPromises = [];
        for (let row = 0; row < maxGuesses; row++) {
          for (let col = 0; col < wordLength; col++) {
            const tile = document.getElementById(`tile-${row}-${col}`);
            if (tile && tile.textContent.trim() !== "") {
              const staggerIndex = row * wordLength + col;
              const delay = staggerIndex * flipDelay;

              const promise = new Promise((resolve) => {
                setTimeout(() => {
                  tile.style.willChange = "transform";
                  tile.classList.add("flipping");

                  setTimeout(() => {
                    tile.textContent = "";
                    tile.classList.remove(
                      "correct",
                      "present",
                      "absent",
                      "filled"
                    );
                  }, flipDuration / 2);

                  setTimeout(() => {
                    tile.classList.remove("flipping");
                    tile.style.willChange = "auto";
                    resolve();
                  }, flipDuration);
                }, delay);
              });

              clearPromises.push(promise);
            }
          }
        }

        await Promise.all(clearPromises);
        isAnimating = false;
      }

      function cleanupAnimations() {
        const allTiles = document.querySelectorAll(".tile, .completed-tile");
        allTiles.forEach((tile) => {
          tile.style.willChange = "auto";
          tile.style.animation = "";
          tile.style.animationDelay = "";
        });

        const containers = document.querySelectorAll(
          ".current-word-container, .completed-words-stack"
        );
        containers.forEach((container) => {
          container.style.willChange = "auto";
        });

        isAnimating = false;
      }

      function cleanupAllAnimationStyles() {
        const allTiles = document.querySelectorAll(".tile, .completed-tile");
        allTiles.forEach((tile) => {
          tile.style.willChange = "auto";
          tile.style.animation = "";
          tile.style.animationDelay = "";
          tile.style.zIndex = "";
          tile.style.transform = "";
          tile.style.opacity = "";
          tile.style.transition = "";
        });

        const containers = document.querySelectorAll(
          ".current-word-container, .completed-words-stack, .word-attempts"
        );
        containers.forEach((container) => {
          container.style.willChange = "auto";
          container.style.transform = "";
          container.style.opacity = "";
        });
      }

      window.addEventListener("beforeunload", cleanupAnimations);

      function showContinueGamePopup() {
        const popup = document.getElementById("continue-game-popup");
        popup.classList.remove("hidden");

        document.getElementById("continue-game-btn").onclick = function () {
          popup.classList.add("hidden");
          loadGameProgress();
          setupCurrentWord();
          updateUI();
          toggleMobileKeyboard(true);
        };

        document.getElementById("new-game-btn").onclick = function () {
          popup.classList.add("hidden");
          localStorage.removeItem("wordleGameState");
          initGame();
        };
      }

      function showCongratulationsPopup(completionRate, avgGuesses, accuracy) {
        const popup = document.getElementById("congratulations-popup");
        const messageEl = document.getElementById("congratulations-message");
        const statsEl = document.getElementById("stats-display");
        const starRatingEl = document.getElementById("star-rating");
        const ratingTextEl = document.getElementById("rating-text");

        const scorePercentage =
          (gameStats.totalScore / gameStats.maxPossibleScore) * 100;
        let stars = 0;
        let ratingText = "";

        if (scorePercentage >= 85) {
          stars = 3;
          ratingText = "Exceptional Performance!";
        } else if (scorePercentage >= 65) {
          stars = 2;
          ratingText = "Great Performance!";
        } else if (scorePercentage >= 40) {
          stars = 1;
          ratingText = "Good Effort!";
        } else {
          stars = 0;
          ratingText = "Keep Practicing!";
        }

        const starElements = starRatingEl.querySelectorAll(".star");
        starElements.forEach((star, index) => {
          if (index < stars) {
            star.classList.add("filled");
          } else {
            star.classList.remove("filled");
          }
        });

        ratingTextEl.textContent = ratingText;

        let message = "";
        if (accuracy === 100) {
          if (gameStats.perfectWords === WORDS_DATA.length) {
            message = "Perfect game! You solved every word on the first try!";
          } else if (avgGuesses <= 2) {
            message = "Holy shit! You got so many of them right! Suspicous...";
          } else {
            message = "You got 'em all! Amaaazing!";
          }
        } else if (accuracy >= 80) {
          message = "Great job! You're a rising wordle-er!";
        } else if (accuracy >= 60) {
          message = "Nicee! You solved the words! (Most of them)";
        } else {
          message = "Maybe you would like to play again!";
        }

        const statsHTML = `
          <strong>Game Statistics</strong>
          <div class="stats-grid">
            <div class="stats-label">Words Completed:</div>
            <div class="stats-value">${gameStats.wordsCompleted}/${
          WORDS_DATA.length
        }</div>
            <div class="stats-label">Accuracy:</div>
            <div class="stats-value">${accuracy}%</div>
            <div class="stats-label">Average Guesses:</div>
            <div class="stats-value">${avgGuesses.toFixed(1)}</div>
            <div class="stats-label">Score:</div>
            <div class="stats-value">${gameStats.totalScore}/${
          gameStats.maxPossibleScore
        }</div>
            <div class="stats-label">Perfect Words:</div>
            <div class="stats-value">${gameStats.perfectWords}</div>
          </div>
        `;

        messageEl.innerHTML = message;
        statsEl.innerHTML = statsHTML;

        popup.classList.remove("hidden");

        document.getElementById("play-again-btn").onclick = function () {
          popup.classList.add("hidden");
          // Clear saved game state when explicitly choosing to play again
          localStorage.removeItem("wordleGameState");
          location.reload();
        };

        document.getElementById("close-popup-btn").onclick = function () {
          popup.classList.add("hidden");
        };

        popup.onclick = function (e) {
          if (e.target === popup) {
            popup.classList.add("hidden");
          }
        };
      }

      function showToast(message) {
        const toast = document.getElementById("toast");
        toast.textContent = message;
        toast.classList.add("show");

        setTimeout(() => {
          toast.classList.remove("show");
        }, 2000);
      }

      // Show early access popup
      function showEarlyAccessPopup() {
        const popup = document.getElementById("early-access-popup");
        popup.classList.add("show");
      }

      // Close early access popup
      function closeEarlyAccessPopup() {
        const popup = document.getElementById("early-access-popup");
        popup.classList.remove("show");
      }
