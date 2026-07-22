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
      // Dictionary API URLs with fallbacks
      const DICTIONARY_APIS = [
        "https://api.dictionaryapi.dev/api/v2/entries/en/",
        "https://dictionaryapi.com/api/v3/references/collegiate/json/",
      ];
      // Flag to control next puzzle access
      const NEXT_PUZZLES_ENABLED = false; // Set to true to enable all next puzzles

      // Game state variables
      let currentWordIndex = 0;
      let currentGuessIndex = 0;
      let currentLetterIndex = 0; // Track current typing position within the row
      let gameGrid = [];
      let gameState = []; // Track tile states (correct, present, absent)
      let allWordsData = []; // Store game state for all words
      let usedGuesses = new Set(); // Track guesses used for current word
      let knownLetters = {}; // Track confirmed letter positions
      let isWordComplete = false;
      let isWordFailed = false; // Track if word failed (exceeded guesses)
      let isGameComplete = false;
      let cooldownActive = false;
      let cooldownEndTime = 0;
      let cooldownTimer = null;
      let expandedWords = new Set(); // Track which completed words show attempts
      let collapsedWords = new Set(); // Track which completed words are collapsed
      let revealedPunctuation = new Set(); // Track which words have had their punctuation revealed
      let hasCompletedFirstWord = false; // Track title change
      let isAnimating = false;
      let punctuationAnimated = false; // Track if punctuation has been animated for current word
      let gameStats = {
        wordsCompleted: 0,
        wordsFailed: 0,
        totalGuesses: 0,
        perfectWords: 0,
        totalScore: 0,
        maxPossibleScore: 0,
      };
      // Initialize the game when page loads
      document.addEventListener("DOMContentLoaded", async function () {
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
        // Clear all game state for fresh start
        clearGameState();
        setupCurrentWord();
        updateUI();
      }
      function clearGameState() {
        // Reset all game variables to initial state
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
        // Initialize allWordsData with empty state for each word
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
          // Calculate max possible score for this word
          gameStats.maxPossibleScore += WORDS_DATA[i].max_score;
        }
        // Clear localStorage
        localStorage.removeItem("wordleGameState");
      }
      function saveCurrentWordState() {
        // Save current word state to allWordsData
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
        // Load state for current word from allWordsData
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
        // Reset punctuation animation flag for new word
        punctuationAnimated = false;
        // Initialize empty state if this word hasn't been set up yet
        if (!allWordsData[currentWordIndex]) {
          allWordsData[currentWordIndex] = {
            gameGrid: [],
            gameState: [],
            usedGuesses: [],
            knownLetters: {},
            isComplete: false,
            guessCount: 0,
          };
          // Initialize empty grid
          for (let i = 0; i < maxGuesses; i++) {
            allWordsData[currentWordIndex].gameGrid[i] = new Array(
              wordLength
            ).fill("");
            allWordsData[currentWordIndex].gameState[i] = new Array(
              wordLength
            ).fill("");
          }
        }
        // Load state for current word
        loadCurrentWordState();
        // If gameGrid is empty, initialize it
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

        // Re-render grid to show timer tiles
        renderGrid();

        // Update cooldown timer
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
        // Reset word for retry now that cooldown has ended
        await resetCurrentWordForRetry();
        // Update the grid display
        renderGrid();
        updateUI();
        const currentWord = WORDS_DATA[currentWordIndex];
        const failedAttempts =
          allWordsData[currentWordIndex].failedAttempts || 0;
      }
      function updateCooldownDisplay() {
        if (!cooldownActive) return;
        const timeLeft = Math.max(
          0,
          Math.ceil((cooldownEndTime - Date.now()) / 1000)
        );
        if (timeLeft > 0) {
          const hours = Math.floor(timeLeft / 3600);
          const minutes = Math.floor((timeLeft % 3600) / 60);
          const seconds = timeLeft % 60;
          let timeDisplay = "";
          if (hours > 0) {
            timeDisplay = `${hours}h ${minutes}m ${seconds}s`;
          } else if (minutes > 0) {
            timeDisplay = `${minutes}m ${seconds}s`;
          } else {
            timeDisplay = `${seconds}s`;
          }
          // Update timer tiles during cooldown
          updateTimerDisplay();
        }
      }
      async function resetCurrentWordForRetry() {
        // Reset the current word state to allow retry after cooldown
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;

        // First, animate all filled tiles flipping and clearing
        await animateGridClear();

        // Clear current attempt data but keep failure count
        currentGuessIndex = 0;
        currentLetterIndex = 0;
        gameGrid = [];
        gameState = [];
        usedGuesses.clear();
        knownLetters = {};
        isWordComplete = false;
        isWordFailed = false;
        // Reinitialize grid
        for (let i = 0; i < maxGuesses; i++) {
          gameGrid[i] = new Array(wordLength).fill("");
          gameState[i] = new Array(wordLength).fill("");
        }
        // Update stored data (but keep failedAttempts count)
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
          // Keep failedAttempts count for progressive tracking
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
        // Render all completed words in order (including current word if it's complete)
        const endIndex = isWordComplete
          ? currentWordIndex + 1
          : currentWordIndex;
        for (let i = 0; i < endIndex; i++) {
          const wordData = allWordsData[i];
          const wordInfo = WORDS_DATA[i];
          if (wordData && wordData.isComplete) {
            const wordRow = createCompletedWordRow(i, wordData, wordInfo);
            stackContainer.appendChild(wordRow);
            // Restore collapsed state if this word is in the collapsed set
            if (collapsedWords.has(i)) {
              const container = document.getElementById(`completed-word-${i}`);
              const gridWrapper = container?.querySelector(
                ".completed-grid-wrapper"
              );
              if (container && gridWrapper) {
                gridWrapper.classList.add("drawer-collapsed");
                container.classList.add("drawer-collapsed");
                // Apply transforms to maintain collapsed appearance
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
                        Math.abs(rowIndex - correctRowIndex) * 67;
                      if (isAbove) {
                        row.style.transform = `translateY(${distance}px)`;
                      } else {
                        row.style.transform = `translateY(-${distance}px)`;
                      }
                    }
                  });
                }
                // Reveal punctuation for already collapsed words
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
        // Set container width to accommodate punctuation
        const hasP = wordInfo.punctuation && wordInfo.punctuation.trim() !== "";
        const containerWidth = hasP
          ? `${wordInfo.length * 67 + 67}px`
          : `${wordInfo.length * 67}px`;
        wordContainer.style.width = containerWidth;
        // Create a complete grid showing all rows (used and unused)
        const gridWrapper = document.createElement("div");
        gridWrapper.className = "completed-grid-wrapper";
        gridWrapper.style.position = "relative";
        gridWrapper.style.display = "flex";
        gridWrapper.style.flexDirection = "column";
        gridWrapper.style.alignItems = "center";
        gridWrapper.style.gap = "5px";
        gridWrapper.style.overflow = "hidden";
        gridWrapper.style.width = containerWidth;
        const correctRowIndex = wordData.guessCount - 1; // The row where the correct guess was made
        const maxGuesses = wordInfo.guesses;
        // Show all rows including empty ones
        for (let row = 0; row < maxGuesses; row++) {
          const rowWrapper = document.createElement("div");
          rowWrapper.className = "completed-word-grid drawer-row";
          rowWrapper.dataset.rowIndex = row;
          rowWrapper.dataset.correctRow = row === correctRowIndex;
          rowWrapper.style.gridTemplateColumns = `repeat(${wordInfo.length}, 62px)`;
          // Add extra width for punctuation if this is the correct row
          if (row === correctRowIndex && wordInfo.punctuation) {
            rowWrapper.style.width = `${wordInfo.length * 67 + 67}px`; // Extra space for punctuation
            rowWrapper.style.position = "relative";
          }
          rowWrapper.style.transition =
            "transform 0.4s ease, height 0.4s ease, margin 0.4s ease";
          // Mark correct row as clickable and set z-index
          if (row === correctRowIndex) {
            rowWrapper.style.cursor = "pointer";
            rowWrapper.onclick = () => toggleWordDrawer(wordIndex);
            rowWrapper.classList.add("correct-row-clickable");
            rowWrapper.style.zIndex = "10"; // Keep correct row on top
            rowWrapper.style.position = "relative";
          } else {
            rowWrapper.style.zIndex = "1"; // Other rows go underneath
            rowWrapper.style.position = "relative";
          }
          // Set initial values to ensure animations work from first click
          rowWrapper.style.height = "62px";
          rowWrapper.style.visibility = "visible";
          // Add tiles for this row
          for (let col = 0; col < wordInfo.length; col++) {
            const tile = document.createElement("div");
            tile.className = "completed-tile";
            // Get letter and state from saved data
            const letter =
              wordData.gameGrid[row] && wordData.gameGrid[row][col]
                ? wordData.gameGrid[row][col]
                : "";
            const state =
              wordData.gameState[row] && wordData.gameState[row][col]
                ? wordData.gameState[row][col]
                : "";
            tile.textContent = letter;
            // Apply color state if available
            if (state) {
              tile.classList.add(state);
            }
            rowWrapper.appendChild(tile);
          }

          // Add punctuation positioned absolutely within the row if this is the correct row
          if (row === correctRowIndex && wordInfo.punctuation) {
            const punctuationTile = document.createElement("div");
            punctuationTile.className = "punctuation-tile";
            punctuationTile.id = `completed-punctuation-${wordIndex}`;
            punctuationTile.textContent = wordInfo.punctuation;
            punctuationTile.style.position = "absolute";
            punctuationTile.style.left = `${wordInfo.length * 67 + 26}px`;
            punctuationTile.style.top = "50%";
            punctuationTile.style.transform = "translateY(-50%)";
            punctuationTile.style.width = "62px";
            punctuationTile.style.height = "62px";
            punctuationTile.style.display = "flex";
            punctuationTile.style.alignItems = "center";
            punctuationTile.style.justifyContent = "center";
            punctuationTile.style.fontSize = "2rem";
            punctuationTile.style.fontWeight = "bold";
            punctuationTile.style.color = "var(--color-text)";
            // Check if punctuation has already been revealed for this word
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
        if (isCurrentlyCollapsed) {
          // Expand: show all rows with sliding animation
          gridWrapper.classList.remove("drawer-collapsed");
          wordContainer.classList.remove("drawer-collapsed");
          collapsedWords.delete(wordIndex); // Remove from collapsed set
          drawerRows.forEach((row, index) => {
            const rowIndex = parseInt(row.dataset.rowIndex);
            if (rowIndex !== correctRowIndex) {
              // Animate the slide back to original position
              setTimeout(() => {
                row.style.transform = "translateY(0)";
              }, 50);
            }
          });
          // Animate adjacent wordles after expansion completes
          setTimeout(() => {
            animateAdjacentWordles();
          }, 450);
        } else {
          // Collapse: hide all rows except correct one by sliding them toward the correct row
          gridWrapper.classList.add("drawer-collapsed");
          wordContainer.classList.add("drawer-collapsed");
          collapsedWords.add(wordIndex); // Add to collapsed set
          drawerRows.forEach((row, index) => {
            const rowIndex = parseInt(row.dataset.rowIndex);
            if (rowIndex !== correctRowIndex) {
              // ALL rows slide toward the correct row position
              const isAbove = rowIndex < correctRowIndex;
              const distance = Math.abs(rowIndex - correctRowIndex) * 67; // 62px tile + 5px gap
              if (isAbove) {
                // Rows above slide DOWN toward the correct row
                row.style.transform = `translateY(${distance}px)`;
              } else {
                // Rows below slide UP toward the correct row
                row.style.transform = `translateY(-${distance}px)`;
              }
              // Animate adjacent wordles after all animations complete
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
                  // Reveal punctuation after collapse completes
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
        // Add smooth transition to all word containers for repositioning
        completedWords.forEach((wordContainer) => {
          wordContainer.style.transition = "transform 0.3s ease";
        });
        // Force layout recalculation to trigger the repositioning animation
        requestAnimationFrame(() => {
          // Trigger a reflow to make flexbox recalculate positions
          stackContainer.offsetHeight;
          // The height changes from display:none will cause natural repositioning
          // with the smooth transitions we just added
          // Clean up transitions after animation
          setTimeout(() => {
            completedWords.forEach((wordContainer) => {
              wordContainer.style.transition = "";
            });
          }, 300);
        });
      }

      function revealCompletedWordPunctuation(wordIndex) {
        // Reveal punctuation for a completed word after it has fully collapsed
        const punctuationElement = document.getElementById(
          `completed-punctuation-${wordIndex}`
        );
        if (punctuationElement) {
          setTimeout(() => {
            punctuationElement.style.opacity = "1";
            punctuationElement.style.visibility = "visible";
            punctuationElement.classList.add("revealed");
            // Mark this punctuation as permanently revealed
            revealedPunctuation.add(wordIndex);
          }, 50); // Small delay to ensure collapse animation is complete
        }
      }
      function renderCurrentWordGrid() {
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;
        const gridContainer = document.getElementById("game-grid");
        gridContainer.innerHTML = "";
        gridContainer.style.gridTemplateColumns = `repeat(${wordLength}, 62px)`;
        for (let row = 0; row < maxGuesses; row++) {
          for (let col = 0; col < wordLength; col++) {
            const tile = document.createElement("div");
            tile.className = "tile";
            tile.id = `tile-${row}-${col}`;

            const letter = gameGrid[row] ? gameGrid[row][col] : "";
            tile.textContent = letter;
            if (letter) {
              tile.classList.add("filled");
              // Apply color state if available
              const state = gameState[row] ? gameState[row][col] : "";
              if (state) {
                tile.classList.add(state);
              }
            }
            // Highlight current typing position
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

        // Timer is now rendered separately outside the grid

        // Handle punctuation separately in the overlay
        renderPunctuation();
      }

      function renderTimer() {
        const timerContainer = document.getElementById("timer-container");

        if (cooldownActive) {
          // Show timer with animation
          timerContainer.classList.remove("hidden");
          timerContainer.style.animation =
            "timerFadeInSlideUp 0.5s ease forwards";
          updateTimerDisplay();
        } else {
          // Hide timer
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

        // If timer reaches 0, start fade out animation
        if (timeLeft <= 0) {
          const timerContainer = document.getElementById("timer-container");
          timerContainer.style.animation =
            "timerFadeOutSlideDown 0.5s ease forwards";
          return;
        }

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        // Update individual digits with flip animation
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
          // Use the same flip animation as game tiles
          digit.style.willChange = "transform";
          digit.classList.add("flipping");

          // Change digit at midpoint (50% of animation)
          setTimeout(() => {
            digit.textContent = newDigit;
          }, 250); // Half of flip duration (0.5s / 2)

          // Complete animation
          setTimeout(() => {
            digit.classList.remove("flipping");
            digit.style.willChange = "auto";
          }, 500); // Full flip duration
        }
      }

      function renderPunctuation() {
        // NEVER clear overlay if there's animated punctuation visible
        const punctuationOverlay = document.getElementById(
          "punctuation-overlay"
        );
        // If punctuation has been animated for this word, NEVER touch the overlay
        if (punctuationAnimated) {
          return;
        }
        // Skip rendering punctuation in overlay if we're beyond the current word
        if (currentWordIndex >= WORDS_DATA.length) {
          return;
        }
        const currentWord = WORDS_DATA[currentWordIndex];
        // Only clear overlay if no punctuation is currently animated
        if (!punctuationAnimated) {
          punctuationOverlay.innerHTML = "";
        }
        // Don't render anything else - punctuation should only be rendered by animation
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
        // Prevent action during animations or cooldown
        if (isAnimating || cooldownActive) {
          updateCooldownDisplay();
          return;
        }
        // Get current guess from grid
        const guess = gameGrid[currentGuessIndex].join("");
        // Basic validation
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
        // Check for repeat guess
        if (usedGuesses.has(guess)) {
          showToast("Already guessed");
          animateInvalidWord(currentGuessIndex);
          return;
        }
        // Validate green letter constraints
        const constraintError = validateGreenConstraints(guess);
        if (constraintError) {
          showToast(constraintError);
          animateInvalidWord(currentGuessIndex);
          return;
        }
        // Validate against dictionary
        const isValidWord = await validateGuessWithFallback(guess);
        if (!isValidWord) {
          showToast("Word not in list");
          animateInvalidWord(currentGuessIndex);
          return;
        }
        // Store the guess
        usedGuesses.add(guess);
        // Check the guess and animate the results
        const results = checkWord(guess, currentGuessIndex);
        await animateFlipTiles(currentGuessIndex, results);
        currentGuessIndex++;
        currentLetterIndex = 0; // Reset for next row
        if (guess === currentWord.word) {
          // Word completed successfully
          isWordComplete = true;
          // Trigger title change animation for first word completion
          if (currentWordIndex === 0 && !hasCompletedFirstWord) {
            animateTitleChange();
          }
          // Calculate score for this word (max guesses - actual guesses + 1)
          const guessesLeft = currentWord.guesses - currentGuessIndex;
          const wordScore = Math.round(
            (currentWord.max_score * (guessesLeft + 1)) / currentWord.guesses
          );
          gameStats.totalScore += wordScore;
          // Skip all success animations - go straight to grid transition
          gameStats.wordsCompleted++;
          gameStats.totalGuesses += currentGuessIndex;
          if (currentGuessIndex === 1) gameStats.perfectWords++;
          // Skip punctuation animation - punctuation will appear after word joins stack and collapses
          // Perform the grid transition animation
          await animateGridTransition();
          // Wait a bit for animations to complete, then transition
          setTimeout(() => {
            if (currentWordIndex < WORDS_DATA.length - 1) {
              nextWord();
            } else {
              handleLastWordCompletion();
            }
          }, 500);
        } else if (currentGuessIndex >= currentWord.guesses) {
          // Word failed - exceeded guess limit, but allow retry after cooldown
          gameStats.wordsFailed++;
          // Track failed attempts for this word
          if (!allWordsData[currentWordIndex].failedAttempts) {
            allWordsData[currentWordIndex].failedAttempts = 0;
          }
          allWordsData[currentWordIndex].failedAttempts++;
          const failedAttempts = allWordsData[currentWordIndex].failedAttempts;
          const cooldownDuration = calculateCooldownDuration(failedAttempts);
          // Start cooldown - keep current grid visible
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
        // Try dictionary API
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
        // Reject obviously invalid words
        if (word.length < 2 || !/^[A-Z]+$/.test(word)) {
          return false;
        }
        // Allow as fallback but warn
        return true;
      }
      function checkWord(guess, rowIndex) {
        const currentWord = WORDS_DATA[currentWordIndex];
        const targetWord = currentWord.word;
        const targetLetters = targetWord.split("");
        const guessLetters = guess.split("");
        // Initialize result arrays
        const result = new Array(targetWord.length);
        const targetLetterCounts = {};
        // Count letters in target word
        for (let letter of targetLetters) {
          targetLetterCounts[letter] = (targetLetterCounts[letter] || 0) + 1;
        }
        // First pass: mark correct letters (green)
        for (let i = 0; i < guessLetters.length; i++) {
          if (guessLetters[i] === targetLetters[i]) {
            result[i] = "correct";
            targetLetterCounts[guessLetters[i]]--;
            // Track known correct positions
            knownLetters[i] = guessLetters[i];
          }
        }
        // Second pass: mark present letters (yellow) and absent letters (gray)
        for (let i = 0; i < guessLetters.length; i++) {
          if (result[i] === "correct") {
            continue; // Already marked as correct
          }
          const letter = guessLetters[i];
          if (targetLetterCounts[letter] > 0) {
            result[i] = "present";
            targetLetterCounts[letter]--;
          } else {
            result[i] = "absent";
          }
        }
        // Apply styles to tiles
        for (let i = 0; i < result.length; i++) {
          const tile = document.getElementById(`tile-${rowIndex}-${i}`);
          const state = result[i];
          // Remove any existing state classes
          tile.classList.remove("correct", "present", "absent");
          // Add new state class
          tile.classList.add(state);
          // Store state for this tile
          gameState[rowIndex][i] = state;
        }
        return result;
      }
      function handleLastWordCompletion() {
        // Handle the last word completion with auto-collapse animation
        const lastWordIndex = currentWordIndex;
        // Save the current word state
        saveCurrentWordState();
        // Clear punctuation animation flag and overlay - game is ending
        punctuationAnimated = false;
        const punctuationOverlay = document.getElementById(
          "punctuation-overlay"
        );
        if (punctuationOverlay) {
          punctuationOverlay.innerHTML = "";
        }
        // Move to "post-game" state by incrementing currentWordIndex
        currentWordIndex++;
        // Hide the current word grid since there's no next word
        const currentWordContainer = document.getElementById(
          "current-word-container"
        );
        if (currentWordContainer) {
          currentWordContainer.style.display = "none";
        }
        // Render only the completed words stack
        renderCompletedWordsStack();
        updateUI();
        // Auto-collapse the last completed word with animation
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
              // Trigger the collapse animation
              toggleWordDrawer(lastWordIndex);

              // Reveal punctuation after collapse animation completes
              setTimeout(() => {
                revealCompletedWordPunctuation(lastWordIndex);
              }, 450); // Wait for collapse animation to finish
            }
          }
        }, 200);
        // Show game complete after collapse animation
        setTimeout(() => {
          showGameComplete();
        }, 700); // Give time for collapse animation to complete
      }
      function nextWord() {
        if (currentWordIndex < WORDS_DATA.length - 1) {
          // Save current word state before switching
          saveCurrentWordState();
          const previousWordIndex = currentWordIndex; // Store the index of the word that was just completed
          // FIRST: Clear the punctuation animation flag and overlay
          // Now that the word is saved, punctuation will be rendered in completed stack
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
          // Auto-collapse the previously completed word with animation
          setTimeout(() => {
            const completedWordContainer = document.getElementById(
              `completed-word-${previousWordIndex}`
            );
            if (completedWordContainer) {
              // Check if it's not already collapsed (it should be expanded when first rendered)
              const gridWrapper = completedWordContainer.querySelector(
                ".completed-grid-wrapper"
              );
              if (
                gridWrapper &&
                !gridWrapper.classList.contains("drawer-collapsed")
              ) {
                // Trigger the collapse animation - this will automatically add it to collapsedWords set
                toggleWordDrawer(previousWordIndex);

                // Reveal punctuation after collapse animation completes
                setTimeout(() => {
                  revealCompletedWordPunctuation(previousWordIndex);
                }, 450); // Wait for collapse animation to finish
              }
            }
          }, 200); // Small delay to ensure the completed word is rendered in the stack
          // Trigger fade-in animation for new word
          const currentWordContainer = document.getElementById(
            "current-word-container"
          );
          if (currentWordContainer) {
            currentWordContainer.classList.add("fade-in");
            // Remove animation class after it completes
            setTimeout(() => {
              currentWordContainer.classList.remove("fade-in");
            }, 500);
          }
        }
      }
      function updateUI() {}
      function showGameComplete() {
        isGameComplete = true;
        // Clear any active cooldown
        if (cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
        cooldownActive = false;

        // Calculate stats
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

        // Set completion flag in localStorage (never cleared)
        localStorage.setItem("wordle_completed", "true");

        // Start shaking the 's' and make it clickable
        startTitleShaking();

        // Show congratulations popup
        showCongratulationsPopup(completionRate, avgGuesses, accuracy);

        // Save the completed game state so it persists on refresh
        saveGameProgress();
      }

      function startTitleShaking() {
        const titleS = document.getElementById("title-s");
        if (titleS && hasCompletedFirstWord) {
          titleS.classList.add("shaking");

          // Add click event listener for navigation
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

          // Add click event
          titleS.addEventListener("click", handleNavigation);
        }
      }

      // Local storage functions
      function saveGameProgress() {
        // Save current word state first
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
            // Only load if from same session (within 24 hours)
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

              // Ensure allWordsData is properly initialized
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
              // Resume cooldown if it was active
              if (cooldownActive && cooldownEndTime > Date.now()) {
                // Re-render grid to show timer
                renderGrid();
                updateCooldownDisplay();
                cooldownTimer = setInterval(() => {
                  updateCooldownDisplay();
                  if (Date.now() >= cooldownEndTime) {
                    endCooldown();
                  }
                }, 1000);
              } else if (cooldownActive) {
                // Cooldown expired while game was closed - trigger end cooldown with animation
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
      // Global keyboard handling for direct grid input
      document.addEventListener("keydown", function (event) {
        // Don't interfere with browser shortcuts
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return; // Let browser handle Ctrl+R, Cmd+W, Alt+Tab, etc.
        }
        // Only process if game is active
        if (isWordComplete || isWordFailed || cooldownActive) {
          return;
        }
        const isLetter = /^[a-zA-Z]$/.test(event.key);
        // Only prevent default for keys we actually use
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
        // All other keys (F5, Ctrl+R, Cmd+W, etc.) pass through normally
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
        // Get the actual CSS variable values from the DOM (cached for performance)
        const rootStyles = getComputedStyle(document.documentElement);
        const flipDurationStr = rootStyles
          .getPropertyValue("--animation-flip-duration")
          .trim();
        const flipDelayStr = rootStyles
          .getPropertyValue("--animation-flip-delay")
          .trim();
        // Convert CSS time values to milliseconds
        const flipDuration =
          parseFloat(flipDurationStr) *
          (flipDurationStr.includes("ms") ? 1 : 1000);
        const flipDelay =
          parseFloat(flipDelayStr) * (flipDelayStr.includes("ms") ? 1 : 1000);
        const halfFlip = flipDuration / 2;
        // Collect tiles for batch operations
        const tilesToFlip = [];
        for (let i = 0; i < currentWord.length; i++) {
          const tile = document.getElementById(`tile-${rowIndex}-${i}`);
          if (tile) {
            tilesToFlip.push({ tile: tile, index: i, state: results[i] });
          }
        }
        // Clear any existing animation classes first (batch operation)
        tilesToFlip.forEach((tileData) => {
          const tile = tileData.tile;
          tile.classList.remove("flipping", "correct", "present", "absent");
        });
        // Wait a moment for cleanup
        await new Promise((resolve) => setTimeout(resolve, 30));
        // Start all animations with staggered delays
        const animationPromises = tilesToFlip.map((tileData) => {
          const tile = tileData.tile;
          const index = tileData.index;
          const state = tileData.state;
          return new Promise((resolve) => {
            setTimeout(() => {
              // Use requestAnimationFrame for smooth animation start
              requestAnimationFrame(() => {
                // Optimize for animation
                tile.style.willChange = "transform";
                tile.classList.add("flipping");
                // Change color at midpoint (50%)
                setTimeout(() => {
                  tile.classList.add(state);
                  gameState[rowIndex][index] = state;
                }, flipDuration / 2);
                // Remove flip class when done and clean up
                setTimeout(() => {
                  tile.classList.remove("flipping");
                  tile.style.willChange = "auto";
                  resolve();
                }, flipDuration);
              });
            }, index * flipDelay);
          });
        });
        // Wait for all animations to complete
        await Promise.all(animationPromises);
        isAnimating = false;
      }
      function animateInvalidWord(rowIndex) {
        // Check if currentWordIndex is valid
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
        // No hiding or animation - just let the grids stack naturally
        isAnimating = false;
      }

      async function animateGridClear() {
        isAnimating = true;
        const currentWord = WORDS_DATA[currentWordIndex];
        const wordLength = currentWord.length;
        const maxGuesses = currentWord.guesses;

        // Collect all tiles that have content
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

        // Get flip duration from CSS
        const rootStyles = getComputedStyle(document.documentElement);
        const flipDurationStr = rootStyles
          .getPropertyValue("--animation-flip-duration")
          .trim();
        const flipDuration =
          parseFloat(flipDurationStr) *
          (flipDurationStr.includes("ms") ? 1 : 1000);

        // Get stagger delay from CSS
        const flipDelayStr = rootStyles
          .getPropertyValue("--animation-flip-delay")
          .trim();
        const flipDelay =
          parseFloat(flipDelayStr) * (flipDelayStr.includes("ms") ? 1 : 1000);

        // Start staggered flip animations (left to right, top to bottom)
        const clearPromises = [];
        for (let row = 0; row < maxGuesses; row++) {
          for (let col = 0; col < wordLength; col++) {
            const tile = document.getElementById(`tile-${row}-${col}`);
            if (tile && tile.textContent.trim() !== "") {
              const staggerIndex = row * wordLength + col; // Calculate position for stagger
              const delay = staggerIndex * flipDelay;

              const promise = new Promise((resolve) => {
                setTimeout(() => {
                  // Optimize for animation
                  tile.style.willChange = "transform";
                  tile.classList.add("flipping");

                  // Clear content at midpoint (50% of animation)
                  setTimeout(() => {
                    tile.textContent = "";
                    tile.classList.remove(
                      "correct",
                      "present",
                      "absent",
                      "filled"
                    );
                  }, flipDuration / 2);

                  // Complete animation
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

        // Wait for all animations to complete
        await Promise.all(clearPromises);
        isAnimating = false;
      }
      // Performance monitoring and cleanup utilities
      function cleanupAnimations() {
        // Reset all willChange properties to auto for better performance
        const allTiles = document.querySelectorAll(".tile, .completed-tile");
        allTiles.forEach((tile) => {
          tile.style.willChange = "auto";
          tile.style.animation = "";
          tile.style.animationDelay = "";
        });
        // Clean up container optimizations
        const containers = document.querySelectorAll(
          ".current-word-container, .completed-words-stack"
        );
        containers.forEach((container) => {
          container.style.willChange = "auto";
        });
        // Reset animation flag
        isAnimating = false;
      }
      function cleanupAllAnimationStyles() {
        // Comprehensive cleanup of all animation-related styles
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
        // Clean up containers
        const containers = document.querySelectorAll(
          ".current-word-container, .completed-words-stack, .word-attempts"
        );
        containers.forEach((container) => {
          container.style.willChange = "auto";
          container.style.transform = "";
          container.style.opacity = "";
        });
      }
      // Add cleanup after major animations
      window.addEventListener("beforeunload", cleanupAnimations);

      function showContinueGamePopup() {
        const popup = document.getElementById("continue-game-popup");
        popup.classList.remove("hidden");

        // Add event listeners
        document.getElementById("continue-game-btn").onclick = function () {
          popup.classList.add("hidden");
          loadGameProgress();
          setupCurrentWord();
          updateUI();
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

        // Calculate star rating based on score percentage
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

        // Update star display
        const starElements = starRatingEl.querySelectorAll(".star");
        starElements.forEach((star, index) => {
          if (index < stars) {
            star.classList.add("filled");
          } else {
            star.classList.remove("filled");
          }
        });

        ratingTextEl.textContent = ratingText;

        // Create congratulations message based on performance
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

        // Create stats display
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

        // Add event listener for play again
        document.getElementById("play-again-btn").onclick = function () {
          popup.classList.add("hidden");
          // Clear saved game state when explicitly choosing to play again
          localStorage.removeItem("wordleGameState");
          location.reload(); // Refresh page to start new game
        };

        // Add event listener for close button
        document.getElementById("close-popup-btn").onclick = function () {
          popup.classList.add("hidden");
        };

        // Allow closing popup by clicking outside
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

        // Hide toast after 2 seconds
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
