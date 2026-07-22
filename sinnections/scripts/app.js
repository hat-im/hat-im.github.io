(function(){

    // Mobile redirect - redirect to mobile version if on mobile device
    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768 && window.innerHeight <= 1024);
    }

    if (isMobile()) {
        window.location.href = 'sinnections-mobile.html';
    }

    var BASE = 'sinnections/';
    var STRINGS_URL = BASE + 'strings.json';
    var PUZZLE_URL = BASE + 'data/puzzle.json';

    // Game data (loaded from puzzle.json)
    let gameData = null;

    // UI copy (loaded from strings.json)
    let STR = null;

    function fmt(template, vars){
        return template.replace(/\{(\w+)\}/g, function(_, key){ return vars[key]; });
    }

    // Flag to control next puzzle access
    const NEXT_PUZZLES_ENABLED = true; // Set to true to enable all next puzzles

    // Cooldown duration in milliseconds
    const COOLDOWN_DURATION = 3600000; // 1 hour (3600000ms)

    // Game state
    let gameState = {
        words: [],
        selectedWords: [],
        foundGroups: [],
        completionOrder: [],
        mistakes: 0,
        maxMistakes: 4,
        gameOver: false,
        previousGuesses: new Set(), // Track previous incorrect guesses
        lastAttemptTime: null, // Track when the last attempt was made
        timerInterval: null, // Track the timer interval
        attempts: [], // Track all attempts with their colors
        wordSubsets: {} // Track selected word subsets for each category
    };

    // DOM elements
    const wordGrid = document.getElementById('wordGrid');
    const toastEl = document.getElementById('toast');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const deselectBtn = document.getElementById('deselectBtn');
    const submitBtn = document.getElementById('submitBtn');
    const gameOverEl = document.getElementById('gameOver');
    const gameOverTitle = document.getElementById('gameOverTitle');
    const gameOverMessage = document.getElementById('gameOverMessage');
    const cooldownTimer = document.getElementById('cooldownTimer');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const timerSection = document.getElementById('timerSection');
    const timerEl = document.getElementById('timer');

    // Check if user is in cooldown period
    function isInCooldown() {
        const lastAttempt = localStorage.getItem('sinnections_lastAttemptTime');
        if (!lastAttempt) return false;

        const now = new Date().getTime();
        const timeDiff = now - parseInt(lastAttempt);
        return timeDiff < COOLDOWN_DURATION;
    }

    // Update cooldown timer display
    function updateCooldownTimer() {
        const lastAttempt = localStorage.getItem('sinnections_lastAttemptTime');
        if (!lastAttempt) return;

        const now = new Date().getTime();
        const timeDiff = now - parseInt(lastAttempt);
        const timeLeft = Math.max(COOLDOWN_DURATION - timeDiff, 0);

        if (timeLeft === 0) {
            cooldownTimer.textContent = STR.cooldown.readyText;
            playAgainBtn.disabled = false;
            playAgainBtn.textContent = STR.playAgainBtn.ready;
            clearInterval(gameState.timerInterval);
            // Don't auto-close popup - let user click Play Again button
            return;
        }

        const hours = Math.floor(timeLeft / 3600000);
        const minutes = Math.floor((timeLeft % 3600000) / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);

        cooldownTimer.textContent = fmt(STR.cooldown.waitingTemplate, {
            h: String(hours).padStart(2, '0'),
            m: String(minutes).padStart(2, '0'),
            s: String(seconds).padStart(2, '0')
        });
        playAgainBtn.disabled = true;
        playAgainBtn.textContent = STR.playAgainBtn.waiting;
    }

    // Show toast message
    function showToast(message) {
        // Clear any existing timeout
        if (window.toastTimeout) {
            clearTimeout(window.toastTimeout);
        }

        toastEl.textContent = message;
        toastEl.className = 'toast show';

        window.toastTimeout = setTimeout(() => {
            toastEl.className = 'toast';
        }, 2000);
    }

    // Show early access popup
    function showEarlyAccessPopup() {
        const popup = document.getElementById('early-access-popup');
        popup.classList.add('show');
    }

    // Close early access popup
    function closeEarlyAccessPopup() {
        const popup = document.getElementById('early-access-popup');
        popup.classList.remove('show');
    }

    // Save game state with error handling
    function saveGameState() {
        try {
            if (!gameState || gameState.gameOver) {
                return; // Don't save if game is over
            }

            const stateToSave = {
                words: gameState.words || [],
                selectedWords: gameState.selectedWords || [], // Always save current selections
                foundGroups: gameState.foundGroups || [],
                completionOrder: gameState.completionOrder || [],
                mistakes: gameState.mistakes || 0,
                maxMistakes: gameState.maxMistakes || 4,
                previousGuesses: Array.from(gameState.previousGuesses || []),
                attempts: gameState.attempts || [],
                wordSubsets: gameState.wordSubsets || {},
                timestamp: Date.now()
            };
            localStorage.setItem('sinnections_gameState', JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Failed to save game state:', e);
        }
    }

    // Load game state with validation
    function loadGameState() {
        try {
            const savedState = localStorage.getItem('sinnections_gameState');
            if (!savedState) return false;

            const state = JSON.parse(savedState);

            // Validate the loaded state
            if (!state.words || !Array.isArray(state.words) || state.words.length === 0) {
                return false;
            }

            // Restore game state
            gameState.words = state.words;
            gameState.selectedWords = state.selectedWords || [];
            gameState.foundGroups = state.foundGroups || [];
            gameState.completionOrder = state.completionOrder || [];
            gameState.mistakes = state.mistakes || 0;
            gameState.maxMistakes = state.maxMistakes || 4;
            gameState.previousGuesses = new Set(state.previousGuesses || []);
            gameState.attempts = state.attempts || [];
            gameState.wordSubsets = state.wordSubsets || {};
            gameState.gameOver = false;
            gameState.lastAttemptTime = null;
            gameState.timerInterval = null;

            return true;
        } catch (e) {
            console.warn('Failed to load game state:', e);
            localStorage.removeItem('sinnections_gameState');
            return false;
        }
    }

    // Clear saved game state
    function clearSavedGameState() {
        try {
            localStorage.removeItem('sinnections_gameState');
        } catch (e) {
            console.warn('Failed to clear game state:', e);
        }
    }

    // Initialize game
    function initGame() {
        // Check if cooldown has expired and clean up if needed
        const lastAttempt = localStorage.getItem('sinnections_lastAttemptTime');
        if (lastAttempt) {
            const now = new Date().getTime();
            const timeDiff = now - parseInt(lastAttempt);
            if (timeDiff >= COOLDOWN_DURATION) {
                // Cooldown has expired - clear all saved data for fresh start
                localStorage.removeItem('sinnections_lastAttemptTime');
                clearSavedGameState();
                localStorage.removeItem('sinnections_attempts');
            }
        }

        // NOW check cooldown (after cleanup)
        if (isInCooldown()) {
            // Try to load the saved game state from when they lost
            const hasLoadedState = loadGameState();

            if (!hasLoadedState) {
                // Fallback if no saved state - create basic game state
                gameState = {
                    words: getGameWords(),
                    selectedWords: [],
                    foundGroups: [],
                    completionOrder: [],
                    mistakes: 4,
                    maxMistakes: 4,
                    gameOver: true,
                    previousGuesses: new Set(),
                    lastAttemptTime: null,
                    timerInterval: null,
                    attempts: [],
                    wordSubsets: getWordSubsets()
                };
                shuffleArray(gameState.words);
            } else {
                // Use loaded state but ensure game is marked as over
                gameState.gameOver = true;
            }

            // Reset UI and render grid so tiles are visible behind popup
            toastEl.className = 'toast';
            updateMistakesDisplay();
            renderWordGrid();
            updateControls();
            showGameOverScreen(false, true);
            return;
        }

        // Initialize base game state
        gameState = {
            words: [],
            selectedWords: [],
            foundGroups: [],
            completionOrder: [],
            mistakes: 0,
            maxMistakes: 4,
            gameOver: false,
            previousGuesses: new Set(),
            lastAttemptTime: null,
            timerInterval: null,
            attempts: [],
            wordSubsets: {}
        };

        // Try to load existing game state
        const hasLoadedState = loadGameState();

        if (!hasLoadedState) {
            // Create new game - get word subsets and shuffle
            gameState.wordSubsets = getWordSubsets();
            gameState.words = getGameWords();
            shuffleArray(gameState.words);
        }

        // Check if user won and closed popup previously
        const winPopupClosed = localStorage.getItem('sinnections_winPopupClosed');
        const hasWon = gameState.foundGroups.length === 4;

        // Reset UI
        toastEl.className = 'toast';
        gameOverEl.className = 'game-over';
        updateMistakesDisplay();
        renderWordGrid();
        updateControls();

        // If user won but popup was closed, show categories without popup
        // If user won and refreshed, show popup again
        if (hasWon) {
            if (winPopupClosed === 'true') {
                // Show categories without popup
                gameState.gameOver = true;
            } else {
                // Show win popup on refresh
                gameState.gameOver = true;
                showGameOverScreen(true);
            }
        }
    }

    // Get or create word subsets for categories with more than 4 words
    function getWordSubsets() {
        // Try to load existing subsets first
        const savedSubsets = localStorage.getItem('sinnections_wordSubsets');
        if (savedSubsets) {
            try {
                return JSON.parse(savedSubsets);
            } catch (e) {
                console.warn('Failed to load word subsets:', e);
            }
        }

        // Create new subsets
        const subsets = {};
        gameData.groups.forEach(group => {
            if (group.words.length > 4) {
                // Randomly select 4 words from the group
                const shuffledWords = [...group.words];
                shuffleArray(shuffledWords);
                subsets[group.category] = shuffledWords.slice(0, 4);
            } else {
                // Use all words if 4 or fewer
                subsets[group.category] = [...group.words];
            }
        });

        // Save the subsets
        try {
            localStorage.setItem('sinnections_wordSubsets', JSON.stringify(subsets));
        } catch (e) {
            console.warn('Failed to save word subsets:', e);
        }

        return subsets;
    }

    // Get the current game words based on subsets
    function getGameWords() {
        const subsets = gameState.wordSubsets || getWordSubsets();
        return Object.values(subsets).flat();
    }

    // Clear word subsets (only called when user wins and plays again)
    function clearWordSubsets() {
        try {
            localStorage.removeItem('sinnections_wordSubsets');
        } catch (e) {
            console.warn('Failed to clear word subsets:', e);
        }
    }

    // Shuffle array
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Optimized render word grid with reduced DOM manipulation
    function renderWordGrid() {
        const currentTiles = wordGrid.querySelectorAll('.word-tile');
        const currentWords = Array.from(currentTiles).map(tile => tile.textContent);

        // Get remaining words (not found yet) - use Set for faster lookup
        const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
        const remainingWords = gameState.words.filter(word => !foundWords.has(word));
        const selectedWordsSet = new Set(gameState.selectedWords);

        // Update existing tiles if possible (but only if order is also the same)
        if (currentWords.length === remainingWords.length &&
            currentWords.every((word, index) => word === remainingWords[index])) {
            // Just update selection states - words are in same order
            currentTiles.forEach(tile => {
                const word = tile.textContent;
                tile.classList.toggle('selected', selectedWordsSet.has(word));
            });
        } else {
            // Full re-render needed - use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();

            // Add found groups first (at the top) - preserve existing groups
            gameState.foundGroups.forEach((group, index) => {
                const groupBlock = document.createElement('div');
                groupBlock.className = `group-block ${group.color}`;

                groupBlock.innerHTML = `
                    <div class="group-category">${group.category}</div>
                    <div class="group-words">${group.words.join(', ')}</div>
                `;

                fragment.appendChild(groupBlock);
            });

            // Add remaining word tiles below the groups
            remainingWords.forEach(word => {
                const tile = document.createElement('div');
                tile.className = `word-tile${selectedWordsSet.has(word) ? ' selected' : ''}`;
                tile.textContent = word;
                tile.addEventListener('click', () => selectWord(word), { passive: true });

                fragment.appendChild(tile);
            });

            // Single DOM update
            wordGrid.innerHTML = '';
            wordGrid.appendChild(fragment);
        }
    }

    // Select/deselect word
    function selectWord(word) {
        if (gameState.gameOver) return;

        // Check if word is already found
        const isFound = gameState.foundGroups.some(group =>
            group.words.includes(word)
        );
        if (isFound) return;

        const index = gameState.selectedWords.indexOf(word);

        if (index > -1) {
            // Deselect word
            gameState.selectedWords.splice(index, 1);
        } else if (gameState.selectedWords.length < 4) {
            // Select word
            gameState.selectedWords.push(word);
        }

        renderWordGrid();
        updateControls();
    }

    // Update control buttons
    function updateControls() {
        submitBtn.disabled = gameState.selectedWords.length !== 4;
        deselectBtn.disabled = gameState.selectedWords.length === 0;
        shuffleBtn.disabled = gameState.gameOver || gameState.mistakes >= gameState.maxMistakes || gameState.foundGroups.length === 4;
    }

    // Shuffle words with optimized performance
    function shuffleWords() {
        // Get remaining words (not found yet) - use cached check for better performance
        const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
        const remainingWords = gameState.words.filter(word => !foundWords.has(word));

        // Shuffle only the remaining words
        shuffleArray(remainingWords);

        // Update the words array with found groups first, then shuffled remaining
        gameState.words = [
            ...gameState.foundGroups.flatMap(group => group.words),
            ...remainingWords
        ];

        // DON'T clear selections when shuffling - keep user's selected words

        // Use requestAnimationFrame for smoother rendering
        requestAnimationFrame(() => {
            wordGrid.innerHTML = '';
            renderWordGrid();
            updateControls();
        });
    }

    // Deselect all words
    function deselectAll() {
        gameState.selectedWords = [];
        renderWordGrid();
        updateControls();
    }

    // Submit guess
    function submitGuess() {
        if (gameState.selectedWords.length !== 4) return;

        // Sort selected words to ensure consistent comparison
        const sortedGuess = [...gameState.selectedWords].sort().join(',');

        // Check if this guess was already tried
        if (gameState.previousGuesses.has(sortedGuess)) {
            showToast(STR.toast.alreadyGuessed);
            gameState.selectedWords = [];
            saveGameState(); // Save state after clearing selections
            renderWordGrid();
            updateControls();
            return;
        }

        // Check if this combination forms a valid group (using subsets)
        const correctGroup = gameData.groups.find(group => {
            const groupSubset = gameState.wordSubsets[group.category] || group.words;
            return gameState.selectedWords.every(word => groupSubset.includes(word)) &&
                   groupSubset.every(word => gameState.selectedWords.includes(word)) &&
                   gameState.selectedWords.length === 4;
        });

        if (correctGroup) {
            // Animate correct guess sequence
            animateCorrectGuess(correctGroup);
        } else {
            // Add to previous guesses
            gameState.previousGuesses.add(sortedGuess);

            // Find the group that has the most matches with the selected words (using subsets)
            let bestMatch = null;
            let maxMatches = 0;
            gameData.groups.forEach(group => {
                const groupSubset = gameState.wordSubsets[group.category] || group.words;
                const matches = gameState.selectedWords.filter(word =>
                    groupSubset.includes(word)
                ).length;
                if (matches > maxMatches) {
                    maxMatches = matches;
                    bestMatch = group;
                }
            });

            // Track the attempt with colors in order (using subsets)
            const selectedColors = gameState.selectedWords.map(word => {
                // Find which group this word belongs to
                const group = gameData.groups.find(g => {
                    const groupSubset = gameState.wordSubsets[g.category] || g.words;
                    return groupSubset.includes(word);
                });
                return group ? group.color : 'gray';
            });
            gameState.attempts.push({
                words: [...gameState.selectedWords],
                colors: selectedColors,
                correct: false
            });

            // Check if "one away" (3 out of 4 words are correct, using subsets)
            const oneAwayGroup = gameData.groups.find(group => {
                const groupSubset = gameState.wordSubsets[group.category] || group.words;
                const matchingWords = gameState.selectedWords.filter(word =>
                    groupSubset.includes(word)
                );
                return matchingWords.length === 3;
            });

            if (oneAwayGroup) {
                showToast(STR.toast.oneAway);
            }

            // Shake the selected tiles for incorrect guess - optimized cleanup
            const selectedTiles = document.querySelectorAll('.word-tile.selected');
            selectedTiles.forEach(tile => {
                tile.classList.add('incorrect-guess');
                // Use requestAnimationFrame for smoother cleanup
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        tile.classList.remove('incorrect-guess');
                    }, 400);
                });
            });

            // Incorrect guess
            gameState.mistakes++;

            updateMistakesDisplay();
            saveGameState(); // Save state after incorrect guess
            renderWordGrid(); // Re-render to keep selections

            // Check if game is lost
            if (gameState.mistakes >= gameState.maxMistakes) {
                // Store the loss time in localStorage
                localStorage.setItem('sinnections_lastAttemptTime', new Date().getTime().toString());
                // DON'T clear saved state on loss - preserve it for cooldown period
                saveGameState(); // Save final state so user can see it during cooldown
                endGame(false);
            }
        }

        updateControls();
    }

    async function animateCorrectGuess(correctGroup) {
        const selectedTiles = Array.from(document.querySelectorAll('.word-tile.selected'));

        // Step 1: Hop animation - each tile hops one at a time with optimized timing
        const hopPromises = selectedTiles.map((tile, i) => {
            return new Promise(resolve => {
                setTimeout(() => {
                    tile.classList.add('hop');
                    // Use requestAnimationFrame for smoother cleanup
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            tile.classList.remove('hop');
                            resolve();
                        }, 300);
                    });
                }, i * 100);
            });
        });

        await Promise.all(hopPromises);

        // Step 2: Calculate target row and positions
        const grid = document.getElementById('wordGrid');
        const gridRect = grid.getBoundingClientRect();
        const allTiles = Array.from(grid.querySelectorAll('.word-tile'));

        // Target row is right after existing groups (at index gameState.foundGroups.length)
        const targetRowIndex = gameState.foundGroups.length;

        // Calculate the exact grid positions for the target row
        const targetPositions = [];
        const tileHeight = selectedTiles[0].offsetHeight;
        const tileWidth = selectedTiles[0].offsetWidth;
        const gap = 8; // CSS gap value

        for (let col = 0; col < 4; col++) {
            const x = gridRect.left + col * (tileWidth + gap);
            const y = gridRect.top + targetRowIndex * (tileHeight + gap);
            targetPositions.push({ x, y });
        }

        // Step 3: Find tiles that are exactly in the target row positions
        const tilesToDisplace = [];
        const swapAnimations = [];

        // Get all non-selected tiles currently in the target row
        const tilesInTargetRow = allTiles.filter(tile => {
            if (tile.classList.contains('selected')) return false;

            const tileRect = tile.getBoundingClientRect();
            const tileRowIndex = Math.round((tileRect.top - gridRect.top) / (tileHeight + gap));

            // Only include tiles that are exactly in the target row
            return tileRowIndex === targetRowIndex;
        });

        // These are the tiles that need to be displaced
        tilesToDisplace.push(...tilesInTargetRow);

        // Move selected tiles to target row
        selectedTiles.forEach((selectedTile, index) => {
            const selectedRect = selectedTile.getBoundingClientRect();
            const targetPos = targetPositions[index];

            const deltaX = targetPos.x - selectedRect.left;
            const deltaY = targetPos.y - selectedRect.top;

            selectedTile.classList.add('moving');
            selectedTile.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });

        // Calculate exact destination positions for displaced tiles
        const remainingTiles = allTiles.filter(tile =>
            !tile.classList.contains('selected') &&
            !tilesToDisplace.includes(tile)
        );

        // Create a list of all available positions after the target row
        const availablePositions = [];
        for (let row = targetRowIndex + 1; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const x = gridRect.left + col * (tileWidth + gap);
                const y = gridRect.top + row * (tileHeight + gap);
                availablePositions.push({ x, y, row, col });
            }
        }

        // First, account for tiles that are already in correct positions and don't need to move
        const occupiedPositions = new Set();
        remainingTiles.forEach(tile => {
            const tileRect = tile.getBoundingClientRect();
            availablePositions.forEach((pos, index) => {
                if (Math.abs(tileRect.left - pos.x) < 10 && Math.abs(tileRect.top - pos.y) < 10) {
                    occupiedPositions.add(index);
                }
            });
        });

        // Assign displaced tiles to the first available positions
        let assignmentIndex = 0;
        tilesToDisplace.forEach((displacedTile) => {
            // Find next available position
            while (assignmentIndex < availablePositions.length && occupiedPositions.has(assignmentIndex)) {
                assignmentIndex++;
            }

            if (assignmentIndex < availablePositions.length) {
                const targetPos = availablePositions[assignmentIndex];
                const tileRect = displacedTile.getBoundingClientRect();

                const deltaX = targetPos.x - tileRect.left;
                const deltaY = targetPos.y - tileRect.top;

                displacedTile.classList.add('moving');
                displacedTile.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                swapAnimations.push({ targetTile: displacedTile });

                // Mark this position as occupied
                occupiedPositions.add(assignmentIndex);
                assignmentIndex++;
            }
        });

        // Wait for movement animation to complete
        await new Promise(resolve => setTimeout(resolve, 600));

        // Step 4: Update game state
        // Create a copy of the group with the subset words
        const groupWithSubset = {
            ...correctGroup,
            words: gameState.wordSubsets[correctGroup.category] || correctGroup.words
        };
        gameState.foundGroups.push(groupWithSubset);
        gameState.completionOrder.push(correctGroup.color);
        gameState.attempts.push({
            words: [...gameState.selectedWords],
            colors: gameState.selectedWords.map(() => correctGroup.color),
            correct: true
        });
        gameState.selectedWords = [];

        // Step 5: Clean up transforms first, THEN modify DOM
        selectedTiles.forEach(tile => {
            tile.classList.remove('moving', 'selected');
            tile.style.transform = '';
        });

        swapAnimations.forEach(({ targetTile }) => {
            targetTile.classList.remove('moving');
            targetTile.style.transform = '';
        });

        // Wait a frame to ensure transforms are cleared
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Step 6: Temporarily disable transitions to prevent second movement
        const allRemainingTiles = wordGrid.querySelectorAll('.word-tile:not(.selected)');
        allRemainingTiles.forEach(tile => {
            tile.style.transition = 'none';
        });

        // Now remove tiles and insert group block
        selectedTiles.forEach(tile => {
            tile.remove();
        });

        // Create the new group block
        const groupBlock = document.createElement('div');
        groupBlock.className = `group-block ${correctGroup.color} new-group`;

        const categoryEl = document.createElement('div');
        categoryEl.className = 'group-category';
        categoryEl.textContent = correctGroup.category;

        const wordsEl = document.createElement('div');
        wordsEl.className = 'group-words';
        wordsEl.textContent = correctGroup.words.join(', ');

        groupBlock.appendChild(categoryEl);
        groupBlock.appendChild(wordsEl);

        // Insert at the correct position
        const firstTile = wordGrid.querySelector('.word-tile');

        if (firstTile) {
            wordGrid.insertBefore(groupBlock, firstTile);
        } else {
            wordGrid.appendChild(groupBlock);
        }

        // Re-enable transitions after a frame
        requestAnimationFrame(() => {
            allRemainingTiles.forEach(tile => {
                if (tile.parentNode) { // Check if tile still exists
                    tile.style.transition = '';
                }
            });
        });

        // Remove the animation class after animation completes
        setTimeout(() => {
            groupBlock.classList.remove('new-group');
        }, 500);

        updateControls();
        saveGameState(); // Save state after correct guess

        // Check if game is won
        if (gameState.foundGroups.length === 4) {
            clearSavedGameState(); // Clear saved state on game completion
            clearWordSubsets(); // Clear word subsets on win so new game gets new subsets
            endGame(true);
        }
    }

    // Update mistakes display
    function updateMistakesDisplay() {
        for (let i = 1; i <= 4; i++) {
            const dot = document.getElementById(`dot${i}`);
            if (i <= gameState.mistakes) {
                dot.classList.add('used');
            } else {
                dot.classList.remove('used');
            }
        }
    }

    // Show game over screen
    function showGameOverScreen(won, fromCooldown = false) {
        gameState.gameOver = true;

        // Clear any existing grids from previous games (but only from inside game-over element)
        const existingGrids = gameOverEl.querySelectorAll('.attempts-grid, .completion-grid');
        existingGrids.forEach(grid => grid.remove());

        // Handle close button visibility
        const closeBtn = gameOverEl.querySelector('.close-btn');
        if (won || !fromCooldown) {
            // Show close button for wins or new losses
            closeBtn.style.display = 'block';
        } else {
            // Hide close button during cooldown
            closeBtn.style.display = 'none';
        }

        if (won) {
            gameOverTitle.textContent = STR.gameOver.win.title;
            gameOverMessage.textContent = STR.gameOver.win.message;
            playAgainBtn.disabled = false;
            playAgainBtn.textContent = STR.playAgainBtn.ready;
            cooldownTimer.textContent = '';
            // Mark connect1ons as completed
            localStorage.setItem('sinnections_completed', 'true');
        } else {
            gameOverTitle.textContent = STR.gameOver.lose.title;
            gameOverMessage.textContent = STR.gameOver.lose.message;
            playAgainBtn.textContent = STR.playAgainBtn.ready;

            if (fromCooldown) {
                // Start the cooldown timer, button starts disabled
                playAgainBtn.disabled = true;
                updateCooldownTimer();
                gameState.timerInterval = setInterval(updateCooldownTimer, 1000);
            } else {
                // Start the cooldown timer, button starts disabled
                playAgainBtn.disabled = true;
                updateCooldownTimer();
                gameState.timerInterval = setInterval(updateCooldownTimer, 1000);
            }
        }

        // Always show attempts grid at the end
        if (gameState.attempts.length > 0) {
            const attemptsGrid = document.createElement('div');
            attemptsGrid.className = 'attempts-grid';

            gameState.attempts.forEach((attempt, rowIndex) => {
                const attemptRow = document.createElement('div');
                attemptRow.className = 'attempt-row';

                attempt.colors.forEach((color, cellIndex) => {
                    const cell = document.createElement('div');
                    cell.className = 'attempt-cell';

                    const bgColor = getColorCode(color);

                    // Try multiple approaches to ensure color is set
                    cell.style.backgroundColor = bgColor;
                    cell.style.background = bgColor;
                    cell.setAttribute('data-color', color);
                    cell.setAttribute('data-bg-color', bgColor);

                    // Calculate unique cell index across all attempts
                    const globalCellIndex = rowIndex * 4 + cellIndex;
                    const totalCells = gameState.attempts.length * 4;

                    // Only add links to the last row (final 4 cells)
                    if (globalCellIndex >= totalCells - 4) {
                        // Define unique links for the last row
                        const lastRowLinks = [
                            atob('c29ubmVjdGlvbnMuaHRtbA=='),
                            '',
                            '',
                            ''
                        ];

                        const lastRowIndex = globalCellIndex - (totalCells - 4);

                        cell.style.cursor = 'pointer';
                        cell.addEventListener('click', () => {
                            const link = lastRowLinks[lastRowIndex];

                            // If next puzzles are disabled, always show popup
                            if (!NEXT_PUZZLES_ENABLED) {
                                showEarlyAccessPopup();
                            } else {
                                // Only check link validity when puzzles are enabled
                                if (link && link.trim() !== '') {
                                    window.open(link, '_blank');
                                } else {
                                    showToast(STR.toast.notYetAvailable);
                                }
                            }
                        });
                    }

                    cell.style.setProperty('--row-index', rowIndex);
                    cell.style.setProperty('--cell-index', cellIndex);
                    attemptRow.appendChild(cell);
                });

                attemptsGrid.appendChild(attemptRow);
            });

            gameOverMessage.insertAdjacentElement('afterend', attemptsGrid);
        }

        // Use groups in the order they were solved (preserve existing layout)
        const solvedGroups = gameState.foundGroups;

        // Clear the word grid
        wordGrid.innerHTML = '';

        // Add all groups in the order they were solved
        solvedGroups.forEach(group => {
            const groupBlock = document.createElement('div');
            groupBlock.className = `group-block ${group.color}`;

            const categoryEl = document.createElement('div');
            categoryEl.className = 'group-category';
            categoryEl.textContent = group.category;

            const wordsEl = document.createElement('div');
            wordsEl.className = 'group-words';
            wordsEl.textContent = group.words.join(', ');

            groupBlock.appendChild(categoryEl);
            groupBlock.appendChild(wordsEl);
            wordGrid.appendChild(groupBlock);
        });

        // If the game was lost, also show the remaining ungrouped tiles
        if (!won) {
            const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
            const remainingWords = gameState.words.filter(word => !foundWords.has(word));

            remainingWords.forEach(word => {
                const tile = document.createElement('div');
                tile.className = 'word-tile';
                tile.textContent = word;
                tile.addEventListener('click', () => selectWord(word), { passive: true });

                wordGrid.appendChild(tile);
            });
        }

        // Show the game over screen
        gameOverEl.className = 'game-over show';

        // Ensure all attempt cells are visible with optimized DOM manipulation
        requestAnimationFrame(() => {
            const attemptsGrid = gameOverEl.querySelector('.attempts-grid');
            if (attemptsGrid) {
                attemptsGrid.style.display = 'grid';
                // Batch DOM updates for better performance
                const attemptCells = attemptsGrid.querySelectorAll('.attempt-cell');
                attemptCells.forEach(cell => {
                    cell.style.cssText = 'opacity: 1; transform: scale(1);';
                });
            }
        });
    }

    // End game
    function endGame(won) {
        showGameOverScreen(won);

        if (won) {
            // Add victory shake to the last row of group blocks after screen is shown
            setTimeout(() => {
                addVictoryShake();
            }, 200);
        }
    }

    // Add victory shake and click handlers to the last row of attempts grid
    function addVictoryShake() {
        // Use a more reliable approach to wait for the attempts grid
        const checkForGrid = () => {
            const attemptsGrid = gameOverEl.querySelector('.attempts-grid');

            if (attemptsGrid && gameState.attempts.length > 0) {
                const attemptCells = attemptsGrid.querySelectorAll('.attempt-cell');

                // Calculate expected number of cells (4 cells per attempt)
                const expectedCells = gameState.attempts.length * 4;

                if (attemptCells.length >= expectedCells && attemptCells.length >= 4) {
                    // Get the last 4 cells (representing the final winning attempt)
                    const lastRowCells = Array.from(attemptCells).slice(-4);

                    // Double-check that these cells are visible
                    const allVisible = lastRowCells.every(cell => {
                        const style = window.getComputedStyle(cell);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    });

                    if (allVisible) {
                        // Add victory shake and click handlers to each cell in the last row
                        lastRowCells.forEach((cell, index) => {
                            cell.classList.add('victory-shake');

                            // Randomly assign one of the shake animations
                            const shakeAnimations = ['subtle-shake-1', 'subtle-shake-2', 'subtle-shake-3', 'subtle-shake-4'];
                            const randomAnimation = shakeAnimations[Math.floor(Math.random() * shakeAnimations.length)];

                            // Add random duration between 1.5s and 2.5s for more variety
                            const randomDuration = (1.5 + Math.random()).toFixed(1);

                            // Add random delay between 0 and 0.5s to stagger the animations
                            const randomDelay = (Math.random() * 0.5).toFixed(2);

                            cell.style.animation = `${randomAnimation} ${randomDuration}s ease-in-out infinite`;
                            cell.style.animationDelay = `${randomDelay}s`;
                        });

                        return true; // Successfully added victory shake
                    }
                }
            }
            return false; // Grid not ready yet
        };

        // Try immediately first
        if (!checkForGrid()) {
            // If not ready, wait and try again with shorter intervals for better responsiveness
            let attempts = 0;
            const maxAttempts = 10;

            const tryAgain = () => {
                attempts++;
                if (checkForGrid() || attempts >= maxAttempts) {
                    return; // Success or max attempts reached
                }
                setTimeout(tryAgain, 200); // Try every 200ms for up to 2 seconds
            };

            setTimeout(tryAgain, 100);
        }
    }

    // Helper function to get color codes
    function getColorCode(color) {
        const colorMap = {
            'yellow': '#f9df84',
            'green': '#a0c35a',
            'blue': '#b0c4ef',
            'purple': '#ba81c5'
        };
        return colorMap[color] || '#999';
    }

    // Show how to play popup
    function showHowToPlayPopup() {
        const popup = document.getElementById('how-to-play-popup');
        popup.classList.add('show');
    }

    // Close how to play popup
    function closeHowToPlayPopup() {
        const popup = document.getElementById('how-to-play-popup');
        popup.classList.remove('show');
    }

    // Close game over popup
    function closeGameOverPopup() {
        gameOverEl.classList.remove('show');
        // If the user won, mark the win state as closed so they can see the categories
        if (gameState.foundGroups.length === 4) {
            localStorage.setItem('sinnections_winPopupClosed', 'true');
        }
    }

    async function fetchJson(url){
        var res = await fetch(url);
        return res.json();
    }

    async function init(){
        const results = await Promise.all([
            fetchJson(STRINGS_URL),
            fetchJson(PUZZLE_URL)
        ]);
        STR = results[0];
        gameData = results[1];

        // Event listeners
        shuffleBtn.addEventListener('click', shuffleWords);
        deselectBtn.addEventListener('click', deselectAll);
        submitBtn.addEventListener('click', submitGuess);
        playAgainBtn.addEventListener('click', () => {
            // If cooldown just ended, clear all saved data first
            if (!isInCooldown()) {
                localStorage.removeItem('sinnections_lastAttemptTime');
                clearSavedGameState();
                localStorage.removeItem('sinnections_attempts');
                localStorage.removeItem('sinnections_winPopupClosed');
                // Clear word subsets when starting a new game after win/cooldown
                clearWordSubsets();
                gameOverEl.classList.remove('show');
            }
            initGame();
        });
        document.getElementById('helpIcon').addEventListener('click', showHowToPlayPopup);
        document.getElementById('gameOverCloseBtn').addEventListener('click', closeGameOverPopup);
        document.getElementById('earlyAccessCloseBtn').addEventListener('click', closeEarlyAccessPopup);
        document.getElementById('earlyAccessUnderstoodBtn').addEventListener('click', closeEarlyAccessPopup);
        document.getElementById('howToPlayCloseBtn').addEventListener('click', closeHowToPlayPopup);

        // Initialize game on load
        initGame();
    }

    init();

})();
