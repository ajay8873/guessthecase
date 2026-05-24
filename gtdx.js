document.addEventListener('DOMContentLoaded', () => {
  const diseases = JSON.parse(document.getElementById('disease-data').textContent);
  const doctoraj = document.getElementById('doctoraj-data').dataset.id;
  const symptoms = JSON.parse(document.getElementById('symptom-data').textContent);
  const synonymsAttr = document.getElementById('doctoraj-data').dataset.synonyms;
  const currentSynonyms = synonymsAttr ? JSON.parse(synonymsAttr).map(s => s.toLowerCase()) : [];
  const modal = document.getElementById("result-modal");
  const modalMessage = document.getElementById("modal-message");
  const modalShareBtn = document.getElementById("modal-share-btn");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalCopyMsg = document.getElementById("modal-copy-message");

  // Check if this is an archive game
  const isArchiveMode = document.getElementById('doctoraj-data').dataset.archive === 'true';
  const caseType = document.documentElement.dataset.theme === 'nejm' ? 'nejm' : 'standard';

  let guessNumber = 0;
  let puzzleStartTime = null;
  let selectedDiseaseId = null;
  let gameCompleted = false;
  let cookiesAccepted = false;
  let guessedDiseases = []; // Track diseases that have been guessed
  let guessHistory = []; // Track { name, result } for each guess (daily game only)

  // Updated statistics object with guess distribution
  let gameStats = {
    gamesPlayed: 0,
    totalGuesses: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedDate: null,
    wins: 0,
    guessDistribution: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0
    }
  };

  // Function to calculate today's disease number
  function getTodaysDiseaseNumber() {
    // Start date: July 16, 2025 in CDT
    const startDate = new Date('2025-07-16T00:00:00-05:00'); // CDT is UTC-5
    const now = new Date();

    // Calculate days since start date
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

    return daysSinceStart;
  }

  function getLastGameResult() {
    // If current game is completed, use current game data
    if (gameCompleted) {
      const resultEl = document.getElementById('result_class');
      const won = resultEl && resultEl.classList.contains('correct');
      return { won, guessCount: guessNumber };
    }

    // Otherwise, assume last game was a win if current streak > 0, loss if streak = 0
    const won = gameStats.currentStreak > 0;
    // For guess count, use average or default to 3 for wins, 6 for losses
    const avgGuesses = gameStats.totalGuesses > 0 ? Math.round(gameStats.totalGuesses / gameStats.gamesPlayed) : (won ? 3 : 6);
    return { won, guessCount: Math.min(avgGuesses, 6) };
  }

  // Function to generate share text with new format
  function generateShareText(won, guessCount) {
    const diseaseNumber = getTodaysDiseaseNumber();
    let shareString = `DoctorAJ #${diseaseNumber}\n🏥 `;

    // Create array of 6 positions for guesses
    const guessEmojis = [];

    for (let i = 1; i <= 6; i++) {
      if (i < guessCount) {
        // Previous guesses were wrong
        guessEmojis.push('🟥');
      } else if (i === guessCount) {
        // Current guess - correct if won, wrong if lost
        guessEmojis.push(won ? '🟩' : '🟥');
      } else {
        // Unused guesses (black boxes)
        guessEmojis.push('⬛');
      }
    }

    // Join with spaces
    shareString += guessEmojis.join(' ');
    shareString += '\n\nhttps://doctoraj.org';

    return shareString;
  }

  // Cookie utility functions
  function setCookie(name, value, days) {
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      const cookieString = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
      document.cookie = cookieString;
      // console.log(`[DEBUG] Cookie set: ${name} = ${value.substring(0, 50)}... (${value.length} chars)`);

      // Verify the cookie was actually set
      const verification = getCookie(name);
      if (verification) {
        // console.log(`[DEBUG] Cookie verification successful: ${name}`);
      } else {
        // console.error(`[ERROR] Cookie verification failed: ${name}`);
      }
    } catch (error) {
      // console.error(`[ERROR] Failed to set cookie:`, error);
    }
  }

  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  function deleteCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }

  // Google Analytics tracking function
  function sendGuessToAnalytics(guessCount, won) {
    // console.log(`[DEBUG] sendGuessToAnalytics called: guesses=${guessCount}, won=${won}`);
    // console.log(`[DEBUG] gtag available: ${typeof gtag !== 'undefined'}`);

    if (typeof gtag !== 'undefined') {
      // Get today's disease number for the event
      const todaysDiseaseNumber = getTodaysDiseaseNumber();

      // For losses, use guess count 7 to separate from 6-guess wins
      const analyticsGuessCount = won ? guessCount : 7;

      // console.log(`[DEBUG] Sending analytics: disease=${todaysDiseaseNumber}, guesses=${analyticsGuessCount}, result=${won ? 'win' : 'loss'}`);

      // Send custom event to Google Analytics
      gtag('event', 'game_complete', {
        'custom_parameter_1': analyticsGuessCount,
        'custom_parameter_2': won ? 'win' : 'loss',
        'custom_parameter_3': todaysDiseaseNumber,
        'event_category': 'game',
        'event_label': `${analyticsGuessCount}_guesses_${won ? 'win' : 'loss'}`
      });

      // console.log(`[DEBUG] Analytics event sent successfully`);
    } else {
      // console.log(`[DEBUG] gtag not available - analytics not sent`);
    }
  }

  function sendPuzzleCompleteEvent(guessesUsed, solved) {
    if (typeof gtag !== 'undefined') {
      const elapsed = puzzleStartTime ? Math.round((Date.now() - puzzleStartTime) / 1000) : null;
      gtag('event', 'puzzle_complete', {
        puzzle_id: doctoraj,
        case_type: caseType,
        time_seconds: elapsed,
        custom_parameter_1: guessesUsed,
        solved: solved,
        is_archive: isArchiveMode
      });
    }
  }

  // Fetch percentile ranking from backend
  async function fetchPercentileRanking(guessCount, won = true) {
    try {
      const response = await fetch(`/api/percentile/?guesses=${guessCount}&won=${won}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.percentile !== null ? data : null;
    } catch (error) {
      // console.error('Error fetching percentile data:', error);
      return null;
    }
  }

  // Statistics functions
  function loadStats() {
    if (!cookiesAccepted) return;

    const savedStats = getCookie('doctoraj_stats');
    if (savedStats) {
      try {
        const parsed = JSON.parse(savedStats);
        gameStats = { ...gameStats, ...parsed };

        // Ensure guess distribution exists (for backward compatibility)
        if (!gameStats.guessDistribution) {
          gameStats.guessDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        }
      } catch (e) {
        // console.error('Error loading stats:', e);
        resetStats();
      }
    }
  }

  function saveStats() {
    if (!cookiesAccepted) return;
    setCookie('doctoraj_stats', JSON.stringify(gameStats), 365);
  }

  function resetStats() {
    gameStats = {
      gamesPlayed: 0,
      totalGuesses: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      wins: 0,
      guessDistribution: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0
      }
    };
    saveStats();
  }

  function updateStats(won, guessCount) {
    if (!cookiesAccepted || isArchiveMode) return;

    const today = new Date().toDateString();
    const lastPlayed = gameStats.lastPlayedDate;

    // Check if this is a consecutive day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = lastPlayed === yesterday.toDateString();

    // Update basic stats
    gameStats.gamesPlayed += 1;
    gameStats.totalGuesses += guessCount;
    gameStats.lastPlayedDate = today;

    if (won) {
      gameStats.wins += 1;

      // Update guess distribution
      if (guessCount >= 1 && guessCount <= 6) {
        gameStats.guessDistribution[guessCount]++;
      }

      // Update streak
      if (isConsecutive || gameStats.currentStreak === 0) {
        gameStats.currentStreak += 1;
      } else {
        gameStats.currentStreak = 1;
      }

      // Update longest streak
      if (gameStats.currentStreak > gameStats.longestStreak) {
        gameStats.longestStreak = gameStats.currentStreak;
      }
    } else {
      // Lost - reset current streak
      gameStats.currentStreak = 0;
    }

    saveStats();
  }

  function getWinPercentage() {
    if (gameStats.gamesPlayed === 0) return 0;
    return Math.round((gameStats.wins / gameStats.gamesPlayed) * 100);
  }

  function createGuessDistributionChart(highlightGuess = null) {
    const maxCount = Math.max(...Object.values(gameStats.guessDistribution));

    let chartHTML = '<div class="guess-distribution-chart">';
    chartHTML += '<h4 style="margin: 0 0 1rem 0; color: #5a3e2b; font-size: 1rem;">Guess Distribution</h4>';

    for (let i = 1; i <= 6; i++) {
      const count = gameStats.guessDistribution[i] || 0;

      // Calculate proportional width based on count vs max count
      let barWidth = 0;
      if (count > 0 && maxCount > 0) {
        barWidth = (count / maxCount) * 100;
        // Ensure minimum width of 20% for visibility when count > 0
        barWidth = Math.max(barWidth, 20);
      }

      // Highlight today's guess count
      const isHighlighted = highlightGuess === i;
      const numberClass = isHighlighted ? 'guess-number highlighted' : 'guess-number';

      chartHTML += `
      <div class="distribution-row">
        <div class="${numberClass}">${i}</div>
        <div class="distribution-bar-container">
          ${count > 0 ? `
            <div class="distribution-bar" style="width: ${barWidth}%; position: relative;">
              <div class="distribution-count" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: white; font-weight: bold; font-size: 0.9rem;">${count}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    }

    chartHTML += '</div>';
    return chartHTML;
  }

  function openStatsModal() {
    if (!cookiesAccepted) return;

    const stats = formatStatsDisplay();
    const statsContent = createStatsDisplay(stats);

    modalMessage.innerHTML = statsContent;
    modalCopyMsg.style.display = "none";

    // Show share button for stats modal if game has been played
    if (gameStats.gamesPlayed > 0) {
      const lastGame = getLastGameResult();
      const shareText = generateShareText(lastGame.won, lastGame.guessCount);
      modalShareBtn.style.display = "inline-block";
      modalShareBtn.onclick = () => {
        navigator.clipboard.writeText(shareText).then(() => {
          modalCopyMsg.style.display = "block";
          setTimeout(() => modalCopyMsg.style.display = "none", 2000);
        });
        if (typeof gtag !== 'undefined') {
          gtag('event', 'share_result', {
            puzzle_id: doctoraj,
            case_type: caseType,
            share_method: 'clipboard',
            is_archive: isArchiveMode
          });
        }
      };
    } else {
      modalShareBtn.style.display = "none";
    }

    modal.classList.add("modal-visible");
    modal.classList.remove("modal-hidden");
  }

  function formatStatsDisplay() {
    return {
      gamesPlayed: gameStats.gamesPlayed,
      winPercentage: getWinPercentage(),
      currentStreak: gameStats.currentStreak,
      longestStreak: gameStats.longestStreak
    };
  }

  // Cookie notification functions
  function showCookieNotification() {
    const notification = document.getElementById('cookie-notification');
    if (notification) {
      notification.classList.remove('hidden');
      notification.classList.add('show');
    }
  }

  function hideCookieNotification() {
    const notification = document.getElementById('cookie-notification');
    if (notification) {
      notification.classList.remove('show');
      notification.classList.add('hidden');
    }
  }

  function showGameDisabledOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'game-disabled-overlay';
    overlay.innerHTML = `
      <div class="game-disabled-content">
        <h3>🍪 Cookies Required</h3>
        <p>DoctorAJ uses essential cookies to save your game progress and ensure fair play. Please accept cookies to continue playing.</p>
        <button id="overlay-accept" class="btn_color">Accept Cookies & Play</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Handle overlay buttons
    document.getElementById('overlay-accept').onclick = () => {
      acceptCookies();
      document.body.removeChild(overlay);
    };
  }

  function acceptCookies() {
    cookiesAccepted = true;
    setCookie('doctoraj_cookies_accepted', 'true', 365); // Valid for 1 year
    localStorage.setItem('doctoraj_ga_consent', 'granted');
    if (typeof gtag !== 'undefined') {
      gtag('consent', 'update', { analytics_storage: 'granted' });
    }
    hideCookieNotification();
    initializeGame();
  }

  function declineCookies() {
    cookiesAccepted = false;
    localStorage.setItem('doctoraj_ga_consent', 'denied');
    hideCookieNotification();
    showGameDisabledOverlay();
    disableGameInput();
  }

  function checkCookieConsent() {
    const consent = getCookie('doctoraj_cookies_accepted');
    if (consent === 'true') {
      cookiesAccepted = true;
      if (!localStorage.getItem('doctoraj_ga_consent')) {
        localStorage.setItem('doctoraj_ga_consent', 'granted');
      }
      return true;
    }
    return false;
  }

  // Game state management
  function getGameStateKey() {
    const today = new Date().toDateString();
    const key = `doctoraj_${doctoraj}_${today}`;
    // console.log(`[DEBUG] Game state key: ${key}`);
    return key;
  }

  function saveGameState() {
    if (!cookiesAccepted) {
      // console.log(`[DEBUG] Cannot save game state - cookies not accepted`);
      return;
    }

    // Don't save game state for archive games - they should always start fresh
    if (isArchiveMode) {
      return;
    }

    const gameState = {
      guessNumber: guessNumber,
      gameCompleted: gameCompleted,
      revealedSymptoms: [],
      gameResult: null,
      guessedDiseases: guessedDiseases,
      guessHistory: guessHistory
    };

    // console.log(`[DEBUG] Saving game state: guesses=${guessNumber}, completed=${gameCompleted}`);

    // Track which symptoms have been revealed
    for (let i = 2; i <= 6; i++) {
      const symptomEl = document.getElementById(`guess_${i === 2 ? 'two' : i === 3 ? 'three' : i === 4 ? 'four' : i === 5 ? 'five' : 'six'}`);
      if (symptomEl && symptomEl.textContent.trim()) {
        gameState.revealedSymptoms.push({
          index: i - 2,
          symptom: symptomEl.textContent.trim()
        });
        // console.log(`[DEBUG] Saving symptom ${i}: ${symptomEl.textContent.trim()}`);
      }
    }

    // If game is completed, save the result
    if (gameCompleted) {
      const resultEl = document.getElementById('result_class');
      gameState.gameResult = {
        isCorrect: resultEl.classList.contains('correct'),
        message: resultEl.textContent,
        guessCount: guessNumber,
        won: resultEl.classList.contains('correct')
      };
      // console.log(`[DEBUG] Saving game result: ${gameState.gameResult.message}, correct=${gameState.gameResult.isCorrect}`);
    }

    try {
      // Use localStorage for daily game state (Safari 26 compatible)
      const stateString = JSON.stringify(gameState);
      localStorage.setItem(getGameStateKey(), stateString);
      // ] Game state saved to localStorage: ${getGameStateKey()}`);
    } catch (error) {
      // console.error(`[ERROR] Failed to save game state:`, error);
    }
  }

  function loadGameState() {
    if (!cookiesAccepted) return false;

    // Archive games should always start fresh - don't load saved state
    if (isArchiveMode) return false;

    const gameStateKey = getGameStateKey();

    try {
      // Try loading from localStorage first (new Safari 26 compatible method)
      const savedState = localStorage.getItem(gameStateKey);

      if (!savedState) {
        // Fallback: try loading from old cookie format
        const cookieState = getCookie(gameStateKey);
        if (cookieState) {
          // console.log(`[DEBUG] Found old cookie format, migrating to localStorage`);
          // Clear old cookie and skip loading it (Safari 26 issue)
          deleteCookie(gameStateKey);
        }
        return false;
      }

      // console.log(`[DEBUG] Loading from localStorage: ${gameStateKey}`);
      const gameState = JSON.parse(savedState);
      // console.log(`[DEBUG] Successfully loaded from localStorage`);

      guessNumber = gameState.guessNumber;
      gameCompleted = gameState.gameCompleted;
      guessedDiseases = gameState.guessedDiseases || [];
      guessHistory = gameState.guessHistory || [];
      renderInlineGuessHistory();

      // console.log(`[DEBUG] Game state loaded: guesses=${guessNumber}, completed=${gameCompleted}`);

      // Restore revealed symptoms
      if (gameState.revealedSymptoms) {
        gameState.revealedSymptoms.forEach(symptomData => {
          const symptomIds = ['guess_two', 'guess_three', 'guess_four', 'guess_five', 'guess_six'];
          const symptomEl = document.getElementById(symptomIds[symptomData.index]);
          if (symptomEl) {
            symptomEl.textContent = symptomData.symptom;
            symptomEl.classList.add('hints_shown');
          }
        });
      }

      // If game is completed, make sure all symptoms are revealed
      if (gameCompleted) {
        // console.log(`[DEBUG] Game completed - revealing all symptoms`);
        revealAllHints();

        // Reveal symptoms based on guess count
        for (let i = 1; i < guessNumber && i <= 5; i++) {
          const symptomIds = ['guess_two', 'guess_three', 'guess_four', 'guess_five', 'guess_six'];
          const symptomEl = document.getElementById(symptomIds[i - 1]);
          if (symptomEl && symptoms[i - 1] && !symptomEl.textContent.trim()) {
            symptomEl.textContent = symptoms[i - 1];
            symptomEl.classList.add('hints_shown');
          }
        }
      }

      // Restore game result if completed
      if (gameCompleted && gameState.gameResult) {
        const resultEl = document.getElementById('result_class');
        resultEl.textContent = gameState.gameResult.message;
        resultEl.classList.add('result');
        if (gameState.gameResult.isCorrect) {
          resultEl.classList.add('correct');
        } else {
          resultEl.classList.add('incorrect');
        }

        disableGameInput();
        showSummaryButton();

        // Show the results modal automatically when page is loaded with completed game (and game view is active)
        setTimeout(() => {
          const gameView = document.getElementById('game-view');
          if (gameView && !gameView.classList.contains('hidden')) {
            if (window.showCompletedModal) {
              window.showCompletedModal();
            }
          }
        }, 100);
      }

      return true;
    } catch (e) {
      // console.error('[ERROR] Failed to load from localStorage:', e);
      // Clear corrupted localStorage
      localStorage.removeItem(gameStateKey);
      return false;
    }
  }

  function disableGameInput() {
    const input = document.getElementById("guess");
    const submitBtn = document.getElementById('submit-btn');
    const suggestions = document.getElementById('suggestions');

    if (input) {
      if (gameCompleted) {
        // Find today's disease name
        const correctDisease = diseases.find(d => d.id == doctoraj);
        const diseaseName = correctDisease ? correctDisease.name : "unknown";
        input.placeholder = `${diseaseName}`;
      } else {
        input.placeholder = "Accept cookies to play";
      }
      input.disabled = true;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = gameCompleted ? "Game Complete" : "Cookies Required";
      submitBtn.style.opacity = "0.6";
      submitBtn.style.cursor = "not-allowed";
    }
    if (suggestions) {
      suggestions.style.display = 'none';
    }
  }

  function enableGameInput() {
    const input = document.getElementById("guess");
    const submitBtn = document.getElementById('submit-btn');

    if (input && !gameCompleted) {
      input.disabled = false;
      input.placeholder = "Diagnosis...";
    }
    if (submitBtn && !gameCompleted) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
      submitBtn.style.opacity = "1";
      submitBtn.style.cursor = "pointer";
    }
  }

  function cleanupOldGameStates() {
    if (!cookiesAccepted) return;

    const today = new Date().toDateString();
    const cookies = document.cookie.split(';');

    cookies.forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName.startsWith('doctoraj_') && !cookieName.includes(today) &&
        cookieName !== 'doctoraj_cookies_accepted' && cookieName !== 'doctoraj_stats') {
        deleteCookie(cookieName);
      }
    });
  }

  function initializeGame() {
    if (!cookiesAccepted) {
      disableGameInput();
      return;
    }

    loadStats(); // Load statistics
    const hasExistingGame = loadGameState();
    cleanupOldGameStates();
    enableGameInput();

    if (typeof gtag !== 'undefined') {
      puzzleStartTime = Date.now();
      gtag('event', 'puzzle_start', {
        puzzle_id: doctoraj,
        case_type: caseType,
        is_archive: isArchiveMode
      });
    }

    // Set up stats button click handler
    const statsBtn = document.getElementById('stats-button');
    if (statsBtn) {
      statsBtn.onclick = openStatsModal;
    }
  }

  // Initialize cookie notification system
  function initializeCookieSystem() {
    if (checkCookieConsent()) {
      initializeGame();
    } else {
      showCookieNotification();
      disableGameInput();
    }

    // Set up cookie notification event handlers
    const acceptBtn = document.getElementById('cookie-accept');
    const declineBtn = document.getElementById('cookie-decline');

    if (acceptBtn) {
      acceptBtn.onclick = acceptCookies;
    }

    if (declineBtn) {
      declineBtn.onclick = declineCookies;
    }
  }

  // Grab share-related elements early and safely
  const shareButton = document.getElementById("share-button");
  const shareResult = document.getElementById("share-result");
  const copyMessage = document.getElementById("copy-message");

  if (shareButton) shareButton.style.display = "none";
  if (shareResult) shareResult.style.display = "none";
  if (copyMessage) copyMessage.style.display = "none";

  function createStatsDisplay(stats, highlightGuess = null) {
    const distributionChart = createGuessDistributionChart(highlightGuess);

    return `
      <div class="stats-container">
        <h3 style="margin-top: 0; color: #5a3e2b;">📊 Your Statistics</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-number">${stats.gamesPlayed}</div>
            <div class="stat-label">Games Played</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${stats.winPercentage}%</div>
            <div class="stat-label">Win Rate</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${stats.currentStreak}</div>
            <div class="stat-label">Current Streak</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${stats.longestStreak}</div>
            <div class="stat-label">Longest Streak</div>
          </div>
        </div>
        ${distributionChart}
      </div>
    `;
  }

  function openModal(message, shareText = null, showStats = false, guessCount = null, won = true) {
    const nejmLink = window.NEJM_LINK;
    if (nejmLink) {
      message = message + `<a href="${nejmLink}" target="_blank" rel="noopener noreferrer" class="nejm-case-card">
        <div class="nejm-case-card-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5b7fa6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" flex-shrink="0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          <div>
            <div class="nejm-case-card-title">Read the full case on NEJM</div>
            <div class="nejm-case-card-sub">View the original case report.</div>
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b7fa6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>`;
    }

    let modalContent = message;

    if (showStats) {
      const stats = formatStatsDisplay();
      // Highlight the guess count if it's a win
      const highlightGuess = won ? guessCount : null;
      modalContent = `<div style="text-align: center;">${message}</div>${createStatsDisplay(stats, highlightGuess)}`;
    } else if (isArchiveMode) {
      // For archive games, add custom message below diagnosis
      const archiveNumber = doctoraj;
      let archiveMessage = '';
      if (won) {
        archiveMessage = `<div style="margin-top: 1rem; padding: 0.75rem; background-color: #e6f3ff; border-radius: 8px; border: 2px solid #2196F3;">
          <strong>You got DoctorAJ #${archiveNumber} in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}!</strong>
        </div>`;
      } else {
        archiveMessage = `<div style="margin-top: 1rem; padding: 0.75rem; background-color: #fff3e0; border-radius: 8px; border: 2px solid #ff9800;">
          <strong>Better luck next time!</strong>
        </div>`;
      }
      modalContent = `<div style="text-align: center; width: 100%;">${message}${archiveMessage}</div>`;
    } else {
      // For other games without stats, ensure full width
      modalContent = `<div style="text-align: center; width: 100%;">${message}</div>`;
    }

    modalMessage.innerHTML = modalContent;
    modalCopyMsg.style.display = "none";

    // Add Explain My Guesses with AI section (always show it for case review!)
    const actualWrongGuesses = guessHistory
      .filter(g => g.result === 'wrong' && g.name && g.name.toLowerCase() !== 'skipped')
      .map(g => g.name);

    const explainSection = document.createElement('div');
    explainSection.id = 'ai-explain-section';
    
    const buttonText = actualWrongGuesses.length > 0 
      ? '🧠 Explain My Guesses with AI' 
      : '🧠 Learn More: Clinical AI Summary';

    explainSection.innerHTML = `
      <div class="ai-explain-btn-container" id="ai-explain-btn-container">
        <button id="btn-explain-ai" class="btn-explain-ai">${buttonText}</button>
      </div>
      <div id="ai-explain-result"></div>
    `;
    modalMessage.appendChild(explainSection);

    const explainBtn = document.getElementById('btn-explain-ai');
    const explainResult = document.getElementById('ai-explain-result');
    const explainBtnContainer = document.getElementById('ai-explain-btn-container');

    explainBtn.addEventListener('click', async () => {
      explainBtn.disabled = true;
      explainBtn.innerHTML = `<span class="spinner" style="display: inline-block; vertical-align: middle; margin-right: 8px;"></span> Contacting Gemini AI...`;
      
      try {
        const correctDisease = diseases.find(d => d.id == doctoraj);
        const correctDiagnosis = correctDisease ? correctDisease.name : 'Unknown';
        const savedKey = localStorage.getItem('doctoraj_gemini_key') || '';

        const response = await fetch('/api/explain-guesses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': savedKey
          },
          body: JSON.stringify({
            correctDiagnosis,
            incorrectGuesses: actualWrongGuesses,
            apiKey: savedKey
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to explain guesses.");
        }

        const data = await response.json();
        explainBtnContainer.style.display = 'none';
        explainResult.innerHTML = `
          <div class="ai-explain-box">
            <div class="ai-explain-title">🧠 Clinical AI Analysis</div>
            <div class="ai-explain-content">${data.explanation}</div>
          </div>
        `;
      } catch (err) {
        console.error("AI Explanation error:", err);
        explainBtn.disabled = false;
        explainBtn.innerHTML = `❌ Error: ${err.message}. Try Again.`;
      }
    });

    // Only show share button if not in archive mode
    // console.log(`[DEBUG openModal] shareText: ${shareText}, isArchiveMode: ${isArchiveMode}, showButton: ${shareText && !isArchiveMode}`);
    if (shareText && !isArchiveMode) {
      // console.log('[DEBUG] Showing share button');
      modalShareBtn.style.display = "inline-block";
      modalShareBtn.onclick = () => {
        navigator.clipboard.writeText(shareText).then(() => {
          modalCopyMsg.style.display = "block";
          setTimeout(() => modalCopyMsg.style.display = "none", 2000);
        });
        if (typeof gtag !== 'undefined') {
          gtag('event', 'share_result', {
            puzzle_id: doctoraj,
            case_type: caseType,
            share_method: 'clipboard',
            is_archive: isArchiveMode
          });
        }
      };
    } else {
      // console.log('[DEBUG] Hiding share button');
      modalShareBtn.style.display = "none";
    }

    // Show modal immediately
    modal.classList.add("modal-visible");
    modal.classList.remove("modal-hidden");

    // Add percentile ranking asynchronously after modal is shown
    if (showStats && guessCount) {
      fetchPercentileRanking(guessCount, won).then(percentileData => {
        if (percentileData && percentileData.tier) {
          let message, bgColor, borderColor;

          if (percentileData.tier === "not in top 50%") {
            message = "You were not in the top 50% of players today, better luck tomorrow!";
            bgColor = "#fff3e0";
            borderColor = "#ff9800";
          } else {
            message = `🧠 You were in the ${percentileData.tier} of players today!`;
            bgColor = "#e6f3ff";
            borderColor = "#2196F3";
          }

          const percentileDiv = `<div style="margin-top: 1rem; padding: 0.75rem; background-color: ${bgColor}; border-radius: 8px; border: 2px solid ${borderColor};">
            <strong>${message}</strong>
          </div>`;
          modalMessage.innerHTML += percentileDiv;
        }
      });
    }
  }

  function closeModal() {
    modal.classList.remove("modal-visible");
    modal.classList.add("modal-hidden");
  }

  modalCloseBtn.onclick = closeModal;

  window.showCompletedModal = () => {
    if (gameCompleted) {
      // Find saved game state to get guessCount and won
      const gameStateKey = getGameStateKey();
      const savedState = localStorage.getItem(gameStateKey);
      let guessCount = guessNumber;
      let isWon = false;
      
      const resultEl = document.getElementById('result_class');
      if (resultEl) {
        isWon = resultEl.classList.contains('correct');
      }

      if (savedState) {
        try {
          const gameState = JSON.parse(savedState);
          if (gameState.gameResult) {
            guessCount = gameState.gameResult.guessCount;
            isWon = gameState.gameResult.won;
          }
        } catch (e) {}
      }

      const correctDisease = diseases.find(d => d.id == doctoraj);
      const diseaseName = correctDisease ? correctDisease.name : "unknown";
      const shareText = isArchiveMode ? null : generateShareText(isWon, guessCount);

      if (isWon) {
        const winMessage = `<div style="padding: 0.75rem; background-color: #e6f3ff; border-radius: 8px; border: 2px solid #2196F3; margin-bottom: 1rem;">
          <strong>🎉 Correct! The diagnosis was ${diseaseName}.</strong>
        </div>`;
        const showPercentiles = !isArchiveMode;
        openModal(winMessage, shareText, showPercentiles, guessCount, true);
      } else {
        const lossMessage = `<div style="padding: 0.75rem; background-color: #fff3e0; border-radius: 8px; border: 2px solid #ff9800; margin-bottom: 1rem;">
          <strong>❌ Game Over! The diagnosis was ${diseaseName}.</strong>
        </div>`;
        const showPercentiles = !isArchiveMode;
        openModal(lossMessage, shareText, showPercentiles, guessCount, false);
      }
    }
  };

  function showSummaryButton() {
    const description = JSON.parse(document.getElementById('description-data').textContent);
    if (!description) return;

    const correctDisease = diseases.find(d => d.id == doctoraj);
    const diseaseName = correctDisease ? correctDisease.name : 'Diagnosis Summary';
    const summaryTitle = document.querySelector('.summary-title');
    if (summaryTitle) summaryTitle.textContent = diseaseName;
    const summaryText = document.getElementById('disease-summary-text');
    if (summaryText) summaryText.textContent = description;

    // Anki tag buttons — show each only if its value is non-empty
    const anki1 = JSON.parse(document.getElementById('anki1-data').textContent);
    const anki2 = JSON.parse(document.getElementById('anki2-data').textContent);
    const step1Btn = document.getElementById('anki-step1-btn');
    const step2Btn = document.getElementById('anki-step2-btn');
    const ankiRow = document.getElementById('anki-btn-row');
    if (step1Btn && anki1) {
      step1Btn.style.display = 'inline-block';
      step1Btn.addEventListener('click', () => copyAnkiTag(step1Btn, anki1));
    }
    if (step2Btn && anki2) {
      step2Btn.style.display = 'inline-block';
      step2Btn.addEventListener('click', () => copyAnkiTag(step2Btn, anki2));
    }
    if (ankiRow && (anki1 || anki2)) ankiRow.style.display = 'flex';

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.style.display = 'none';
    const btn = document.getElementById('summary-btn');
    if (btn) btn.style.display = 'inline-block';
  }

  function copyAnkiTag(btn, tag) {
    const original = btn.textContent;
    const showCopied = () => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    };

    if (typeof gtag !== 'undefined') {
      gtag('event', 'anki_tag_click', {
        tag_name: tag,
        puzzle_id: doctoraj,
        case_type: caseType,
        is_archive: isArchiveMode
      });
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(tag).then(showCopied);
    } else {
      // Fallback for HTTP / older mobile browsers
      const textarea = document.createElement('textarea');
      textarea.value = tag;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showCopied();
    }
  }

  const cardFlipInner = document.getElementById('card-flip-inner');

  const summaryBtn = document.getElementById('summary-btn');
  if (summaryBtn) {
    summaryBtn.addEventListener('click', () => {
      if (!cardFlipInner) return;
      const flipped = cardFlipInner.classList.toggle('flipped');
      summaryBtn.textContent = flipped ? '← Clues' : '+ Diagnosis Summary';
    });
  }

  function renderInlineGuessHistory() {
    const list = document.getElementById('guess-history-list');
    if (!list) return;
    list.innerHTML = guessHistory.map((g, i) => {
      const icon = g.result === 'correct' ? '✓' : g.result === 'skip' ? '—' : '✗';
      return `<div class="guess-history-item ${g.result}">
      <span class="guess-history-badge">${i + 1}</span>
      <span class="guess-history-name">${g.name}</span>
      <span class="guess-history-icon">${icon}</span>
    </div>`;
    }).join('');
  }

  function revealAllHints() {
    const hintElements = ['guess_two', 'guess_three', 'guess_four', 'guess_five', 'guess_six'];

    hintElements.forEach((elementId, index) => {
      const el = document.getElementById(elementId);
      // Only reveal if the symptom hasn't been shown yet
      if (el && !el.textContent.trim() && symptoms[index]) {
        el.textContent = symptoms[index];
        el.classList.remove('flip_in');
        void el.offsetWidth; // Force reflow
        el.classList.add('flip_in', 'hints_shown');
      }
    });
  }

  function guessing() {
    if (gameCompleted || !cookiesAccepted) {
      return;
    }

    const input = document.getElementById("guess");
    const inputValue = input.value.trim();

    // Clear any previous result message immediately
    const resultEl = document.getElementById('result_class');
    resultEl.classList.remove('fade_in', 'result', 'correct', 'incorrect');
    resultEl.textContent = "";

    let myGuessId = selectedDiseaseId;

    // If no disease was selected from suggestions, check if input matches a valid disease
    if (!myGuessId && inputValue !== "") {
      const typedName = inputValue.toLowerCase();
      const found = diseases.find(d => d.name.toLowerCase() === typedName);
      if (found) {
        myGuessId = found.id;
        selectedDiseaseId = found.id;
      }
    }

    // Only show error for invalid (non-blank, non-matching) entries
    if (inputValue !== "" && !myGuessId) {
      resultEl.textContent = "Please select a valid disease or leave blank";
      resultEl.classList.remove('result', 'incorrect');
      // Force reflow to restart animation
      void resultEl.offsetWidth;
      resultEl.classList.add('fade_in', 'result', 'incorrect');
      return; // Don't increment guess count for invalid entries
    }

    // Check if this disease has already been guessed (compare by name to handle synonyms/duplicates)
    if (myGuessId) {
      const guessedNameLower = (diseases.find(d => d.id == myGuessId)?.name || inputValue).toLowerCase().trim();
      const isAlreadyGuessed = guessedDiseases.some(id => {
        const d = diseases.find(item => item.id == id);
        return d && d.name.toLowerCase().trim() === guessedNameLower;
      });
      if (isAlreadyGuessed) {
        resultEl.textContent = "You've already guessed this disease!";
        resultEl.classList.remove('result', 'incorrect');
        // Force reflow to restart animation
        void resultEl.offsetWidth;
        resultEl.classList.add('fade_in', 'result', 'incorrect');
        return; // Don't increment guess count for re-guesses
      }
    }

    // Increment guess count for all valid entries (blank or valid disease)
    guessNumber += 1;

    // Add disease to guessed list if it's a valid disease (not blank)
    if (myGuessId) {
      guessedDiseases.push(myGuessId);
    }

    let guessName = 'Skipped';
    if (myGuessId) {
      const matchedDisease = diseases.find(d => d.name.toLowerCase() === inputValue.toLowerCase()) || 
                             diseases.find(d => d.id == myGuessId);
      guessName = matchedDisease ? matchedDisease.name : inputValue;
    }

    // Check if it's the correct answer (only if not blank)
    const correctDisease = diseases.find(d => d.id == doctoraj);
    const correctName = correctDisease ? correctDisease.name.toLowerCase().trim() : '';
    const guessedNameLower = inputValue.toLowerCase().trim();

    const isCorrect = myGuessId && (
      myGuessId == doctoraj || 
      guessedNameLower === correctName || 
      currentSynonyms.includes(guessedNameLower)
    );

    if (isCorrect) {
      const tries = guessNumber;
      // console.log(`[DEBUG] CORRECT ANSWER! Tries: ${tries}`);

      resultEl.textContent = "Correct!";
      resultEl.classList.remove('result', 'correct');
      // Force reflow to restart animation
      void resultEl.offsetWidth;
      resultEl.classList.add('fade_in', 'result', 'correct');
      gameCompleted = true;
      guessHistory.push({ name: guessName, result: 'correct' });
      renderInlineGuessHistory();

      // Reveal all remaining hints when correct
      revealAllHints();

      // Update statistics for a win
      updateStats(true, tries);

      // Mark case as completed (both archive and daily games)
      if (window.markArchiveCompleted) {
        window.markArchiveCompleted(doctoraj, true);
      }

      // console.log(`[DEBUG] About to call sendGuessToAnalytics for WIN`);
      // Send guess count to Google Analytics (skip for archive games)
      if (!isArchiveMode) sendGuessToAnalytics(tries, true);
      sendPuzzleCompleteEvent(tries, true);

      // Generate new share text format (only for non-archive games)
      const shareText = isArchiveMode ? null : generateShareText(true, tries);

      saveGameState();
      disableGameInput();
      showSummaryButton();

      const correctDisease = diseases.find(d => d.id == doctoraj);
      const diseaseName = correctDisease ? correctDisease.name : "unknown";
      const winMessage = `<div style="padding: 0.75rem; background-color: #e6f3ff; border-radius: 8px; border: 2px solid #2196F3; margin-bottom: 1rem;">
      <strong>🎉 Correct! The diagnosis was ${diseaseName}.</strong>
    </div>`;
      // Only show stats for daily games, not archives
      const showStats = !isArchiveMode;
      openModal(winMessage, shareText, showStats, tries, true);
    }
    else {
      // Wrong guess or blank entry
      // console.log(`[DEBUG] Wrong guess. Current guessNumber: ${guessNumber}`);

      if (guessNumber >= 6) {
        const tries = 6;
        // console.log(`[DEBUG] GAME OVER! Max guesses reached: ${tries}`);

        const correctDisease = diseases.find(d => d.id === doctoraj);
        const name = correctDisease ? correctDisease.name : "unknown";
        // Generate new share text format for loss (only for non-archive games)
        const shareText = isArchiveMode ? null : generateShareText(false, tries);
        gameCompleted = true;
        guessHistory.push({ name: guessName, result: myGuessId ? 'wrong' : 'skip' });
        renderInlineGuessHistory();

        // Update statistics for a loss
        updateStats(false, tries);

        // Mark case as completed (both archive and daily games)
        if (window.markArchiveCompleted) {
          window.markArchiveCompleted(doctoraj, false);
        }

        // console.log(`[DEBUG] About to call sendGuessToAnalytics for LOSS`);
        // Send guess count to Google Analytics (skip for archive games)
        if (!isArchiveMode) sendGuessToAnalytics(tries, false);
        sendPuzzleCompleteEvent(tries, false);

        saveGameState();
        disableGameInput();
        showSummaryButton();

        const lossMessage = `<div style="padding: 0.75rem; background-color: #fff3e0; border-radius: 8px; border: 2px solid #ff9800; margin-bottom: 1rem;">
        <strong>❌ Game Over! The diagnosis was ${name}.</strong>
      </div>`;
        // Only show stats for daily games, not archives
        const showStats = !isArchiveMode;
        openModal(lossMessage, shareText, showStats, tries, false);
      }
      else {
        // Show "Incorrect!" for actual disease guesses (not blank entries)
        if (inputValue !== "" && myGuessId) {
          resultEl.textContent = "Incorrect!";
          resultEl.classList.remove('result', 'incorrect');
          // Force reflow to restart animation
          void resultEl.offsetWidth;
          resultEl.classList.add('fade_in', 'result', 'incorrect');
        }
        // For blank entries, don't show any result message
      }

      function showHint(id, symptom) {
        const el = document.getElementById(id);
        el.textContent = symptom;
        el.classList.remove('flip_in');
        void el.offsetWidth;
        el.classList.add('flip_in', 'hints_shown');
      }

      // Show hints based on guess number
      if (guessNumber == 1) showHint('guess_two', symptoms[0]);
      if (guessNumber == 2) showHint('guess_three', symptoms[1]);
      if (guessNumber == 3) showHint('guess_four', symptoms[2]);
      if (guessNumber == 4) showHint('guess_five', symptoms[3]);
      if (guessNumber == 5) showHint('guess_six', symptoms[4]);

      guessHistory.push({ name: guessName, result: myGuessId ? 'wrong' : 'skip' });
      renderInlineGuessHistory();
      saveGameState();
    }

    // Clear the input and reset selectedDiseaseId for next guess
    input.value = "";
    selectedDiseaseId = null;
  }

  window.guessing = guessing;

  const input = document.getElementById('guess');
  const suggestions = document.getElementById('suggestions');

  // Set up input handlers (they'll be disabled if cookies not accepted)
  input.addEventListener('input', function () {
    if (!cookiesAccepted || gameCompleted) return;

    const query = this.value.toLowerCase();
    suggestions.innerHTML = '';

    if (!query) {
      suggestions.style.display = 'none';
      selectedDiseaseId = null;
      return;
    }

    const matches = diseases.filter(d => d.name.toLowerCase().includes(query));

    if (matches.length === 0) {
      suggestions.style.display = 'none';
      selectedDiseaseId = null;
      return;
    }

    matches.forEach(disease => {
      const div = document.createElement('div');
      div.classList.add('suggestion-item');

      const isAlreadyGuessed = guessedDiseases.some(id => {
        const d = diseases.find(item => item.id == id);
        return d && d.name.toLowerCase().trim() === disease.name.toLowerCase().trim();
      });

      if (isAlreadyGuessed) {
        div.style.color = '#999';
        div.style.cursor = 'not-allowed';
        div.textContent = disease.name + ' (already guessed)';

        // Prevent selection of already guessed diseases
        div.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      } else {
        div.textContent = disease.name;
        div.dataset.id = disease.id;

        div.addEventListener('click', () => {
          input.value = disease.name;
          selectedDiseaseId = disease.id;
          suggestions.innerHTML = '';
          suggestions.style.display = 'none';
        });
      }

      suggestions.appendChild(div);
    });

    suggestions.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !suggestions.contains(e.target)) {
      suggestions.style.display = 'none';
    }
  });

  // Add Enter key support for guessing
  input.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      guessing();
    }
  });

  // Initialize the cookie system
  initializeCookieSystem();
});