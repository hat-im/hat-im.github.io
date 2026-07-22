(function(){

var BASE = 'dear-sam/';
var STRINGS_URL = BASE + 'strings.json';
var PUZZLE_URL = BASE + 'data/puzzle.json';

var STR = {};
var correctMapping = {};
var NEXT_PUZZLES_ENABLED = true;
var allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var currentSelected = null;
var puzzleSolved = false;

function getPreviousInput(currentInput) {
    const allInputs = Array.from(document.querySelectorAll('.letter-input'));
    const currentIndex = parseInt(currentInput.dataset.index);

    // Find the previous input by index
    let previousInput = null;
    for (let input of allInputs) {
        const inputIndex = parseInt(input.dataset.index);
        if (inputIndex < currentIndex && (!previousInput || inputIndex > parseInt(previousInput.dataset.index))) {
            previousInput = input;
        }
    }
    return previousInput;
}

function getNextInput(currentInput) {
    const allInputs = Array.from(document.querySelectorAll('.letter-input'));
    const currentIndex = parseInt(currentInput.dataset.index);

    // Find the next input by index
    for (let input of allInputs) {
        if (parseInt(input.dataset.index) > currentIndex) {
            return input;
        }
    }
    return null;
}

function getPreviousEmptyInput(currentInput) {
    const allInputs = Array.from(document.querySelectorAll('.letter-input'));
    const currentIndex = parseInt(currentInput.dataset.index);

    // Check if all inputs are filled
    const allFilled = allInputs.every(input => input.value.trim() !== '');
    if (allFilled) {
        // If all filled, behave like left arrow
        return getPreviousInput(currentInput);
    }

    // Find the previous empty input by index (closest one with lower index)
    let previousEmptyInput = null;
    let closestIndex = -1;
    for (let input of allInputs) {
        const inputIndex = parseInt(input.dataset.index);
        if (inputIndex < currentIndex && input.value.trim() === '' && inputIndex > closestIndex) {
            previousEmptyInput = input;
            closestIndex = inputIndex;
        }
    }
    return previousEmptyInput;
}

function getNextEmptyInput(currentInput) {
    const allInputs = Array.from(document.querySelectorAll('.letter-input'));
    const currentIndex = parseInt(currentInput.dataset.index);

    // Check if all inputs are filled
    const allFilled = allInputs.every(input => input.value.trim() !== '');
    if (allFilled) {
        // If all filled, behave like right arrow
        return getNextInput(currentInput);
    }

    // Find the next empty input by index
    for (let input of allInputs) {
        const inputIndex = parseInt(input.dataset.index);
        if (inputIndex > currentIndex && input.value.trim() === '') {
            return input;
        }
    }
    return null;
}

function toggleHowToSolve() {
    const link = document.getElementById('how-to-link');
    const text = document.getElementById('how-to-text');

    if (text.style.display === 'none') {
        link.style.display = 'none';
        text.style.display = 'block';
    } else {
        link.style.display = 'inline';
        text.style.display = 'none';
    }
}

function showPopup(isReturningUser = false) {
    const popup = document.getElementById('popup-overlay');
    const title = popup.querySelector('.popup-title');
    const message = popup.querySelector('.popup-message');
    const hint = popup.querySelector('.popup-hint');
    const continueBtn = popup.querySelector('.popup-close');
    const playAgainBtn = popup.querySelector('.popup-restart');

    if (isReturningUser) {
        // Show different content for returning users
        const s = STR.popup.returning;
        title.textContent = s.title;
        message.innerHTML = s.message;
        hint.innerHTML = s.hint;
        continueBtn.textContent = s.continueLabel;
        playAgainBtn.style.display = 'inline-block';
    } else {
        // Original completion content
        const s = STR.popup.solved;
        title.textContent = s.title;
        message.innerHTML = s.message;
        hint.innerHTML = s.hint;
        continueBtn.textContent = s.continueLabel;
        playAgainBtn.style.display = 'inline-block';
    }

    popup.style.display = 'flex';
}

function closePopup() {
    const popup = document.getElementById('popup-overlay');
    popup.style.display = 'none';
}

function revealCompletedMessage() {
    // Fill in all the correct answers
    document.querySelectorAll('.letter-input').forEach(input => {
        const encrypted = input.dataset.encrypted;
        const correct = correctMapping[encrypted];
        input.value = correct;
        input.classList.add('solved');
    });

    // Hide encrypted letters
    document.querySelectorAll('.encrypted-letter').forEach(letter => {
        letter.style.visibility = 'hidden';
    });

    // Enable header link
    const headerLink = document.querySelector('.header-link');
    headerLink.classList.add('enabled');

    // Set up header click handler if needed
    if (!NEXT_PUZZLES_ENABLED) {
        headerLink.addEventListener('click', function(e) {
            e.preventDefault();
            showEarlyPopup();
        });
    }

    // Update remaining letters
    updateRemainingLetters();

    // Set puzzle as solved
    puzzleSolved = true;
}

function restartGame() {
    // Clear completion state
    localStorage.removeItem('cryptogram_completed');

    // Reset puzzle state
    puzzleSolved = false;
    currentSelected = null;

    // Clear all inputs
    document.querySelectorAll('.letter-input').forEach(input => {
        input.value = '';
        input.classList.remove('solved', 'error', 'highlighted', 'selected');
    });

    // Show encrypted letters again
    document.querySelectorAll('.encrypted-letter').forEach(letter => {
        letter.classList.remove('fade-out');
        letter.style.visibility = 'visible';
    });

    // Disable header link
    const headerLink = document.querySelector('.header-link');
    headerLink.classList.remove('enabled');

    // Update remaining letters
    updateRemainingLetters();

    // Close popup
    closePopup();
}

function initializePage() {
    // Check if puzzle was already completed
    const isCompleted = localStorage.getItem('cryptogram_completed') === 'true';

    if (isCompleted) {
        // Reveal the message immediately
        revealCompletedMessage();

        // Show the welcome back popup
        setTimeout(() => {
            showPopup(true);
        }, 500);
    }
}

function showEarlyPopup() {
    const popup = document.getElementById('popup-overlay');
    const title = popup.querySelector('.popup-title');
    const message = popup.querySelector('.popup-message');
    const hint = popup.querySelector('.popup-hint');
    const button = popup.querySelector('.popup-close');

    // Update popup content
    const s = STR.popup.early;
    title.textContent = s.title;
    message.innerHTML = s.message;
    hint.innerHTML = s.hint;
    button.textContent = s.buttonLabel;

    popup.style.display = 'flex';
}

function checkForDuplicates() {
    // Clear all error states first
    document.querySelectorAll('.letter-input').forEach(input => {
        input.classList.remove('error');
    });

    // Get all filled inputs and their values
    const filledInputs = Array.from(document.querySelectorAll('.letter-input'))
        .filter(input => input.value.trim() !== '');

    // Group inputs by their entered value
    const valueGroups = {};
    filledInputs.forEach(input => {
        const value = input.value.toUpperCase();
        if (!valueGroups[value]) {
            valueGroups[value] = [];
        }
        valueGroups[value].push(input);
    });

    // Find duplicates (same letter used for different cipher letters)
    Object.values(valueGroups).forEach(group => {
        if (group.length > 1) {
            // Check if these inputs have different encrypted letters
            const encryptedLetters = new Set(group.map(input => input.dataset.encrypted));
            if (encryptedLetters.size > 1) {
                // This is an error - same letter used for different cipher letters
                group.forEach(input => {
                    input.classList.add('error');
                });
            }
        }
    });
}

function updateRemainingLetters() {
    const usedLetters = new Set();
    document.querySelectorAll('.letter-input').forEach(input => {
        if (input.value.trim()) {
            usedLetters.add(input.value.toUpperCase());
        }
    });

    const remaining = allLetters.split('').filter(letter => !usedLetters.has(letter));
    document.getElementById('remaining-letters').textContent = remaining.join(' ');
}

function highlightSameLetters(encrypted) {
    // Clear all highlights first
    document.querySelectorAll('.letter-input').forEach(input => {
        input.classList.remove('highlighted', 'selected');
    });

    // Highlight all inputs with the same encrypted letter
    if (encrypted) {
        document.querySelectorAll(`[data-encrypted="${encrypted}"]`).forEach(input => {
            input.classList.add('highlighted');
        });
    }
}

function solvePuzzle() {
    if (puzzleSolved) return;

    puzzleSolved = true;

    // Mark cryptogram as completed
    localStorage.setItem('cryptogram_completed', 'true');

    // Start the fade animation for encrypted letters
    document.querySelectorAll('.encrypted-letter').forEach(letter => {
        letter.classList.add('fade-out');
    });

    // After 1 second, add solved class to inputs
    setTimeout(() => {
        document.querySelectorAll('.letter-input').forEach(input => {
            input.classList.add('solved');
        });

        // Keep encrypted letters in DOM but invisible to maintain spacing
        document.querySelectorAll('.encrypted-letter').forEach(letter => {
            letter.style.visibility = 'hidden';
        });

        // Enable and animate the header link
        const headerLink = document.querySelector('.header-link');
        headerLink.classList.add('enabled');

        // Add click handler based on flag
        if (!NEXT_PUZZLES_ENABLED) {
            headerLink.addEventListener('click', function(e) {
                e.preventDefault();
                showEarlyPopup();
            });
        }

        // Show the popup after a short delay
        setTimeout(() => {
            showPopup();
        }, 500);
    }, 1000);
}

function bindHeaderFallback() {
    const headerImg = document.getElementById('header-img');
    if (!headerImg) return;
    headerImg.addEventListener('error', function() {
        headerImg.style.display = 'none';
        document.querySelector('.fallback-title').style.display = 'block';
    });
}

function bindStaticControls() {
    bindHeaderFallback();

    document.getElementById('how-to-link').addEventListener('click', toggleHowToSolve);
    document.getElementById('how-to-close-link').addEventListener('click', toggleHowToSolve);

    document.querySelector('.popup-close').addEventListener('click', closePopup);
    document.querySelector('.popup-restart').addEventListener('click', restartGame);
}

function bindLetterInputs() {
    // Event listeners for inputs
    document.querySelectorAll('.letter-input').forEach(input => {
        input.addEventListener('focus', function() {
            if (puzzleSolved) return;

            currentSelected = this.dataset.encrypted;
            this.classList.add('selected');
            highlightSameLetters(this.dataset.encrypted);
        });

        input.addEventListener('blur', function() {
            if (puzzleSolved) return;

            this.classList.remove('selected');
            if (currentSelected === this.dataset.encrypted) {
                highlightSameLetters(null);
                currentSelected = null;
            }
        });

        input.addEventListener('input', function() {
            if (puzzleSolved) return;

            const encrypted = this.dataset.encrypted;
            let value = this.value.toUpperCase();
            const wasAlreadyFilled = this.dataset.wasFilled === 'true';

            // Only allow single uppercase letters
            if (value.length > 1) {
                value = value.slice(-1); // Take the last character typed
            }
            this.value = value;

            // Update all inputs with the same encrypted letter
            document.querySelectorAll(`[data-encrypted="${encrypted}"]`).forEach(otherInput => {
                if (otherInput !== this) {
                    otherInput.value = this.value;
                }
            });

            updateRemainingLetters();
            checkForDuplicates();

            // Auto-advance to next input if a letter was entered
            if (value && !puzzleSolved) {
                const nextInput = getNextInput(this);
                if (nextInput) {
                    setTimeout(() => nextInput.focus(), 50);
                }
            }

            // Clear the filled flag
            this.dataset.wasFilled = 'false';

            // Auto-check if puzzle is complete
            const allInputs = document.querySelectorAll('.letter-input');
            const allFilled = Array.from(allInputs).every(inp => inp.value.trim() !== '');

            if (allFilled) {
                // Check if solution is correct
                let allCorrect = true;
                allInputs.forEach(inp => {
                    const encrypted = inp.dataset.encrypted;
                    const userGuess = inp.value.toUpperCase();
                    const correctAnswer = correctMapping[encrypted];
                    if (userGuess !== correctAnswer) {
                        allCorrect = false;
                    }
                });

                if (allCorrect) {
                    setTimeout(() => solvePuzzle(), 100);
                }
            }
        });

        input.addEventListener('keydown', function(e) {
            if (puzzleSolved) return;

            // Handle letter replacement - any letter key will replace existing content
            if (e.key.match(/^[a-zA-Z]$/)) {
                // Mark if this input was already filled
                this.dataset.wasFilled = this.value.trim() !== '' ? 'true' : 'false';
                this.value = ''; // Clear existing value to allow replacement
            }

            // Allow navigation with arrow keys
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                let targetInput = null;

                if (e.key === 'ArrowRight') {
                    targetInput = getNextInput(this);
                } else if (e.key === 'ArrowLeft') {
                    targetInput = getPreviousInput(this);
                } else if (e.key === 'ArrowDown') {
                    targetInput = getNextEmptyInput(this);
                } else if (e.key === 'ArrowUp') {
                    targetInput = getPreviousEmptyInput(this);
                }

                if (targetInput) {
                    targetInput.focus();
                }
            }

            // Handle backspace
            if (e.key === 'Backspace') {
                e.preventDefault(); // Always prevent default to avoid browser back navigation

                if (this.value) {
                    // If there's a value, clear the current and all same encrypted inputs
                    this.value = '';
                    const encrypted = this.dataset.encrypted;
                    document.querySelectorAll(`[data-encrypted="${encrypted}"]`).forEach(otherInput => {
                        if (otherInput !== this) {
                            otherInput.value = '';
                        }
                    });
                    updateRemainingLetters();
                    checkForDuplicates();
                } else {
                    // If empty, move to the previous input
                    const previousInput = getPreviousInput(this);
                    if (previousInput) {
                        previousInput.focus();
                    }
                }
            }
        });
    });
}

async function fetchJson(url){
    var res = await fetch(url);
    return res.json();
}

async function init(){
    var results = await Promise.all([
        fetchJson(STRINGS_URL),
        fetchJson(PUZZLE_URL)
    ]);
    STR = results[0];
    correctMapping = results[1].mapping;
    NEXT_PUZZLES_ENABLED = results[1].nextPuzzlesEnabled;

    bindStaticControls();
    bindLetterInputs();

    // Initialize
    updateRemainingLetters();
    initializePage();
}

init();

})();
