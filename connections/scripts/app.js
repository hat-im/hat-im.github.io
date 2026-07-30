(function(){

    // Mobile redirect - redirect to mobile version if on mobile device
    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768 && window.innerHeight <= 1024);
    }

    if (isMobile()) {
        window.location.href = 'connections-mobile.html';
    }

    var BASE = 'connections/';
    var STRINGS_URL = BASE + 'strings.json';
    var LEVELS_URL = BASE + 'data/levels.json';

    // Cooldown duration in milliseconds
    const COOLDOWN_DURATION = 3600000; // 1 hour (3600000ms)

    // UI copy (loaded from strings.json)
    let STR = null;

    // Ordered level ids (loaded from data/levels.json), e.g. ["sinnections", "hailnections"]
    let levels = [];
    let currentLevelIndex = 0;
    let completedLevels = new Set();
    let levelDataCache = {};

    // Game data for the currently loaded level (from data/<levelId>.json)
    let gameData = null;

    // How the current level's tiles are presented: 'text' | 'audio' | 'color' | 'image'
    let tileType = 'text';
    // Word -> media value for the current level (audio file path, swatch color, or image path)
    let wordMedia = {};

    function fmt(template, vars){
        return template.replace(/\{(\w+)\}/g, function(_, key){ return vars[key]; });
    }

    function currentLevelId() {
        return levels[currentLevelIndex];
    }

    // Namespaced localStorage key for the currently loaded level
    function levelKey(name) {
        return 'connections_' + name + '_' + currentLevelId();
    }

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
        wordSubsets: {}, // Track selected word subsets for each category
        audioInstances: new Map(), // word -> currently playing Audio instance (audio levels only)
        playButtonsShown: false, // Whether play buttons have been revealed yet (audio levels only)
        firstSelectionMade: false // Whether the first tile selection has happened (audio levels only)
    };

    // Build the word -> media map (audio file / swatch / image) for the current level
    function buildWordMedia() {
        const map = {};
        if (tileType === 'text') return map;

        const mediaKey = tileType === 'audio' ? 'audioFiles'
            : tileType === 'color' ? 'swatches'
            : tileType === 'image' ? 'images'
            : null;
        if (!mediaKey) return map;

        gameData.groups.forEach(group => {
            const mediaArr = group[mediaKey] || [];
            group.words.forEach((word, index) => {
                map[word] = mediaArr[index];
            });
        });

        return map;
    }

    // Audio management (audio levels only)
    function playSound(word, audioFile) {
        if (!audioFile) return;
        try {
            if (gameState.audioInstances.has(word)) {
                const existingAudio = gameState.audioInstances.get(word);
                existingAudio.pause();
                existingAudio.currentTime = 0;
            }

            const audio = new Audio(audioFile);
            audio.volume = 0.7;

            gameState.audioInstances.set(word, audio);

            audio.addEventListener('play', () => {
                updatePlayButtonState(word, 'playing');
            });
            audio.addEventListener('ended', () => {
                updatePlayButtonState(word, 'stopped');
                gameState.audioInstances.delete(word);
            });
            audio.addEventListener('pause', () => {
                updatePlayButtonState(word, 'stopped');
            });

            audio.play().catch(e => {
                console.warn('Could not play audio:', audioFile, e);
                updatePlayButtonState(word, 'stopped');
            });
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }

    function stopSound(word) {
        if (gameState.audioInstances.has(word)) {
            const audio = gameState.audioInstances.get(word);
            audio.pause();
            audio.currentTime = 0;
            updatePlayButtonState(word, 'stopped');
            gameState.audioInstances.delete(word);
        }
    }

    function stopAllSounds() {
        gameState.audioInstances.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        gameState.audioInstances.clear();
    }

    function updatePlayButtonState(word, state) {
        const tiles = wordGrid.querySelectorAll('.word-tile');
        tiles.forEach(tile => {
            const hiddenWordEl = tile.querySelector('.hidden-word');
            const playButton = tile.querySelector('.play-button');
            if (hiddenWordEl && hiddenWordEl.textContent === word && playButton) {
                if (state === 'playing') {
                    playButton.innerHTML = '⏸';
                    playButton.classList.add('playing');
                } else {
                    playButton.innerHTML = '▶';
                    playButton.classList.remove('playing');
                }
            }
        });
    }

    // Build a tile element for `word`, presented according to the current level's tileType
    function createTile(word) {
        const tile = document.createElement('div');
        tile.className = 'word-tile';

        if (tileType === 'text') {
            tile.textContent = word;
            return tile;
        }

        if (tileType === 'audio') {
            const playButton = document.createElement('button');
            playButton.className = 'play-button';
            playButton.innerHTML = '▶';
            playButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (gameState.audioInstances.has(word)) {
                    stopSound(word);
                } else {
                    playSound(word, wordMedia[word]);
                }
            });
            tile.appendChild(playButton);
        } else if (tileType === 'color') {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = wordMedia[word] || 'transparent';
            tile.appendChild(swatch);
        } else if (tileType === 'image') {
            const img = document.createElement('img');
            img.className = 'tile-image';
            img.src = wordMedia[word] || '';
            img.alt = '';
            img.draggable = false;
            tile.appendChild(img);
        }

        const hiddenWord = document.createElement('span');
        hiddenWord.className = 'hidden-word';
        hiddenWord.textContent = word;
        tile.appendChild(hiddenWord);

        return tile;
    }

    // DOM elements
    const wordGrid = document.getElementById('wordGrid');
    const toastEl = document.getElementById('toast');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const deselectBtn = document.getElementById('deselectBtn');
    const submitBtn = document.getElementById('submitBtn');
    const previousBtn = document.getElementById('previousBtn');
    const nextBtn = document.getElementById('nextBtn');
    const gameOverEl = document.getElementById('gameOver');
    const gameOverTitle = document.getElementById('gameOverTitle');
    const gameOverMessage = document.getElementById('gameOverMessage');
    const cooldownTimer = document.getElementById('cooldownTimer');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const timerSection = document.getElementById('timerSection');
    const timerEl = document.getElementById('timer');

    // Check if user is in cooldown period (cooldown is scoped to whichever level was lost)
    function isInCooldown() {
        const lastAttempt = localStorage.getItem('connections_lastAttemptTime');
        const cooldownLevel = localStorage.getItem('connections_cooldownLevel');
        if (!lastAttempt || cooldownLevel !== currentLevelId()) return false;

        const now = new Date().getTime();
        const timeDiff = now - parseInt(lastAttempt);
        return timeDiff < COOLDOWN_DURATION;
    }

    // Update cooldown timer display
    function updateCooldownTimer() {
        const lastAttempt = localStorage.getItem('connections_lastAttemptTime');
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

    // Save/load progress across levels (which level we're on, which are completed)
    function saveProgress() {
        try {
            localStorage.setItem('connections_progress', JSON.stringify({
                currentLevelIndex: currentLevelIndex,
                completedLevels: Array.from(completedLevels)
            }));
        } catch (e) {
            console.warn('Failed to save progress:', e);
        }
    }

    function loadProgress() {
        try {
            const saved = localStorage.getItem('connections_progress');
            if (!saved) return;
            const progress = JSON.parse(saved);
            if (typeof progress.currentLevelIndex === 'number') {
                currentLevelIndex = progress.currentLevelIndex;
            }
            completedLevels = new Set(progress.completedLevels || []);
        } catch (e) {
            console.warn('Failed to load progress:', e);
        }
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
                playButtonsShown: gameState.playButtonsShown || false,
                firstSelectionMade: gameState.firstSelectionMade || false,
                timestamp: Date.now()
            };
            localStorage.setItem(levelKey('gameState'), JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Failed to save game state:', e);
        }
    }

    // Load game state with validation
    function loadGameState() {
        try {
            const savedState = localStorage.getItem(levelKey('gameState'));
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
            gameState.playButtonsShown = state.playButtonsShown || false;
            gameState.firstSelectionMade = state.firstSelectionMade || false;
            gameState.gameOver = false;
            gameState.lastAttemptTime = null;
            gameState.timerInterval = null;
            gameState.audioInstances = new Map();

            if (gameState.playButtonsShown) {
                wordGrid.classList.add('show-play-buttons');
            }

            return true;
        } catch (e) {
            console.warn('Failed to load game state:', e);
            localStorage.removeItem(levelKey('gameState'));
            return false;
        }
    }

    // Clear saved game state
    function clearSavedGameState() {
        try {
            localStorage.removeItem(levelKey('gameState'));
        } catch (e) {
            console.warn('Failed to clear game state:', e);
        }
    }

    // Initialize game for the currently loaded level
    function initGame() {
        stopAllSounds();
        wordGrid.classList.remove('show-play-buttons');

        // Check if cooldown has expired and clean up if needed
        const lastAttempt = localStorage.getItem('connections_lastAttemptTime');
        const cooldownLevel = localStorage.getItem('connections_cooldownLevel');
        if (lastAttempt && cooldownLevel === currentLevelId()) {
            const now = new Date().getTime();
            const timeDiff = now - parseInt(lastAttempt);
            if (timeDiff >= COOLDOWN_DURATION) {
                localStorage.removeItem('connections_lastAttemptTime');
                localStorage.removeItem('connections_cooldownLevel');
                clearSavedGameState();
            }
        }

        // NOW check cooldown (after cleanup)
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
                    wordSubsets: getWordSubsets(),
                    audioInstances: new Map(),
                    playButtonsShown: false,
                    firstSelectionMade: false
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
            wordSubsets: {},
            audioInstances: new Map(),
            playButtonsShown: false,
            firstSelectionMade: false
        };

        const hasLoadedState = loadGameState();

        if (!hasLoadedState) {
            gameState.wordSubsets = getWordSubsets();
            gameState.words = getGameWords();
            shuffleArray(gameState.words);
        }

        const winPopupClosed = localStorage.getItem(levelKey('winPopupClosed'));
        const hasWon = gameState.foundGroups.length === 4;

        toastEl.className = 'toast';
        gameOverEl.className = 'game-over';
        updateMistakesDisplay();
        renderWordGrid();
        updateControls();

        if (hasWon) {
            if (winPopupClosed === 'true') {
                gameState.gameOver = true;
            } else {
                gameState.gameOver = true;
                showGameOverScreen(true);
            }
        }
    }

    // Get or create word subsets for categories with more than 4 words
    function getWordSubsets() {
        const savedSubsets = localStorage.getItem(levelKey('wordSubsets'));
        if (savedSubsets) {
            try {
                return JSON.parse(savedSubsets);
            } catch (e) {
                console.warn('Failed to load word subsets:', e);
            }
        }

        const subsets = {};
        gameData.groups.forEach(group => {
            if (group.words.length > 4) {
                const shuffledWords = [...group.words];
                shuffleArray(shuffledWords);
                subsets[group.category] = shuffledWords.slice(0, 4);
            } else {
                subsets[group.category] = [...group.words];
            }
        });

        try {
            localStorage.setItem(levelKey('wordSubsets'), JSON.stringify(subsets));
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
            localStorage.removeItem(levelKey('wordSubsets'));
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
    function tileWord(tile) {
        const hiddenWordEl = tile.querySelector('.hidden-word');
        return hiddenWordEl ? hiddenWordEl.textContent : tile.textContent;
    }

    function renderWordGrid() {
        const currentTiles = wordGrid.querySelectorAll('.word-tile');
        const currentWords = Array.from(currentTiles).map(tileWord);

        const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
        const remainingWords = gameState.words.filter(word => !foundWords.has(word));
        const selectedWordsSet = new Set(gameState.selectedWords);

        if (currentWords.length === remainingWords.length &&
            currentWords.every((word, index) => word === remainingWords[index])) {
            currentTiles.forEach(tile => {
                tile.classList.toggle('selected', selectedWordsSet.has(tileWord(tile)));
            });
        } else {
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
                const tile = createTile(word);
                if (selectedWordsSet.has(word)) tile.classList.add('selected');
                tile.addEventListener('click', () => selectWord(word), { passive: true });

                fragment.appendChild(tile);
            });

            wordGrid.innerHTML = '';
            wordGrid.appendChild(fragment);
        }
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
            if (tileType === 'audio' && !gameState.firstSelectionMade) {
                playSound(word, wordMedia[word]);
                gameState.firstSelectionMade = true;
            }
        }

        if (tileType === 'audio' && gameState.selectedWords.length > 0 && !gameState.playButtonsShown) {
            wordGrid.classList.add('show-play-buttons');
            gameState.playButtonsShown = true;
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

    // Update Previous/Next level buttons, mirroring mini-crossword's session navigation
    function updateNavButtons() {
        if (!previousBtn || !nextBtn) return;

        previousBtn.disabled = currentLevelIndex === 0;

        const isCurrentCompleted = completedLevels.has(currentLevelId());
        const isLastLevel = currentLevelIndex >= levels.length - 1;
        nextBtn.disabled = !isCurrentCompleted || isLastLevel;
    }

    async function loadLevel(index) {
        currentLevelIndex = Math.max(0, Math.min(index, levels.length - 1));
        const levelId = currentLevelId();

        if (!levelDataCache[levelId]) {
            levelDataCache[levelId] = await fetchJson(BASE + 'data/' + levelId + '.json');
        }
        gameData = levelDataCache[levelId];
        tileType = gameData.tileType || 'text';
        wordMedia = buildWordMedia();

        saveProgress();
        initGame();
        updateNavButtons();
    }

    function goToNextLevel() {
        if (currentLevelIndex < levels.length - 1 && completedLevels.has(currentLevelId())) {
            loadLevel(currentLevelIndex + 1);
        }
    }

    function goToPreviousLevel() {
        if (currentLevelIndex > 0) {
            loadLevel(currentLevelIndex - 1);
        }
    }

    // Shuffle words with optimized performance
    function shuffleWords() {
        const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
        const remainingWords = gameState.words.filter(word => !foundWords.has(word));

        shuffleArray(remainingWords);

        gameState.words = [
            ...gameState.foundGroups.flatMap(group => group.words),
            ...remainingWords
        ];

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

        const sortedGuess = [...gameState.selectedWords].sort().join(',');

        if (gameState.previousGuesses.has(sortedGuess)) {
            showToast(STR.toast.alreadyGuessed);
            gameState.selectedWords = [];
            saveGameState();
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
            saveGameState();
            renderWordGrid();

            if (gameState.mistakes >= gameState.maxMistakes) {
                localStorage.setItem('connections_lastAttemptTime', new Date().getTime().toString());
                localStorage.setItem('connections_cooldownLevel', currentLevelId());
                saveGameState();
                endGame(false);
            }
        }

        updateControls();
    }

    async function animateCorrectGuess(correctGroup) {
        const selectedTiles = Array.from(document.querySelectorAll('.word-tile.selected'));

        const hopPromises = selectedTiles.map((tile, i) => {
            return new Promise(resolve => {
                setTimeout(() => {
                    tile.classList.add('hop');
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

        const grid = document.getElementById('wordGrid');
        const gridRect = grid.getBoundingClientRect();
        const allTiles = Array.from(grid.querySelectorAll('.word-tile'));

        const targetRowIndex = gameState.foundGroups.length;

        const targetPositions = [];
        const tileHeight = selectedTiles[0].offsetHeight;
        const tileWidth = selectedTiles[0].offsetWidth;
        const gap = 8;

        for (let col = 0; col < 4; col++) {
            const x = gridRect.left + col * (tileWidth + gap);
            const y = gridRect.top + targetRowIndex * (tileHeight + gap);
            targetPositions.push({ x, y });
        }

        const tilesToDisplace = [];
        const swapAnimations = [];

        const tilesInTargetRow = allTiles.filter(tile => {
            if (tile.classList.contains('selected')) return false;

            const tileRect = tile.getBoundingClientRect();
            const tileRowIndex = Math.round((tileRect.top - gridRect.top) / (tileHeight + gap));

            return tileRowIndex === targetRowIndex;
        });

        tilesToDisplace.push(...tilesInTargetRow);

        selectedTiles.forEach((selectedTile, index) => {
            const selectedRect = selectedTile.getBoundingClientRect();
            const targetPos = targetPositions[index];

            const deltaX = targetPos.x - selectedRect.left;
            const deltaY = targetPos.y - selectedRect.top;

            selectedTile.classList.add('moving');
            selectedTile.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });

        const remainingTiles = allTiles.filter(tile =>
            !tile.classList.contains('selected') &&
            !tilesToDisplace.includes(tile)
        );

        const availablePositions = [];
        for (let row = targetRowIndex + 1; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const x = gridRect.left + col * (tileWidth + gap);
                const y = gridRect.top + row * (tileHeight + gap);
                availablePositions.push({ x, y, row, col });
            }
        }

        const occupiedPositions = new Set();
        remainingTiles.forEach(tile => {
            const tileRect = tile.getBoundingClientRect();
            availablePositions.forEach((pos, index) => {
                if (Math.abs(tileRect.left - pos.x) < 10 && Math.abs(tileRect.top - pos.y) < 10) {
                    occupiedPositions.add(index);
                }
            });
        });

        let assignmentIndex = 0;
        tilesToDisplace.forEach((displacedTile) => {
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

                occupiedPositions.add(assignmentIndex);
                assignmentIndex++;
            }
        });

        await new Promise(resolve => setTimeout(resolve, 600));

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

        selectedTiles.forEach(tile => {
            tile.classList.remove('moving', 'selected');
            tile.style.transform = '';
        });

        swapAnimations.forEach(({ targetTile }) => {
            targetTile.classList.remove('moving');
            targetTile.style.transform = '';
        });

        await new Promise(resolve => requestAnimationFrame(resolve));

        const allRemainingTiles = wordGrid.querySelectorAll('.word-tile:not(.selected)');
        allRemainingTiles.forEach(tile => {
            tile.style.transition = 'none';
        });

        selectedTiles.forEach(tile => {
            tile.remove();
        });

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

        const firstTile = wordGrid.querySelector('.word-tile');

        if (firstTile) {
            wordGrid.insertBefore(groupBlock, firstTile);
        } else {
            wordGrid.appendChild(groupBlock);
        }

        requestAnimationFrame(() => {
            allRemainingTiles.forEach(tile => {
                if (tile.parentNode) {
                    tile.style.transition = '';
                }
            });
        });

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

            completedLevels.add(currentLevelId());
            saveProgress();
            updateNavButtons();
            if (levels.every(id => completedLevels.has(id))) {
                localStorage.setItem('connections_completed', 'true');
            }
        } else {
            gameOverTitle.textContent = STR.gameOver.lose.title;
            gameOverMessage.textContent = STR.gameOver.lose.message;
            playAgainBtn.textContent = STR.playAgainBtn.ready;

            playAgainBtn.disabled = true;
            updateCooldownTimer();
            gameState.timerInterval = setInterval(updateCooldownTimer, 1000);
        }

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

        if (!won) {
            const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
            const remainingWords = gameState.words.filter(word => !foundWords.has(word));

            remainingWords.forEach(word => {
                const tile = createTile(word);
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

    // End game
    function endGame(won) {
        showGameOverScreen(won);

        if (won) {
            setTimeout(() => {
                addVictoryShake();
            }, 200);
        }
    }

    // Add victory shake to the last row of attempts grid
    function addVictoryShake() {
        const checkForGrid = () => {
            const attemptsGrid = gameOverEl.querySelector('.attempts-grid');

            if (attemptsGrid && gameState.attempts.length > 0) {
                const attemptCells = attemptsGrid.querySelectorAll('.attempt-cell');

                const expectedCells = gameState.attempts.length * 4;

                if (attemptCells.length >= expectedCells && attemptCells.length >= 4) {
                    const lastRowCells = Array.from(attemptCells).slice(-4);

                    const allVisible = lastRowCells.every(cell => {
                        const style = window.getComputedStyle(cell);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    });

                    if (allVisible) {
                        lastRowCells.forEach((cell, index) => {
                            cell.classList.add('victory-shake');

                            const shakeAnimations = ['subtle-shake-1', 'subtle-shake-2', 'subtle-shake-3', 'subtle-shake-4'];
                            const randomAnimation = shakeAnimations[Math.floor(Math.random() * shakeAnimations.length)];

                            const randomDuration = (1.5 + Math.random()).toFixed(1);
                            const randomDelay = (Math.random() * 0.5).toFixed(2);

                            cell.style.animation = `${randomAnimation} ${randomDuration}s ease-in-out infinite`;
                            cell.style.animationDelay = `${randomDelay}s`;
                        });

                        return true;
                    }
                }
            }
            return false;
        };

        if (!checkForGrid()) {
            let attempts = 0;
            const maxAttempts = 10;

            const tryAgain = () => {
                attempts++;
                if (checkForGrid() || attempts >= maxAttempts) {
                    return;
                }
                setTimeout(tryAgain, 200);
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
        if (gameState.foundGroups.length === 4) {
            localStorage.setItem(levelKey('winPopupClosed'), 'true');
        }
    }

    async function fetchJson(url){
        var res = await fetch(url);
        return res.json();
    }

    async function init(){
        const results = await Promise.all([
            fetchJson(STRINGS_URL),
            fetchJson(LEVELS_URL)
        ]);
        STR = results[0];
        levels = results[1];

        loadProgress();
        if (currentLevelIndex < 0 || currentLevelIndex >= levels.length) {
            currentLevelIndex = 0;
        }

        // Event listeners
        shuffleBtn.addEventListener('click', shuffleWords);
        deselectBtn.addEventListener('click', deselectAll);
        submitBtn.addEventListener('click', submitGuess);
        if (previousBtn) previousBtn.addEventListener('click', goToPreviousLevel);
        if (nextBtn) nextBtn.addEventListener('click', goToNextLevel);
        playAgainBtn.addEventListener('click', () => {
            if (!isInCooldown()) {
                localStorage.removeItem('connections_lastAttemptTime');
                localStorage.removeItem('connections_cooldownLevel');
                clearSavedGameState();
                localStorage.removeItem(levelKey('winPopupClosed'));
                clearWordSubsets();
                gameOverEl.classList.remove('show');
            }
            initGame();
        });
        document.getElementById('helpIcon').addEventListener('click', showHowToPlayPopup);
        document.getElementById('gameOverCloseBtn').addEventListener('click', closeGameOverPopup);
        document.getElementById('howToPlayCloseBtn').addEventListener('click', closeHowToPlayPopup);

        // Load whichever level the user was on (or the first one)
        await loadLevel(currentLevelIndex);
    }

    init();

})();
