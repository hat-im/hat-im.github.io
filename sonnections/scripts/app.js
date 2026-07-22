        // Mobile redirect - redirect to mobile version if on mobile device
        function isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                   (window.innerWidth <= 768 && window.innerHeight <= 1024);
        }
        
        if (isMobile()) {
            window.location.href = 'sonnections-mobile.html';
        }
        
        // Game data (loaded from sonnections/data/puzzle.json)
        const DATA_URL = 'sonnections/data/puzzle.json';
        let gameData = null;

        // Flag to control next puzzle access
        const NEXT_PUZZLES_ENABLED = true; // Set to true to enable all next puzzles
        
        // Cooldown duration in milliseconds
        const COOLDOWN_DURATION = 3600000; // 1 hour (3600000ms)
        
        // Game state
        let gameState = {
            words: [],
            wordToAudio: new Map(), // Map words to their audio files
            audioInstances: new Map(), // Map words to their audio instances
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
            playButtonsShown: false, // Track if play buttons have been shown
            firstSelectionMade: false // Track if first selection has been made
        };

        // Audio management
        function playSound(word, audioFile) {
            try {
                // Stop any currently playing audio for this word
                if (gameState.audioInstances.has(word)) {
                    const existingAudio = gameState.audioInstances.get(word);
                    existingAudio.pause();
                    existingAudio.currentTime = 0;
                }
                
                const audio = new Audio(audioFile);
                audio.volume = 0.7;
                
                // Store the audio instance
                gameState.audioInstances.set(word, audio);
                
                // Update button state when audio starts playing
                audio.addEventListener('play', () => {
                    updatePlayButtonState(word, 'playing');
                });
                
                // Update button state when audio ends
                audio.addEventListener('ended', () => {
                    updatePlayButtonState(word, 'stopped');
                    gameState.audioInstances.delete(word);
                });
                
                // Update button state when audio is paused
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
        
        function updatePlayButtonState(word, state) {
            const tiles = document.querySelectorAll('.word-tile');
            tiles.forEach(tile => {
                const hiddenWordEl = tile.querySelector('.hidden-word');
                const playButton = tile.querySelector('.play-button');
                if (hiddenWordEl && hiddenWordEl.textContent === word && playButton) {
                    if (state === 'playing') {
                        playButton.innerHTML = '⏸'; // Pause/stop symbol
                        playButton.classList.add('playing');
                    } else {
                        playButton.innerHTML = '▶'; // Play symbol
                        playButton.classList.remove('playing');
                    }
                }
            });
        }

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
            const lastAttempt = localStorage.getItem('sonnections_lastAttemptTime');
            if (!lastAttempt) return false;

            const now = new Date().getTime();
            const timeDiff = now - parseInt(lastAttempt);
            return timeDiff < COOLDOWN_DURATION;
        }

        // Update cooldown timer display
        function updateCooldownTimer() {
            const lastAttempt = localStorage.getItem('sonnections_lastAttemptTime');
            if (!lastAttempt) return;

            const now = new Date().getTime();
            const timeDiff = now - parseInt(lastAttempt);
            const timeLeft = Math.max(COOLDOWN_DURATION - timeDiff, 0);

            if (timeLeft === 0) {
                cooldownTimer.textContent = 'You can now play again!';
                playAgainBtn.disabled = false;
                playAgainBtn.textContent = 'Play Again';
                clearInterval(gameState.timerInterval);
                // Don't auto-close popup - let user click Play Again button
                return;
            }

            const hours = Math.floor(timeLeft / 3600000);
            const minutes = Math.floor((timeLeft % 3600000) / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);

            cooldownTimer.textContent = `Next game available in: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            playAgainBtn.disabled = true;
            playAgainBtn.textContent = 'Please Wait';
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
        
        // Close game over popup
        function closeGameOverPopup() {
            const popup = document.getElementById('gameOver');
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
                    selectedWords: gameState.selectedWords || [],
                    foundGroups: gameState.foundGroups || [],
                    completionOrder: gameState.completionOrder || [],
                    mistakes: gameState.mistakes || 0,
                    maxMistakes: gameState.maxMistakes || 4,
                    previousGuesses: Array.from(gameState.previousGuesses || []),
                    attempts: gameState.attempts || [],
                    playButtonsShown: gameState.playButtonsShown || false,
                    firstSelectionMade: gameState.firstSelectionMade || false,
                    timestamp: Date.now()
                };
                localStorage.setItem('sonnections_gameState', JSON.stringify(stateToSave));
            } catch (e) {
                console.warn('Failed to save game state:', e);
            }
        }
        
        // Load game state with validation
        function loadGameState() {
            try {
                const savedState = localStorage.getItem('sonnections_gameState');
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
                gameState.playButtonsShown = state.playButtonsShown || false;
                gameState.firstSelectionMade = state.firstSelectionMade || false;
                gameState.gameOver = false;
                gameState.lastAttemptTime = null;
                gameState.timerInterval = null;
                gameState.audioInstances = new Map();
                gameState.wordToAudio = new Map();
                
                return true;
            } catch (e) {
                console.warn('Failed to load game state:', e);
                localStorage.removeItem('sonnections_gameState');
                return false;
            }
        }
        
        // Clear saved game state
        function clearSavedGameState() {
            localStorage.removeItem('sonnections_gameState');
        }

        // Initialize game
        function initGame() {
            // Check if cooldown has expired and clean up if needed
            const lastAttempt = localStorage.getItem('sonnections_lastAttemptTime');
            if (lastAttempt) {
                const now = new Date().getTime();
                const timeDiff = now - parseInt(lastAttempt);
                if (timeDiff >= COOLDOWN_DURATION) {
                    // Cooldown has expired - clear all saved data for fresh start
                    localStorage.removeItem('sonnections_lastAttemptTime');
                    clearSavedGameState();
                    localStorage.removeItem('sonnections_lastAttempts');
                }
            }
            
            // NOW check cooldown (after cleanup)
            if (isInCooldown()) {
                // Try to load the saved game state from when they lost
                const hasLoadedState = loadGameState();
                
                if (!hasLoadedState) {
                    // Fallback if no saved state - create basic game state
                    gameState = {
                        words: [],
                        wordToAudio: new Map(),
                        audioInstances: new Map(),
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
                        playButtonsShown: false,
                        firstSelectionMade: false
                    };
                    // Create word-to-audio mapping
                    gameData.groups.forEach(group => {
                        group.words.forEach((word, index) => {
                            gameState.words.push(word);
                            gameState.wordToAudio.set(word, group.audioFiles[index]);
                        });
                    });
                    shuffleArray(gameState.words);
                } else {
                    // Use loaded state but ensure game is marked as over and rebuild audio mapping
                    gameState.gameOver = true;
                    gameData.groups.forEach(group => {
                        group.words.forEach((word, index) => {
                            gameState.wordToAudio.set(word, group.audioFiles[index]);
                        });
                    });
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
                wordToAudio: new Map(),
                audioInstances: new Map(),
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
                playButtonsShown: false,
                firstSelectionMade: false
            };
            
            // Try to load existing game state
            const hasLoadedState = loadGameState();
            
            if (!hasLoadedState) {
                // Create new game - flatten all words and shuffle, also create word-to-audio mapping
                gameState.words = [];
                gameData.groups.forEach(group => {
                    group.words.forEach((word, index) => {
                        gameState.words.push(word);
                        gameState.wordToAudio.set(word, group.audioFiles[index]);
                    });
                });
                shuffleArray(gameState.words);
            } else {
                // If we loaded state, rebuild the word-to-audio mapping
                gameData.groups.forEach(group => {
                    group.words.forEach((word, index) => {
                        gameState.wordToAudio.set(word, group.audioFiles[index]);
                    });
                });
            }

            // Clear saved attempts when starting new game
            localStorage.removeItem('sonnections_lastAttempts');

            // Reset UI
            toastEl.className = 'toast';
            gameOverEl.className = 'game-over';
            updateMistakesDisplay();
            renderWordGrid();
            updateControls();
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
            const currentWords = Array.from(currentTiles).map(tile => {
                const hiddenWordElement = tile.querySelector('.hidden-word');
                return hiddenWordElement ? hiddenWordElement.textContent : tile.textContent;
            });
            
            // Get remaining words (not found yet) - use Set for faster lookup
            const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
            const remainingWords = gameState.words.filter(word => !foundWords.has(word));
            const selectedWordsSet = new Set(gameState.selectedWords);
            
            // Update existing tiles if possible (but only if order is also the same)
            if (currentWords.length === remainingWords.length && 
                currentWords.every((word, index) => word === remainingWords[index])) {
                // Just update selection states - words are in same order
                currentTiles.forEach(tile => {
                    const hiddenWordElement = tile.querySelector('.hidden-word');
                    const word = hiddenWordElement ? hiddenWordElement.textContent : tile.textContent;
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
                    
                    // Create play button
                    const playButton = document.createElement('button');
                    playButton.className = 'play-button';
                    playButton.innerHTML = '▶';
                    playButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (gameState.audioInstances.has(word)) {
                            // Audio is playing, stop it
                            stopSound(word);
                        } else {
                            // Audio is not playing, start it
                            playSound(word, gameState.wordToAudio.get(word));
                        }
                    });
                    
                    // Create hidden word element for reference
                    const hiddenWord = document.createElement('span');
                    hiddenWord.className = 'hidden-word';
                    hiddenWord.textContent = word;
                    
                    tile.appendChild(playButton);
                    tile.appendChild(hiddenWord);
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
                // Select word and only play sound on very first selection
                gameState.selectedWords.push(word);
                if (!gameState.firstSelectionMade) {
                    playSound(word, gameState.wordToAudio.get(word));
                    gameState.firstSelectionMade = true;
                }
            }
            
            // Show play buttons when any word is selected for the first time
            if (gameState.selectedWords.length > 0 && !gameState.playButtonsShown) {
                wordGrid.classList.add('show-play-buttons');
                gameState.playButtonsShown = true;
            }
            
            renderWordGrid();
            updateControls();
            saveGameState();
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
            // Don't hide play buttons once they've been shown
            renderWordGrid();
            updateControls();
            saveGameState();
        }

        // Submit guess
        function submitGuess() {
            if (gameState.selectedWords.length !== 4) return;

            // Sort selected words to ensure consistent comparison
            const sortedGuess = [...gameState.selectedWords].sort().join(',');

            // Check if this guess was already tried
            if (gameState.previousGuesses.has(sortedGuess)) {
                showToast('Already guessed');
                gameState.selectedWords = [];
                saveGameState(); // Save state after clearing selections
                // Don't hide play buttons once they've been shown
                renderWordGrid();
                updateControls();
                return;
            }

            // Check if this combination forms a valid group
            const correctGroup = gameData.groups.find(group => 
                gameState.selectedWords.every(word => group.words.includes(word)) &&
                gameState.selectedWords.length === 4
            );

            if (correctGroup) {
                // Animate correct guess sequence
                animateCorrectGuess(correctGroup);
            } else {
                // Add to previous guesses
                gameState.previousGuesses.add(sortedGuess);

                // Find the group that has the most matches with the selected words
                let bestMatch = null;
                let maxMatches = 0;
                gameData.groups.forEach(group => {
                    const matches = gameState.selectedWords.filter(word => 
                        group.words.includes(word)
                    ).length;
                    if (matches > maxMatches) {
                        maxMatches = matches;
                        bestMatch = group;
                    }
                });

                // Track the attempt with colors in order
                const selectedColors = gameState.selectedWords.map(word => {
                    // Find which group this word belongs to
                    const group = gameData.groups.find(g => g.words.includes(word));
                    return group ? group.color : 'gray';
                });
                gameState.attempts.push({
                    words: [...gameState.selectedWords],
                    colors: selectedColors,
                    correct: false
                });

                // Check if "one away" (3 out of 4 words are correct)
                const oneAwayGroup = gameData.groups.find(group => {
                    const matchingWords = gameState.selectedWords.filter(word => 
                        group.words.includes(word)
                    );
                    return matchingWords.length === 3;
                });

                if (oneAwayGroup) {
                    showToast('One away');
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
                // Clear selected words after submitting guess
                gameState.selectedWords = [];
                
                updateMistakesDisplay();
                saveGameState(); // Save state after incorrect guess
                renderWordGrid(); // Re-render to show cleared selections
                
                // Check if game is lost
                if (gameState.mistakes >= gameState.maxMistakes) {
                    // Store the loss time and attempts in localStorage
                    localStorage.setItem('sonnections_lastAttemptTime', new Date().getTime().toString());
                    localStorage.setItem('sonnections_lastAttempts', JSON.stringify(gameState.attempts));
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
    gameState.foundGroups.push(correctGroup);
    gameState.completionOrder.push(correctGroup.color);
    gameState.attempts.push({
        words: [...gameState.selectedWords],
        colors: gameState.selectedWords.map(() => correctGroup.color),
        correct: true
    });
    gameState.selectedWords = [];
    
    // Don't hide play buttons once they've been shown
    
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

        // Playful toast messages for clicked cells
        const playfulMessages = [
            "\"ouch\"", "\"that's rude\"", "\"that tickles\"", "\"hey!\"", "\"stop that!\"",
            "\"easy!\"", "\"careful!\"", "\"jeez\"", "\"what was that for?\"",
            "\"space please!\"", "\"ow\"", "\"that stings\"", "\"why?\"",
            "\"I didn't do anything\"", "\"uncalled for\"", "\"rude\"", "\"ooof\""
        ];

        // Function to get random playful message
        function getRandomPlayfulMessage() {
            return playfulMessages[Math.floor(Math.random() * playfulMessages.length)];
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
                gameOverTitle.textContent = 'Congratulations!';
                gameOverMessage.textContent = 'You found all the sonnections!';
                playAgainBtn.disabled = false;
                playAgainBtn.textContent = 'Play Again';
                cooldownTimer.textContent = '';
                // Clear saved attempts when user wins
                localStorage.removeItem('sonnections_lastAttempts');
                // Mark sonnections as completed
                localStorage.setItem('sonnections_completed', 'true');
            } else {
                gameOverTitle.textContent = 'Game Over';
                gameOverMessage.textContent = 'Better luck next time!';
                playAgainBtn.textContent = 'Play Again';
                
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

            // For losers, always try to show saved attempts grid first
            let attemptsToShow = gameState.attempts;
            if (!won && fromCooldown) {
                const savedAttempts = localStorage.getItem('sonnections_lastAttempts');
                if (savedAttempts) {
                    try {
                        attemptsToShow = JSON.parse(savedAttempts);
                    } catch (e) {
                        console.warn('Failed to parse saved attempts:', e);
                    }
                }
            }

            // Always show attempts grid at the end
            if (attemptsToShow && attemptsToShow.length > 0) {
                const attemptsGrid = document.createElement('div');
                attemptsGrid.className = 'attempts-grid';
                
                attemptsToShow.forEach((attempt, rowIndex) => {
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
                        
                        // Store cell reference for later link assignment
                        cell.globalIndex = rowIndex * 4 + cellIndex;
                        
                        cell.style.setProperty('--row-index', rowIndex);
                        cell.style.setProperty('--cell-index', cellIndex);
                        attemptRow.appendChild(cell);
                    });
                    
                    attemptsGrid.appendChild(attemptRow);
                });
                
                gameOverMessage.insertAdjacentElement('afterend', attemptsGrid);
                
                // Add shake animation and click handlers to random half of cells (only when won)
                if (won) {
                    setTimeout(() => {
                        addShakeAndClickHandlers(attemptsGrid);
                    }, 500);
                }
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
                    
                    // Create hidden word element for reference
                    const hiddenWord = document.createElement('span');
                    hiddenWord.className = 'hidden-word';
                    hiddenWord.textContent = word;
                    
                    // Create play button
                    const playButton = document.createElement('button');
                    playButton.className = 'play-button';
                    playButton.innerHTML = '▶';
                    playButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (gameState.audioInstances.has(word)) {
                            stopSound(word);
                        } else {
                            playSound(word, gameState.wordToAudio.get(word));
                        }
                    });
                    
                    tile.appendChild(playButton);
                    tile.appendChild(hiddenWord);
                    wordGrid.appendChild(tile);
                });
                
                // Show play buttons if they were shown during gameplay
                if (gameState.playButtonsShown) {
                    wordGrid.classList.add('show-play-buttons');
                }
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

        // Add shake animation and click handlers to random half of cells
        function addShakeAndClickHandlers(attemptsGrid) {
            const attemptCells = Array.from(attemptsGrid.querySelectorAll('.attempt-cell'));
            
            if (attemptCells.length === 0) return;
            
            // Select random half of the cells
            const halfCount = Math.ceil(attemptCells.length / 2);
            const shuffledCells = [...attemptCells];
            
            // Shuffle the array
            for (let i = shuffledCells.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledCells[i], shuffledCells[j]] = [shuffledCells[j], shuffledCells[i]];
            }
            
            // Take the first half
            const selectedCells = shuffledCells.slice(0, halfCount);
            
            // Pick one cell from selected cells to be the enhanced shaking cell
            const enhancedShakeIndex = Math.floor(Math.random() * selectedCells.length);
            
            // Add shake animation and click handlers to selected cells
            selectedCells.forEach((cell, index) => {
                cell.classList.add('shake-link');
                
                const isEnhancedCell = index === enhancedShakeIndex;
                
                // Randomly assign one of the shake animations (reusing existing ones)
                const shakeAnimations = ['subtle-shake-1', 'subtle-shake-2', 'subtle-shake-3', 'subtle-shake-4'];
                const randomAnimation = shakeAnimations[Math.floor(Math.random() * shakeAnimations.length)];
                
                // Enhanced cell gets more intense shaking
                let randomDuration, randomDelay;
                if (isEnhancedCell) {
                    // Enhanced cell: faster, more intense shaking
                    randomDuration = (0.8 + Math.random() * 0.4).toFixed(1); // 0.8-1.2s
                    randomDelay = (Math.random() * 0.3).toFixed(2); // 0-0.3s delay
                    cell.classList.add('victory-shake'); // Add special styling
                } else {
                    // Regular cells: normal shaking
                    randomDuration = (1.5 + Math.random()).toFixed(1); // 1.5-2.5s
                    randomDelay = (Math.random() * 0.5).toFixed(2); // 0-0.5s delay
                }
                
                cell.style.animation = `${randomAnimation} ${randomDuration}s ease-in-out infinite`;
                cell.style.animationDelay = `${randomDelay}s`;
                
                // Add click handler
                if (isEnhancedCell) {
                    // Enhanced cell: link or popup functionality
                    cell.addEventListener('click', () => {
                        if (!NEXT_PUZZLES_ENABLED) {
                            showEarlyAccessPopup();
                        } else {
                            // Navigate to wordle.html when enabled
                            const link = 'wordle.html';
                            window.open(link, '_blank');
                        }
                    });
                } else {
                    // Regular cells: toast message
                    cell.addEventListener('click', () => {
                        const message = getRandomPlayfulMessage();
                        showToast(message);
                    });
                }
            });
        }

        // End game
        function endGame(won) {
            showGameOverScreen(won);
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

        // Event listeners
        shuffleBtn.addEventListener('click', shuffleWords);
        deselectBtn.addEventListener('click', deselectAll);
        submitBtn.addEventListener('click', submitGuess);
        playAgainBtn.addEventListener('click', () => {
            // If cooldown just ended, clear all saved data first
            if (!isInCooldown()) {
                localStorage.removeItem('sonnections_lastAttemptTime');
                clearSavedGameState();
                localStorage.removeItem('sonnections_lastAttempts');
                gameOverEl.classList.remove('show');
            }
            initGame();
        });
        document.getElementById('helpIcon').addEventListener('click', showHowToPlayPopup);

        // Initialize game on load
        fetch(DATA_URL)
            .then(function(res) { return res.json(); })
            .then(function(data) {
                gameData = data;
                initGame();
            });
