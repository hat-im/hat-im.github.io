(function(){

var BASE = 'number_bee/';
var STRINGS_URL = BASE + 'strings.json';
var RANKS_URL = BASE + 'data/ranks.json';
var DIGIT_PUNS_URL = BASE + 'data/digit-puns.json';

var STR = {};
var RANKS = [];
var DIGIT_PUNS = {};

function fmt(template, vars){
  return template.replace(/\{(\w+)\}/g, function(_, key){ return vars[key]; });
}

async function loadAssets(){
  const [strRes, ranksRes, punsRes] = await Promise.all([
    fetch(STRINGS_URL),
    fetch(RANKS_URL),
    fetch(DIGIT_PUNS_URL)
  ]);
  STR = await strRes.json();
  RANKS = await ranksRes.json();
  DIGIT_PUNS = await punsRes.json();
}

let currentInput = "";
let hexNumbers = [];
let foundWords = 0;
let hasStartedTyping = false;
let validDigitsAtEntry = []; // Track which digits were valid when entered
let currentInputUsage = {}; // Track how many times each digit is used in current input
let digitValidityAtEntry = []; // Track whether each position was valid when entered
let wasCenterAtEntry = []; // Track whether each position was center digit when entered
let digitUsages = []; // Track usage count for each position (5 uses each)
let digitCooldowns = {}; // Track cooldown for disappeared digits
let successfulTurns = 0; // Count successful submissions
let foundNumbers = new Set(); // Track already found numbers
let isNegativeMode = false; // Track if in negative mode
let totalScore = 0; // Track total score
let currentRankIndex = 0; // Track current rank index
let hasWon = false; // Track if victory popup has been shown
let factStreak = 0; // Track consecutive interesting numbers found
let toastQueue = []; // Queue for toast messages
let isShowingToast = false; // Track if a toast is currently showing
let digitsBeingReplaced = new Set(); // Track digits currently being replaced

const NEXT_PUZZLES_ENABLED = false; // Enable next puzzle navigation

// Game state management
function saveGameState() {
  const gameState = {
    hexNumbers: hexNumbers,
    digitUsages: digitUsages,
    foundNumbers: Array.from(foundNumbers),
    foundWords: foundWords,
    totalScore: totalScore,
    currentRankIndex: currentRankIndex,
    successfulTurns: successfulTurns,
    digitCooldowns: digitCooldowns,
    isNegativeMode: isNegativeMode,
    hasWon: hasWon,
    factStreak: factStreak
  };
  localStorage.setItem('numberBeeGameState', JSON.stringify(gameState));
}

function loadGameState() {
  const saved = localStorage.getItem('numberBeeGameState');
  if (saved) {
    try {
      const gameState = JSON.parse(saved);
      hexNumbers = gameState.hexNumbers || [];
      digitUsages = gameState.digitUsages || [];
      foundNumbers = new Set(gameState.foundNumbers || []);
      foundWords = gameState.foundWords || 0;
      totalScore = gameState.totalScore || 0;
      currentRankIndex = gameState.currentRankIndex || 0;
      successfulTurns = gameState.successfulTurns || 0;
      digitCooldowns = gameState.digitCooldowns || {};
      isNegativeMode = gameState.isNegativeMode || false;
      hasWon = gameState.hasWon || false;
      factStreak = gameState.factStreak || 0;
      return true;
    } catch (error) {
      console.error('Error loading game state:', error);
      return false;
    }
  }
  return false;
}

function clearGameState() {
  localStorage.removeItem('numberBeeGameState');
}

function restartGame() {
  // Clear all saved data
  clearGameState();
  
  // Reset all game variables to initial state
  currentInput = "";
  hexNumbers = [];
  foundWords = 0;
  hasStartedTyping = false;
  digitUsages = [];
  digitCooldowns = {};
  successfulTurns = 0;
  foundNumbers = new Set();
  isNegativeMode = false;
  totalScore = 0;
  currentRankIndex = 0;
  hasWon = false;
  factStreak = 0;
  validDigitsAtEntry = [];
  digitValidityAtEntry = [];
  wasCenterAtEntry = [];
  currentInputUsage = {};
  
  // Reset progress bar elements
  const progressMarker = document.querySelector('.sb-progress-marker');
  const progressLine = document.querySelector('.sb-progress-line');
  
  if (progressMarker) {
    progressMarker.classList.remove('marker-win-shake');
    progressMarker.style.left = '0%';
    progressMarker.style.cursor = 'default';
    progressMarker.removeEventListener('click', handleMarkerClick);
  }
  
  if (progressLine) {
    progressLine.style.width = '100%';
  }
  
  // Clear the word list display
  const wordList = document.getElementById("wordList");
  if (wordList) {
    wordList.innerHTML = "";
  }
  
  // Generate new game
  generateRandomNumbers();
  
  // Update all displays
  displayNumbers();
  updateInputDisplay();
  updateStatsDisplay();
  updateProgressScore();
}

function showVictoryPopup() {
  const victoryMessages = STR.victory.messages;

  const randomMessage = victoryMessages[Math.floor(Math.random() * victoryMessages.length)];

  const popup = document.createElement('div');
  popup.className = 'victory-popup';
  popup.innerHTML = `
    <div class="victory-content">
      <h1 class="victory-title">${randomMessage}</h1>
      <p class="victory-subtitle">${STR.victory.subtitle}</p>
      <div class="victory-buttons">
        <button class="victory-btn" onclick="admirepuzzle()">${STR.victory.admireButton}</button>
        <button class="victory-btn play-again" onclick="playAgain()">${STR.victory.playAgainButton}</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

function admirepuzzle() {
  // Close the popup
  const popup = document.querySelector('.victory-popup');
  if (popup) {
    popup.remove();
  }
  // Keep the marker shake going when admiring puzzle
}

function playAgain() {
  // Close the popup and restart the game
  const popup = document.querySelector('.victory-popup');
  if (popup) {
    popup.remove();
  }
  restartGame();
}

function handleMarkerClick() {
  // Only allow clicking if the user has won
  if (hasWon) {
    if (NEXT_PUZZLES_ENABLED) {
      window.location.href = 'scrabble_fight.html';
    } else {
      showWaitPopup();
    }
  }
}

// Show wait popup
function showWaitPopup() {
  const popup = document.getElementById('wait-popup');
  popup.classList.add('show');
}

// Close wait popup
function closeWaitPopup() {
  const popup = document.getElementById('wait-popup');
  popup.classList.remove('show');
}

// Function to fetch number facts from the tree structure
// Cache for the numbers array
// GitHub base URL for crossword puzzles
const GITHUB_NUMBERS_BASE = 'https://raw.githubusercontent.com/hat-im/hat-im.github.io/number-bee/';
let numbersData = null;

async function loadNumbersData() {
  if (numbersData === null) {
    try {
      const response = await fetch(`${GITHUB_NUMBERS_BASE}numbers.json`);
      if (response.ok) {
        numbersData = await response.json();
      } else {
        numbersData = [];
      }
    } catch (error) {
      console.error('Error loading numbers data:', error);
      numbersData = [];
    }
  }
  return numbersData;
}

async function getNumberFact(numberString) {
  try {
    const data = await loadNumbersData();
    const numberEntry = data.find(entry => entry.number === numberString);
    return numberEntry ? numberEntry.fact : null;
  } catch (error) {
    console.error('Error fetching number fact:', error);
    return null;
  }
}

// Function to get a random generic message
function getRandomGenericMessage() {
  const genericMessages = STR.genericMessages;
  const randomIndex = Math.floor(Math.random() * genericMessages.length);
  return genericMessages[randomIndex];
}

// Function to get a random "too long" message
function getRandomTooLongMessage() {
  const tooLongMessages = STR.tooLongMessages;
  const randomIndex = Math.floor(Math.random() * tooLongMessages.length);
  return tooLongMessages[randomIndex];
}

// Function to get a random decimal rejection message
function getRandomDecimalMessage() {
  const decimalMessages = STR.decimalMessages;
  const randomIndex = Math.floor(Math.random() * decimalMessages.length);
  return decimalMessages[randomIndex];
}

// Function to reverse text
function reverseText(text) {
  return text.split('').reverse().join('');
}

// Function to toggle negative mode
function toggleNegativeMode() {
  isNegativeMode = !isNegativeMode;
  saveGameState(); // Save negative mode state
  
  // Get all text elements including hexagon numbers
  const textElements = [
    document.querySelector('.title'),
    document.querySelector('.beginner-label'),
    document.querySelector('.sb-progress-value'),
    document.querySelector('#wordsFoundText'),
    document.querySelector('#inputText'),
    document.querySelector('.restart-btn'),
    ...document.querySelectorAll('.sb-anagram'),
    ...document.querySelectorAll('.cell-letter')
  ].filter(el => el !== null);
  
  // Add animation class to all text elements
  textElements.forEach(el => {
    el.classList.add('text-reverse');
    
    // Store original text if not already stored
    if (!el.dataset.originalText) {
      el.dataset.originalText = el.textContent || el.innerHTML;
    }
    
    // At the middle of the animation, change the text
    setTimeout(() => {
      if (isNegativeMode) {
        if (el.textContent) {
          el.textContent = reverseText(el.dataset.originalText);
        } else {
          el.innerHTML = reverseText(el.dataset.originalText);
        }
      } else {
        if (el.textContent) {
          el.textContent = el.dataset.originalText;
        } else {
          el.innerHTML = el.dataset.originalText;
        }
      }
    }, 500); // Middle of 1s animation
    
    // Remove animation class after animation completes
    setTimeout(() => {
      el.classList.remove('text-reverse');
    }, 1000);
  });
  
  // Handle SVG rotation for circular button separately
  const circularBtn = document.querySelector('.btn.circular');
  if (circularBtn) {
    const svg = circularBtn.querySelector('svg');
    if (svg) {
      // Ensure transition is applied
      svg.style.transition = 'transform 0.3s ease';
      if (isNegativeMode) {
        svg.style.transform = 'rotate(180deg)';
      } else {
        svg.style.transform = 'rotate(0deg)';
      }
    }
  }

  // Handle button text separately - animate just the text content
  const buttons = document.querySelectorAll('.btn:not(.circular)');
  buttons.forEach(btn => {
    
    // Store original text if not already stored
    if (!btn.dataset.originalText) {
      btn.dataset.originalText = btn.textContent;
    }
    
    // Create a temporary span to animate the text inside button
    const textSpan = document.createElement('span');
    textSpan.textContent = btn.textContent;
    textSpan.classList.add('text-reverse');
    textSpan.style.display = 'inline-block';
    
    // Replace button text with animated span
    btn.innerHTML = '';
    btn.appendChild(textSpan);
    
    // At the middle of the animation, change the text
    setTimeout(() => {
      if (isNegativeMode) {
        textSpan.textContent = reverseText(btn.dataset.originalText);
      } else {
        textSpan.textContent = btn.dataset.originalText;
      }
    }, 500);
    
    // Remove animation class and clean up after animation
    setTimeout(() => {
      textSpan.classList.remove('text-reverse');
      btn.innerHTML = textSpan.textContent;
    }, 1000);
  });
  
  // Update input display and stats to show negative versions
  setTimeout(() => {
    // Reverse the current input when toggling modes
    if (currentInput.length > 0) {
      currentInput = currentInput.split('').reverse().join('');
      // Also reverse the tracking arrays to maintain consistency
      validDigitsAtEntry.reverse();
      digitValidityAtEntry.reverse();
      wasCenterAtEntry.reverse();
    }
    
    updateInputDisplay();
    updateStatsDisplay();
  }, 500);
}

function generateRandomNumbers() {
  hexNumbers = [];
  digitUsages = [];
  const availableDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  
  for (let i = 0; i < 7; i++) {
    const randomIndex = Math.floor(Math.random() * availableDigits.length);
    hexNumbers.push(availableDigits[randomIndex]);
    digitUsages.push(i === 6 ? 12 : 6); // Center digit gets 12 uses, others get 6
    availableDigits.splice(randomIndex, 1); // Remove used digit
  }
}

function displayNumbers() {
  const hexagons = document.querySelectorAll(".hive-cell");
  hexagons.forEach((hex, index) => {
    const textElement = hex.querySelector(".cell-letter");
    
    // Store original text for negative mode
    textElement.dataset.originalText = hexNumbers[index].toString();
    
    // Display based on current negative mode state
    if (isNegativeMode) {
      textElement.textContent = reverseText(hexNumbers[index].toString());
    } else {
      textElement.textContent = hexNumbers[index];
    }
    
    // Remove all shake classes, preserve fade animations
    hex.classList.remove('hex-shake', 'center-shake');
    
    // Add appropriate shake based on position and usage
    if (digitUsages[index] === 1) {
      if (index === 6) {
        // Center digit gets dramatic shake
        hex.classList.add('center-shake');
      } else {
        // Other digits get regular shake
        hex.classList.add('hex-shake');
      }
    }
  });
}

function addToInput(number) {
  // Check if adding this digit would exceed 21 characters
  if (currentInput.length >= 21) {
    showTooLongToast();
    shakeInput();
    return;
  }
  
  // Find the index of this digit in the hexNumbers array
  const digitIndex = hexNumbers.indexOf(number);
  
  // Check current usage of this digit in the input
  const currentUsageCount = (currentInputUsage[number] || 0);
  const availableUses = digitIndex !== -1 ? digitUsages[digitIndex] : 0;
  
  // Determine if this digit entry is valid and if it's the center digit
  const isValidEntry = digitIndex !== -1 && availableUses > 0;
  const isCenterDigit = number === hexNumbers[6];
  
  // In negative mode, prepend instead of append (reverse input order)
  if (isNegativeMode) {
    currentInput = number + currentInput;
    validDigitsAtEntry.unshift(number); // Add to beginning for negative mode
    digitValidityAtEntry.unshift(isValidEntry); // Track validity for this position
    wasCenterAtEntry.unshift(isCenterDigit); // Track if was center when entered
  } else {
    currentInput += number;
    validDigitsAtEntry.push(number); // Add to end for normal mode
    digitValidityAtEntry.push(isValidEntry); // Track validity for this position
    wasCenterAtEntry.push(isCenterDigit); // Track if was center when entered
  }
  
  // Update current input usage
  currentInputUsage[number] = currentUsageCount + 1;
  
  // Check if this digit should start shaking (when it reaches penultimate use)
  if (digitIndex !== -1 && currentInputUsage[number] === availableUses - 1) {
    updateDigitShakeStates();
  }
  
  // If this is the final use, kill the digit immediately AFTER adding to input
  if (digitIndex !== -1 && currentInputUsage[number] === availableUses) {
    // Kill the digit immediately (set usage to 0 and replace)
    digitUsages[digitIndex] = 0;
    replaceDigit(digitIndex, true); // true = show death pun toast
    
    // Update progress score and save state
    updateProgressScore();
    saveGameState();
  }
  
  updateInputDisplay();
}

function deleteChar() {
  if (currentInput.length > 0) {
    let removedDigit;
    
    // In negative mode, delete from the beginning (since we prepend)
    if (isNegativeMode) {
      removedDigit = parseInt(currentInput[0]);
      currentInput = currentInput.slice(1);
      validDigitsAtEntry.shift(); // Remove from beginning
      digitValidityAtEntry.shift(); // Remove validity tracking
      wasCenterAtEntry.shift(); // Remove center tracking
    } else {
      removedDigit = parseInt(currentInput[currentInput.length - 1]);
      currentInput = currentInput.slice(0, -1);
      validDigitsAtEntry.pop(); // Remove from end
      digitValidityAtEntry.pop(); // Remove validity tracking
      wasCenterAtEntry.pop(); // Remove center tracking
    }
    
    // Update current input usage
    if (currentInputUsage[removedDigit]) {
      currentInputUsage[removedDigit]--;
      if (currentInputUsage[removedDigit] === 0) {
        delete currentInputUsage[removedDigit];
      }
    }
    
    // Update shake states
    updateDigitShakeStates();
    updateInputDisplay();
  }
}

function updateDigitShakeStates() {
  const hexagons = document.querySelectorAll(".hive-cell");
  hexagons.forEach((hex, index) => {
    const digit = hexNumbers[index];
    const currentUsageCount = currentInputUsage[digit] || 0;
    const availableUses = digitUsages[index];
    
    // Remove existing shake classes
    hex.classList.remove('hex-shake', 'center-shake');
    
    // Add shake if this digit is at penultimate use in current input
    if (currentUsageCount === availableUses - 1 && availableUses > 1) {
      if (index === 6) {
        hex.classList.add('center-shake');
      } else {
        hex.classList.add('hex-shake');
      }
    }
  });
}

function submitInput() {
  if (currentInput.length > 0) {
    // Remove leading zeros for comparison
    const normalizedInput = currentInput.replace(/^0+/, '') || '0';
    
    // Check if already found (using normalized version)
    if (foundNumbers.has(normalizedInput)) {
      showAlreadyFoundToast();
      shakeInput();
      return;
    }
    
    // Check if any digits were invalid when entered (using our validity tracking)
    const hasInvalidDigits = digitValidityAtEntry.some(wasValid => !wasValid);
    
    // Check if any digit was center when entered OR current center digit is used
    const currentCenterDigit = hexNumbers[6];
    const hasOriginalCenter = wasCenterAtEntry.some(wasCenter => wasCenter);
    const hasCurrentCenter = normalizedInput.includes(currentCenterDigit.toString());
    const hasCenterDigit = hasOriginalCenter || hasCurrentCenter;
    
    if (hasInvalidDigits) {
      showBadNumbersToast();
      shakeInput();
    } else if (!hasCenterDigit) {
      showMissingMiddleToast();
      shakeInput();
    } else {
      // Valid submission
      foundWords++;
      successfulTurns++;
      foundNumbers.add(normalizedInput); // Add normalized version to found set
      const willAnyDigitDie = decrementDigitUsages();
      addToWordList(normalizedInput); // Add normalized version to word list
      updateStatsDisplay();
      
      // Store the normalized number before clearing input
      const submittedNumber = normalizedInput;
      currentInput = "";
      validDigitsAtEntry = []; // Clear the valid digits tracking
      digitValidityAtEntry = []; // Clear validity tracking
      wasCenterAtEntry = []; // Clear center tracking
      currentInputUsage = {}; // Clear input usage tracking
      updateInputDisplay();
      
      // Fetch and display number fact with slight delay, then calculate score
      setTimeout(async () => {
        // Only show regular toast if no digits will die (to avoid double toasts)
        let hasFact = false;
        if (!willAnyDigitDie) {
          hasFact = await showNumberFactToast(submittedNumber);
        }
        
        const points = calculateScore(submittedNumber, hasFact);
        totalScore += points;
        console.log(`Number: ${submittedNumber}, Points: ${points}, Total Score: ${totalScore}`);
        
        // Show combo toast if we have a streak
        if (hasFact && factStreak > 1) {
          showToast(fmt(STR.toasts.comboTemplate, {n: Math.min(factStreak, 3)}));
        }
        
        updateProgressScore();
        saveGameState(); // Save after each successful submission
        
        // Check if player reached Genius level (score 100+) and hasn't won yet
        if (totalScore >= 100 && !hasWon) {
          hasWon = true;
          // Mark game as completed in localStorage
          localStorage.setItem('numberbee_completed', 'true');
          
          // Start marker shake animation immediately
          const progressMarker = document.querySelector('.sb-progress-marker');
          if (progressMarker) {
            progressMarker.classList.add('marker-win-shake');
            
            // Always make marker clickable when user wins
            progressMarker.style.cursor = 'pointer';
            progressMarker.addEventListener('click', handleMarkerClick);
          }
          
          setTimeout(() => {
            showVictoryPopup();
          }, 1000); // Delay to let rank animation complete
        }
      }, 100);
    }
  }
}

function showBadNumbersToast() {
  showToast(STR.toasts.badNumbers);
}

function showMissingMiddleToast() {
  showToast(STR.toasts.missingMiddle);
}

function showAlreadyFoundToast() {
  showToast(STR.toasts.alreadyFound);
}

function showTooLongToast() {
  showToast(getRandomTooLongMessage());
}

function showDecimalToast() {
  showToast(getRandomDecimalMessage());
}

async function showNumberFactToast(numberString) {
  try {
    const fact = await getNumberFact(numberString);
    
    if (fact) {
      showToast(fact);
      return true; // Has fact
    } else {
      showToast(getRandomGenericMessage());
      return false; // No fact
    }
  } catch (error) {
    console.error('Error showing number fact:', error);
    showToast(getRandomGenericMessage());
    return false; // No fact
  }
}

function calculateScore(numberString, hasFact) {
  let score = 0;
  
  // Check if uses all digits
  const usedDigits = new Set(numberString.split('').map(d => parseInt(d)));
  const allDigits = new Set(hexNumbers);
  const usesAllDigits = usedDigits.size === allDigits.size && 
                       [...usedDigits].every(digit => allDigits.has(digit));
  
  if (usesAllDigits) {
    score = 5; // 5 points for using every digit (pangram bonus)
    factStreak = 0; // Reset streak for pangrams
  } else if (hasFact) {
    // Interesting numbers: length × multiplier (1x, 2x, or 3x based on streak)
    factStreak++;
    const multiplier = Math.min(factStreak, 3); // Cap at 3x
    score = numberString.length * multiplier;
  } else {
    score = 1; // 1 point for regular numbers
    factStreak = 0; // Reset streak for regular numbers
  }
  
  return score;
}

function updateProgressScore() {
  const progressValue = document.querySelector('.sb-progress-value');
  const progressMarker = document.querySelector('.sb-progress-marker');
  const beginnerLabel = document.querySelector('.beginner-label');
  const progressDots = document.querySelectorAll('.sb-progress-dot');
  
  // Define rank thresholds
  const ranks = RANKS;

  // Find current rank (use display score capped at 100)
  const displayScore = Math.min(totalScore, 100);
  let currentRank = ranks[0];
  let newRankIndex = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (displayScore >= ranks[i].points) {
      currentRank = ranks[i];
      newRankIndex = i;
      break;
    }
  }
  
  // Check if rank changed before updating
  const rankChanged = newRankIndex !== currentRankIndex;
  
  // Calculate position based on rank dots (not exact score)
  const markerPosition = (ranks[newRankIndex] && ranks[newRankIndex].position) || 0;
  
  // Always update marker position and dots (needed for page reload)
  // Always update marker position
  if (progressMarker) {
    progressMarker.style.left = `${markerPosition}%`;
  }
  
  // Update progress dots - passed ranks become yellow circles
  progressDots.forEach((dot, index) => {
    if (index < newRankIndex) {
      // Passed ranks: yellow circles
      dot.style.backgroundColor = '#f7da21';
    } else {
      // Future ranks: grey circles
      dot.style.backgroundColor = '#e0e0e0';
    }
  });
  
  // Update currentRankIndex after using it for comparison
  currentRankIndex = newRankIndex;
  
  
  // Update score display (cap at 50 for display purposes)
  if (progressValue) {
    if (isNegativeMode) {
      progressValue.dataset.originalText = displayScore.toString();
      progressValue.textContent = reverseText(displayScore.toString());
    } else {
      progressValue.textContent = displayScore.toString();
    }
  }
  
  // Update rank label with animation if rank changed
  if (beginnerLabel && rankChanged) {
    // Create temporary element for the old rank to slide out
    const oldRankElement = document.createElement('div');
    oldRankElement.style.position = 'absolute';
    oldRankElement.style.width = '100%';
    oldRankElement.style.height = '100%';
    oldRankElement.style.display = 'flex';
    oldRankElement.style.alignItems = 'center';
    oldRankElement.style.justifyContent = 'center';
    oldRankElement.style.fontFamily = 'Franklin, Arial, sans-serif';
    oldRankElement.style.fontSize = '16px';
    oldRankElement.style.fontWeight = '700';
    oldRankElement.style.color = '#121212';
    
    if (isNegativeMode) {
      oldRankElement.textContent = beginnerLabel.textContent;
    } else {
      oldRankElement.textContent = beginnerLabel.textContent;
    }
    
    oldRankElement.classList.add('rank-slide-out');
    beginnerLabel.appendChild(oldRankElement);
    
    // Create new rank element to slide in
    const newRankElement = document.createElement('div');
    newRankElement.style.position = 'absolute';
    newRankElement.style.width = '100%';
    newRankElement.style.height = '100%';
    newRankElement.style.display = 'flex';
    newRankElement.style.alignItems = 'center';
    newRankElement.style.justifyContent = 'center';
    newRankElement.style.fontFamily = 'Franklin, Arial, sans-serif';
    newRankElement.style.fontSize = '16px';
    newRankElement.style.fontWeight = '700';
    newRankElement.style.color = '#121212';
    
    if (isNegativeMode) {
      newRankElement.dataset.originalText = currentRank.name;
      newRankElement.textContent = reverseText(currentRank.name);
    } else {
      newRankElement.textContent = currentRank.name;
    }
    
    newRankElement.classList.add('rank-slide-in');
    beginnerLabel.appendChild(newRankElement);
    
    // Clear original text during animation
    beginnerLabel.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = '';
      }
    });
    
    // Clean up after animations
    setTimeout(() => {
      beginnerLabel.innerHTML = '';
      if (isNegativeMode) {
        beginnerLabel.dataset.originalText = currentRank.name;
        beginnerLabel.textContent = reverseText(currentRank.name);
      } else {
        beginnerLabel.textContent = currentRank.name;
      }
    }, 600);
  } else if (beginnerLabel) {
    // Just update text if no rank change
    if (isNegativeMode) {
      beginnerLabel.dataset.originalText = currentRank.name;
      beginnerLabel.textContent = reverseText(currentRank.name);
    } else {
      beginnerLabel.textContent = currentRank.name;
    }
  }
}

function showToast(message) {
  // Add message to queue
  toastQueue.push(message);
  
  // Process queue if not already showing a toast
  if (!isShowingToast) {
    processToastQueue();
  }
}

function processToastQueue() {
  if (toastQueue.length === 0) {
    isShowingToast = false;
    return;
  }
  
  isShowingToast = true;
  const message = toastQueue.shift();
  
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create and show toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  // Show reversed message in negative mode
  if (isNegativeMode) {
    toast.textContent = reverseText(message);
  } else {
    toast.textContent = message;
  }
  
  document.body.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Hide and remove toast after 2 seconds, then process next in queue
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
      // Process next toast in queue
      processToastQueue();
    }, 300);
  }, 2000);
}

function shakeInput() {
  const inputText = document.getElementById("inputText");
  inputText.classList.add('shake');
  
  // Remove shake class after animation
  setTimeout(() => {
    inputText.classList.remove('shake');
  }, 600);
}

function shuffleNumbers() {
  // Keep the center digit (index 6) fixed, shuffle only the outer 6
  const centerDigit = hexNumbers[6];
  const centerUsage = digitUsages[6];
  const outerDigits = hexNumbers.slice(0, 6);
  const outerUsages = digitUsages.slice(0, 6);
  
  // Fisher-Yates shuffle for the outer digits and their usages
  for (let i = outerDigits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outerDigits[i], outerDigits[j]] = [outerDigits[j], outerDigits[i]];
    [outerUsages[i], outerUsages[j]] = [outerUsages[j], outerUsages[i]];
  }
  
  // Reconstruct the arrays with shuffled outer digits and fixed center
  hexNumbers = [...outerDigits, centerDigit];
  digitUsages = [...outerUsages, centerUsage];
  
  // Animate only the text elements
  const textElements = document.querySelectorAll('.cell-letter');
  textElements.forEach((textEl, index) => {
    if (index !== 6) { // Don't animate center digit
      textEl.style.transition = 'opacity 0.3s ease';
      textEl.style.opacity = '0';
      
      setTimeout(() => {
        textEl.textContent = hexNumbers[index];
        textEl.style.opacity = '1';
      }, 300);
    }
  });
  
  // Update shake states after animation
  setTimeout(() => {
    displayNumbers();
    saveGameState(); // Save after shuffle
  }, 600);
}

function updateInputDisplay() {
  const inputText = document.getElementById("inputText");
  
  if (currentInput.length > 0) {
    hasStartedTyping = true;
    inputText.style.fontWeight = "700";
    
    // Color each digit based on whether it was valid when entered
    let coloredInput = "";
    const currentCenterDigit = hexNumbers[6]; // Current center digit
    
    // Build array of colored digits
    const coloredDigits = [];
    for (let i = 0; i < currentInput.length; i++) {
      const digit = parseInt(currentInput[i]);
      const wasValidWhenEntered = digitValidityAtEntry[i]; // Whether this position was valid when entered
      const wasCenterWhenEntered = wasCenterAtEntry[i]; // Whether this position was center when entered
      const isCurrentCenterDigit = digit === currentCenterDigit; // Whether this is the current center digit
      
      let color;
      // Check if this digit was valid when entered
      if (wasValidWhenEntered) {
        // This digit was valid when entered, color based on center status (past or present)
        if (wasCenterWhenEntered || isCurrentCenterDigit) {
          color = "#f7da21"; // Yellow for digits that were center when entered OR are current center
        } else {
          color = "#121212"; // Black for other valid digits
        }
      } else {
        // This digit was invalid when entered (dead or not in grid)
        color = "#DFDFDF"; // Grey for invalid digits
      }
      
      coloredDigits.push(`<span style="color: ${color}">${digit}</span>`);
    }
    
    // Join the digits in their current order (addToInput already handles prepending in negative mode)
    coloredInput = coloredDigits.join('');
    
    // In negative mode, cursor goes at the beginning since we prepend digits
    if (isNegativeMode) {
      inputText.innerHTML = '<span class="blinking-cursor"></span>' + coloredInput;
    } else {
      inputText.innerHTML = coloredInput + '<span class="blinking-cursor"></span>';
    }
  } else if (hasStartedTyping) {
    // Keep showing just cursor after starting to type
    inputText.style.fontWeight = "700";
    inputText.innerHTML = '<span class="blinking-cursor"></span>';
  } else {
    // Initial state - show instructions with cursor at the beginning
    inputText.style.fontWeight = "500";
    inputText.style.color = "#666";
    
    const instructionText = STR.inputPlaceholder;
    const displayText = isNegativeMode ? reverseText(instructionText) : instructionText;
    
    // Store original if not stored yet
    if (!inputText.dataset.originalText) {
      inputText.dataset.originalText = instructionText;
    }
    
    // In negative mode, cursor stays at beginning for consistency with input
    if (isNegativeMode) {
      inputText.innerHTML = '<span class="blinking-cursor"></span>' + displayText;
    } else {
      inputText.innerHTML = '<span class="blinking-cursor"></span>' + displayText;
    }
  }
}

function updateStatsDisplay() {
  const textElement = document.getElementById("wordsFoundText");
  const text = fmt(STR.wordsFoundTemplate, {n: foundWords});
  
  if (isNegativeMode && !textElement.dataset.originalText) {
    // Store original if not stored yet, then display reversed
    textElement.dataset.originalText = text;
    textElement.textContent = reverseText(text);
  } else if (isNegativeMode) {
    // Update original and display reversed
    textElement.dataset.originalText = text;
    textElement.textContent = reverseText(text);
  } else {
    // Normal mode
    textElement.textContent = text;
  }
}

function decrementDigitUsages() {
  let willAnyDigitDie = false;
  const digitsToReplace = []; // Collect all digits that need replacement
  
  // Decrement usage for each digit used in the current input (skip already dead digits)
  for (let i = 0; i < currentInput.length; i++) {
    const digit = parseInt(currentInput[i]);
    const digitIndex = hexNumbers.indexOf(digit);
    
    if (digitIndex !== -1 && digitUsages[digitIndex] > 0) {
      digitUsages[digitIndex]--;
      
      // If digit runs out of uses, mark it for replacement
      if (digitUsages[digitIndex] === 0) {
        willAnyDigitDie = true;
        digitsToReplace.push(digitIndex);
      }
    }
  }
  
  // Replace all dead digits sequentially to avoid conflicts
  digitsToReplace.forEach((digitIndex, replacementOrder) => {
    // Add small delay between replacements to avoid conflicts
    setTimeout(() => {
      replaceDigit(digitIndex, true); // Show death toast for normal deaths
    }, replacementOrder * 100); // 100ms delay between each replacement
  });
  
  // Update display to show new shake states after all replacements are done
  setTimeout(() => {
    displayNumbers();
  }, 50);
  
  return willAnyDigitDie;
}

function replaceDigit(index, showDeathToast = false) {
  const oldDigit = hexNumbers[index];
  
  // Funny pun messages for each digit when they die
  const digitDeathPuns = DIGIT_PUNS;

  // Add to cooldown
  digitCooldowns[oldDigit] = successfulTurns + 3;
  
  // Get available digits (not in current grid, not in cooldown, not being replaced)
  const usedDigits = new Set([...hexNumbers, ...digitsBeingReplaced]);
  const availableDigits = [];
  
  for (let digit = 0; digit <= 9; digit++) {
    if (!usedDigits.has(digit) && 
        (!digitCooldowns[digit] || digitCooldowns[digit] <= successfulTurns)) {
      availableDigits.push(digit);
    }
  }
  
  if (availableDigits.length > 0) {
    // Select replacement digit and immediately mark it as being replaced
    const randomIndex = Math.floor(Math.random() * availableDigits.length);
    const newDigit = availableDigits[randomIndex];
    digitsBeingReplaced.add(newDigit);
    
    // Also immediately update the hexNumbers array to prevent double-selection
    const originalDigit = hexNumbers[index];
    hexNumbers[index] = newDigit;
    
    const hexagon = document.querySelectorAll(".hive-cell")[index];
    
    // Stop shaking for 0.2s, then fade out
    hexagon.classList.remove('hex-shake', 'center-shake');
    
    setTimeout(() => {
      // Show emotional pun message when digit is about to die (only if requested)
      if (showDeathToast) {
        const puns = digitDeathPuns[oldDigit];
        const randomPun = puns[Math.floor(Math.random() * puns.length)];
        showToast(randomPun);
      }
      
      // Start fade out
      hexagon.classList.add('fade-out');
      
      setTimeout(() => {
        // Reset usage count (digit already assigned above)
        digitUsages[index] = 6; // Reset to 6 uses
        
        // Remove from being replaced set
        digitsBeingReplaced.delete(newDigit);
        
        // Remove fade out and start resurrection
        hexagon.classList.remove('fade-out');
        hexagon.classList.add('fade-in');
        
        // Update display after starting resurrection animation
        displayNumbers();
        saveGameState(); // Save after digit replacement
        
        // Remove fade-in class after animation completes
        setTimeout(() => {
          hexagon.classList.remove('fade-in');
        }, 600);
      }, 800); // Wait for dying animation to complete
    }, 200); // 0.2s pause after stopping shake
  }
}

function addToWordList(word) {
  const wordList = document.getElementById("wordList");
  const listItem = document.createElement("li");
  const span = document.createElement("span");
  span.className = "sb-anagram";
  
  if (isNegativeMode) {
    span.dataset.originalText = word;
    span.textContent = reverseText(word);
  } else {
    span.textContent = word;
  }
  
  listItem.appendChild(span);
  wordList.appendChild(listItem);
}

// Click handlers
document.querySelectorAll(".hive-cell").forEach((hex) => {
  hex.addEventListener("click", function () {
    const index = parseInt(this.dataset.index);
    const number = hexNumbers[index];
    addToInput(number);
  });
});

// Keyboard support
document.addEventListener("keydown", function (event) {
  if (event.key >= "0" && event.key <= "9") {
    const digit = parseInt(event.key);
    addToInput(digit);
  } else if (event.key === "Backspace" || event.key === "Delete") {
    deleteChar();
  } else if (event.key === "Enter") {
    submitInput();
  } else if (event.key.toLowerCase() === "r") {
    shuffleNumbers();
  } else if (event.key === "-" || event.key === "_") {
    toggleNegativeMode();
  } else if (event.key === "." || event.key === ",") {
    // Reject decimal points
    showDecimalToast();
    shakeInput();
  }
});

// Initialize
function initializeGame() {
  document.title = STR.pageTitle;

  // Try to load saved state first
  const loaded = loadGameState();
  
  if (!loaded) {
    // No saved state, generate new game
    generateRandomNumbers();
  }
  
  // Update displays based on current state
  displayNumbers();
  updateInputDisplay();
  updateStatsDisplay();
  updateProgressScore();
  
  // Restore word list if we have found numbers
  if (foundNumbers.size > 0) {
    foundNumbers.forEach(number => {
      addToWordList(number);
    });
  }
  
  // Apply negative mode if it was active
  if (isNegativeMode) {
    // Force update displays to show reversed text
    setTimeout(() => {
      updateInputDisplay();
      updateStatsDisplay();
      updateProgressScore();
      
      // Apply negative mode styling to all elements
      const allTextElements = [
        document.querySelector('.title'),
        document.querySelector('.beginner-label'),
        document.querySelector('.sb-progress-value'),
        document.querySelector('#wordsFoundText'),
        document.querySelector('#inputText'),
        document.querySelector('.restart-btn'),
        ...document.querySelectorAll('.sb-anagram'),
        ...document.querySelectorAll('.btn:not(.circular)')
      ].filter(el => el !== null);
      
      // Handle SVG rotation for circular button
      const circularBtn = document.querySelector('.btn.circular');
      if (circularBtn) {
        const svg = circularBtn.querySelector('svg');
        if (svg) {
          svg.style.transition = 'transform 0.3s ease';
          svg.style.transform = 'rotate(180deg)';
        }
      }
      
      allTextElements.forEach(el => {
        if (el.textContent && !el.dataset.originalText) {
          // Store and reverse text content
          el.dataset.originalText = el.textContent;
          el.textContent = reverseText(el.textContent);
        }
      });
    }, 100);
  }
}

// Expose handlers referenced by inline onclick attributes (both static
// markup and the victory/wait popups built dynamically via innerHTML).
window.restartGame = restartGame;
window.deleteChar = deleteChar;
window.shuffleNumbers = shuffleNumbers;
window.submitInput = submitInput;
window.admirepuzzle = admirepuzzle;
window.playAgain = playAgain;
window.closeWaitPopup = closeWaitPopup;

// Start the game
async function boot(){
  await loadAssets();
  initializeGame();
}
boot();

})();
