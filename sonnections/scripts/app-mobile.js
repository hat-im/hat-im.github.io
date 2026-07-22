        // Game data with audio files (mobile-optimized audio handling)
        // Loaded from sonnections/data/puzzle.json
        const DATA_URL = 'sonnections/data/puzzle.json';
        let gameData = null;

        // Flag to control next puzzle access
        const NEXT_PUZZLES_ENABLED = true;
        
        // Cooldown duration in milliseconds
        const COOLDOWN_DURATION = 3600000; // 1 hour (3600000ms)
        
        // Game state (simplified for mobile)
        let gameState = {
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

        // Basic game functions (same logic as desktop but simplified)
        function isInCooldown() {
            const lastAttempt = localStorage.getItem('sonnections_lastAttemptTime');
            if (!lastAttempt) return false;
            const now = new Date().getTime();
            const timeDiff = now - parseInt(lastAttempt);
            return timeDiff < COOLDOWN_DURATION;
        }

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
                return;
            }
            const hours = Math.floor(timeLeft / 3600000);
            const minutes = Math.floor((timeLeft % 3600000) / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            cooldownTimer.textContent = `Next game available in: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            playAgainBtn.disabled = true;
            playAgainBtn.textContent = 'Please Wait';
        }

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

        function showEarlyAccessPopup() {
            const popup = document.getElementById('early-access-popup');
            popup.classList.add('show');
        }

        function closeEarlyAccessPopup() {
            const popup = document.getElementById('early-access-popup');
            popup.classList.remove('show');
        }

        function closeGameOverPopup() {
            gameOverEl.classList.remove('show');
        }

        function showHowToPlayPopup() {
            const popup = document.getElementById('how-to-play-popup');
            popup.classList.add('show');
        }

        function closeHowToPlayPopup() {
            const popup = document.getElementById('how-to-play-popup');
            popup.classList.remove('show');
        }

        // Audio management (exact copy from desktop)
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

        // Initialize game (same as desktop but simplified)
        function initGame() {
            const lastAttempt = localStorage.getItem('sonnections_lastAttemptTime');
            if (lastAttempt) {
                const now = new Date().getTime();
                const timeDiff = now - parseInt(lastAttempt);
                if (timeDiff >= COOLDOWN_DURATION) {
                    localStorage.removeItem('sonnections_lastAttemptTime');
                    localStorage.removeItem('sonnections_lastAttempts');
                }
            }
            
            if (isInCooldown()) {
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
                gameData.groups.forEach(group => {
                    group.words.forEach((word, index) => {
                        gameState.words.push(word);
                        gameState.wordToAudio.set(word, group.audioFiles[index]);
                    });
                });
                shuffleArray(gameState.words);
                toastEl.className = 'toast';
                updateMistakesDisplay();
                renderWordGrid();
                updateControls();
                showGameOverScreen(false, true);
                return;
            }

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

            gameData.groups.forEach(group => {
                group.words.forEach((word, index) => {
                    gameState.words.push(word);
                    gameState.wordToAudio.set(word, group.audioFiles[index]);
                });
            });
            shuffleArray(gameState.words);

            toastEl.className = 'toast';
            gameOverEl.className = 'game-over';
            updateMistakesDisplay();
            renderWordGrid();
            updateControls();
        }

        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        }

        function renderWordGrid() {
            const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
            const remainingWords = gameState.words.filter(word => !foundWords.has(word));
            const selectedWordsSet = new Set(gameState.selectedWords);
            
            const fragment = document.createDocumentFragment();
            
            // Add found groups
            gameState.foundGroups.forEach((group) => {
                const groupBlock = document.createElement('div');
                groupBlock.className = `group-block ${group.color}`;
                groupBlock.innerHTML = `
                    <div class="group-category">${group.category}</div>
                    <div class="group-words">${group.words.join(', ')}</div>
                `;
                fragment.appendChild(groupBlock);
            });
            
            // Add remaining word tiles (exact copy from desktop - NO TEXT SHOWN)
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
            
            wordGrid.innerHTML = '';
            wordGrid.appendChild(fragment);
        }

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
        }

        function updateControls() {
            submitBtn.disabled = gameState.selectedWords.length !== 4;
            deselectBtn.disabled = gameState.selectedWords.length === 0;
            shuffleBtn.disabled = gameState.gameOver || gameState.mistakes >= gameState.maxMistakes || gameState.foundGroups.length === 4;
        }

        function shuffleWords() {
            const foundWords = new Set(gameState.foundGroups.flatMap(group => group.words));
            const remainingWords = gameState.words.filter(word => !foundWords.has(word));
            shuffleArray(remainingWords);
            gameState.words = [
                ...gameState.foundGroups.flatMap(group => group.words),
                ...remainingWords
            ];
            // DON'T clear selected words when shuffling
            renderWordGrid();
            updateControls();
        }

        function deselectAll() {
            gameState.selectedWords = [];
            renderWordGrid();
            updateControls();
        }

        function submitGuess() {
            if (gameState.selectedWords.length !== 4) return;

            const sortedGuess = [...gameState.selectedWords].sort().join(',');

            if (gameState.previousGuesses.has(sortedGuess)) {
                showToast('Already guessed');
                gameState.selectedWords = [];
                renderWordGrid();
                updateControls();
                return;
            }

            const correctGroup = gameData.groups.find(group => 
                gameState.selectedWords.every(word => group.words.includes(word)) &&
                gameState.selectedWords.length === 4
            );

            if (correctGroup) {
                animateCorrectGuess(correctGroup);
            } else {
                gameState.previousGuesses.add(sortedGuess);

                const selectedColors = gameState.selectedWords.map(word => {
                    const group = gameData.groups.find(g => g.words.includes(word));
                    return group ? group.color : 'gray';
                });
                gameState.attempts.push({
                    words: [...gameState.selectedWords],
                    colors: selectedColors,
                    correct: false
                });

                const oneAwayGroup = gameData.groups.find(group => {
                    const matchingWords = gameState.selectedWords.filter(word => 
                        group.words.includes(word)
                    );
                    return matchingWords.length === 3;
                });

                if (oneAwayGroup) {
                    showToast('One away');
                }

                const selectedTiles = document.querySelectorAll('.word-tile.selected');
                selectedTiles.forEach(tile => {
                    tile.classList.add('incorrect-guess');
                    setTimeout(() => {
                        tile.classList.remove('incorrect-guess');
                    }, 400);
                });

                gameState.mistakes++;
                updateMistakesDisplay();
                
                if (gameState.mistakes >= gameState.maxMistakes) {
                    localStorage.setItem('sonnections_lastAttemptTime', new Date().getTime().toString());
                    localStorage.setItem('sonnections_lastAttempts', JSON.stringify(gameState.attempts));
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
            wordsEl.textContent = correctGroup.words.join(', ');
            
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
            
            if (gameState.foundGroups.length === 4) {
                localStorage.removeItem('sonnections_lastAttempts');
                localStorage.setItem('sonnections_completed', 'true');
                endGame(true);
            }
        }

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

        // Playful toast messages for clicked cells (mobile version)
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
                gameOverTitle.textContent = 'Congratulations!';
                gameOverMessage.textContent = 'You found all the sonnections!';
                playAgainBtn.disabled = false;
                playAgainBtn.textContent = 'Play Again';
                cooldownTimer.textContent = '';
                localStorage.setItem('sonnections_completed', 'true');
            } else {
                gameOverTitle.textContent = 'Game Over';
                gameOverMessage.textContent = 'Better luck next time!';
                playAgainBtn.textContent = 'Play Again';
                
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
                        cell.style.backgroundColor = bgColor;
                        cell.setAttribute('data-color', color);
                        
                        const globalCellIndex = rowIndex * 4 + cellIndex;
                        const totalCells = attemptsToShow.length * 4;
                        
                        
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

            const solvedGroups = gameState.foundGroups;
            wordGrid.innerHTML = '';
            
            solvedGroups.forEach(group => {
                const groupBlock = document.createElement('div');
                groupBlock.className = `group-block ${group.color}`;
                groupBlock.innerHTML = `
                    <div class="group-category">${group.category}</div>
                    <div class="group-words">${group.words.join(', ')}</div>
                `;
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
                    
                    // Add play button for mobile
                    const playButton = document.createElement('button');
                    playButton.className = `play-button${gameState.playButtonsShown ? ' show' : ''}`;
                    playButton.innerHTML = '▶';
                    playButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        playAudio(word);
                    });
                    
                    tile.appendChild(playButton);
                    wordGrid.appendChild(tile);
                });
            }
            
            gameOverEl.className = 'game-over show';
        }

        // Add shake animation and click handlers to random half of cells (mobile version)
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
                cell.style.cursor = 'pointer';
                
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

        function endGame(won) {
            showGameOverScreen(won);
            
            if (won) {
                // Add victory shake to the last row of attempts grid after screen is shown
                setTimeout(() => {
                    addVictoryShake();
                }, 200);
            }
        }

        function getColorCode(color) {
            const colorMap = {
                'yellow': '#f9df84',
                'green': '#a0c35a',
                'blue': '#b0c4ef',
                'purple': '#ba81c5'
            };
            return colorMap[color] || '#999';
        }

        // Event listeners
        shuffleBtn.addEventListener('click', shuffleWords);
        deselectBtn.addEventListener('click', deselectAll);
        submitBtn.addEventListener('click', submitGuess);
        playAgainBtn.addEventListener('click', () => {
            if (!isInCooldown()) {
                localStorage.removeItem('sonnections_lastAttemptTime');
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
