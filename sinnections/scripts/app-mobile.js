(function(){

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
    const NEXT_PUZZLES_ENABLED = true;

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
        previousGuesses: new Set(),
        lastAttemptTime: null,
        timerInterval: null,
        attempts: [],
        wordSubsets: {}
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
                return;
            }

            const stateToSave = {
                words: gameState.words || [],
                selectedWords: gameState.selectedWords || [],
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

            if (!state.words || !Array.isArray(state.words) || state.words.length === 0) {
                return false;
            }

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
        const lastAttempt = localStorage.getItem('sinnections_lastAttemptTime');
        if (lastAttempt) {
            const now = new Date().getTime();
            const timeDiff = now - parseInt(lastAttempt);
            if (timeDiff >= COOLDOWN_DURATION) {
                localStorage.removeItem('sinnections_lastAttemptTime');
                clearSavedGameState();
                localStorage.removeItem('sinnections_attempts');
            }
        }

        if (isInCooldown()) {
            const hasLoadedState = loadGameState();

            if (!hasLoadedState) {
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
                gameState.gameOver = true;
            }

            toastEl.className = 'toast';
            updateMistakesDisplay();
            renderWordGrid();
            updateControls();
            showGameOverScreen(false, true);
            return;
        }

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

        const hasLoadedState = loadGameState();

        if (!hasLoadedState) {
            gameState.wordSubsets = getWordSubsets();
            gameState.words = getGameWords();
            shuffleArray(gameState.words);
        }

        // Check if user won and closed popup previously
        const winPopupClosed = localStorage.getItem('sinnections_winPopupClosed');
        const hasWon = gameState.foundGroups.length === 4;

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

    // Render word grid
    function renderWordGrid() {
        const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
        const remainingWords = gameState.words.filter(word => !foundWords.has(word));
        const selectedWordsSet = new Set(gameState.selectedWords);

        const fragment = document.createDocumentFragment();

        gameState.foundGroups.forEach((group, index) => {
            const groupBlock = document.createElement('div');
            groupBlock.className = `group-block ${group.color}`;

            groupBlock.innerHTML = `
                <div class="group-category">${group.category}</div>
                <div class="group-words">${group.words.join(', ')}</div>
            `;

            fragment.appendChild(groupBlock);
        });

        remainingWords.forEach(word => {
            const tile = document.createElement('div');
            tile.className = `word-tile${selectedWordsSet.has(word) ? ' selected' : ''}`;
            tile.textContent = word;
            tile.addEventListener('click', () => selectWord(word), { passive: true });

            fragment.appendChild(tile);
        });

        wordGrid.innerHTML = '';
        wordGrid.appendChild(fragment);
    }

    // Select/deselect word
    function selectWord(word) {
        if (gameState.gameOver) return;

        const isFound = gameState.foundGroups.some(group =>
            group.words.includes(word)
        );
        if (isFound) return;

        const index = gameState.selectedWords.indexOf(word);

        if (index > -1) {
            gameState.selectedWords.splice(index, 1);
        } else if (gameState.selectedWords.length < 4) {
            gameState.selectedWords.push(word);
        }

        saveGameState(); // Save state when selections change
        renderWordGrid();
        updateControls();
    }

    // Update control buttons
    function updateControls() {
        submitBtn.disabled = gameState.selectedWords.length !== 4;
        deselectBtn.disabled = gameState.selectedWords.length === 0;
        shuffleBtn.disabled = gameState.gameOver || gameState.mistakes >= gameState.maxMistakes || gameState.foundGroups.length === 4;
    }

    // Shuffle words
    function shuffleWords() {
        const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
        const remainingWords = gameState.words.filter(word => !foundWords.has(word));

        shuffleArray(remainingWords);

        gameState.words = [
            ...gameState.foundGroups.flatMap(group => group.words),
            ...remainingWords
        ];

        // DON'T clear selected words when shuffling

        requestAnimationFrame(() => {
            wordGrid.innerHTML = '';
            renderWordGrid();
            updateControls();
        });
    }

    // Deselect all words
    function deselectAll() {
        gameState.selectedWords = [];
        saveGameState(); // Save state when clearing selections
        renderWordGrid();
        updateControls();
    }

    // Submit guess
    function submitGuess() {
        if (gameState.selectedWords.length !== 4) return;

        const sortedGuess = [...gameState.selectedWords].sort().join(',');

        if (gameState.previousGuesses.has(sortedGuess)) {
            showToast(STR.toast.alreadyGuessed);
            gameState.selectedWords = [];
            saveGameState(); // Save state after clearing selections
            renderWordGrid();
            updateControls();
            return;
        }

        const correctGroup = gameData.groups.find(group => {
            const groupSubset = gameState.wordSubsets[group.category] || group.words;
            return gameState.selectedWords.every(word => groupSubset.includes(word)) &&
                   groupSubset.every(word => gameState.selectedWords.includes(word)) &&
                   gameState.selectedWords.length === 4;
        });

        if (correctGroup) {
            animateCorrectGuess(correctGroup);
        } else {
            gameState.previousGuesses.add(sortedGuess);

            const selectedColors = gameState.selectedWords.map(word => {
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

            const selectedTiles = document.querySelectorAll('.word-tile.selected');
            selectedTiles.forEach(tile => {
                tile.classList.add('incorrect-guess');
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        tile.classList.remove('incorrect-guess');
                    }, 400);
                });
            });

            gameState.mistakes++;

            updateMistakesDisplay();
            saveGameState(); // Save state after incorrect guess

            if (gameState.mistakes >= gameState.maxMistakes) {
                localStorage.setItem('sinnections_lastAttemptTime', new Date().getTime().toString());
                saveGameState();
                endGame(false);
            }
        }

        updateControls();
    }

    // Animate correct guess - exact copy from desktop
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
        const allRemainingTiles = grid.querySelectorAll('.word-tile:not(.selected)');
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
        wordsEl.textContent = (gameState.wordSubsets[correctGroup.category] || correctGroup.words).join(', ');

        groupBlock.appendChild(categoryEl);
        groupBlock.appendChild(wordsEl);

        // Insert at the correct position
        const firstTile = grid.querySelector('.word-tile');

        if (firstTile) {
            grid.insertBefore(groupBlock, firstTile);
        } else {
            grid.appendChild(groupBlock);
        }

        // Re-enable transitions after a frame
        requestAnimationFrame(() => {
            allRemainingTiles.forEach(tile => {
                if (tile.parentNode) { // Check if tile still exists
                    tile.style.transition = '';
                }
            });
        });

        // Clean up the new-group class after animation
        setTimeout(() => {
            groupBlock.classList.remove('new-group');
        }, 500);

        updateControls();
        saveGameState();

        if (gameState.foundGroups.length === 4) {
            clearSavedGameState();
            clearWordSubsets();
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

        const existingGrids = gameOverEl.querySelectorAll('.attempts-grid, .completion-grid');
        existingGrids.forEach(grid => grid.remove());

        const closeBtn = gameOverEl.querySelector('.close-btn');
        if (won || !fromCooldown) {
            closeBtn.style.display = 'block';
        } else {
            closeBtn.style.display = 'none';
        }

        if (won) {
            gameOverTitle.textContent = STR.gameOver.win.title;
            gameOverMessage.textContent = STR.gameOver.win.message;
            playAgainBtn.disabled = false;
            playAgainBtn.textContent = STR.playAgainBtn.ready;
            cooldownTimer.textContent = '';
            localStorage.setItem('sinnections_completed', 'true');
        } else {
            gameOverTitle.textContent = STR.gameOver.lose.title;
            gameOverMessage.textContent = STR.gameOver.lose.message;
            playAgainBtn.textContent = STR.playAgainBtn.ready;

            if (fromCooldown) {
                playAgainBtn.disabled = true;
                updateCooldownTimer();
                gameState.timerInterval = setInterval(updateCooldownTimer, 1000);
            } else {
                playAgainBtn.disabled = true;
                updateCooldownTimer();
                gameState.timerInterval = setInterval(updateCooldownTimer, 1000);
            }
        }

        // Show attempts grid
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

                    cell.style.backgroundColor = bgColor;
                    cell.style.background = bgColor;
                    cell.setAttribute('data-color', color);
                    cell.setAttribute('data-bg-color', bgColor);

                    const globalCellIndex = rowIndex * 4 + cellIndex;
                    const totalCells = gameState.attempts.length * 4;

                    if (globalCellIndex >= totalCells - 4) {
                        const lastRowLinks = [atob('c29ubmVjdGlvbnMuaHRtbA=='), '', '', ''];
                        const lastRowIndex = globalCellIndex - (totalCells - 4);

                        cell.style.cursor = 'pointer';
                        cell.addEventListener('click', () => {
                            const link = lastRowLinks[lastRowIndex];

                            if (!NEXT_PUZZLES_ENABLED) {
                                showEarlyAccessPopup();
                            } else {
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

        const solvedGroups = gameState.foundGroups;

        wordGrid.innerHTML = '';

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

        gameOverEl.className = 'game-over show';

        requestAnimationFrame(() => {
            const attemptsGrid = gameOverEl.querySelector('.attempts-grid');
            if (attemptsGrid) {
                attemptsGrid.style.display = 'grid';
                const attemptCells = attemptsGrid.querySelectorAll('.attempt-cell');
                attemptCells.forEach(cell => {
                    cell.style.cssText = 'opacity: 1; transform: scale(1);';
                });
            }
        });
    }

    // Add victory shake to the last row of attempts grid (mobile version)
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
                        // Add victory shake to each cell in the last row
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

    // End game
    function endGame(won) {
        showGameOverScreen(won);

        if (won) {
            // Add victory shake to the last row of attempts grid after screen is shown
            setTimeout(() => {
                addVictoryShake();
            }, 200);
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
            if (!isInCooldown()) {
                localStorage.removeItem('sinnections_lastAttemptTime');
                clearSavedGameState();
                localStorage.removeItem('sinnections_attempts');
                localStorage.removeItem('sinnections_winPopupClosed');
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
