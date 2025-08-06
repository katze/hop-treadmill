// renderer_grand_ecran.js
// Affichage synchronisé pour la fenêtre Grand écran (lecture seule)

const bc = new BroadcastChannel('tapis-display');

let state = 'idle';
let session = null;
let config = {};
let accueilMsg = ''; // Initialisation vide, sera synchronisé avec le petit écran
let showCompteurs = false;
/**
 * @type {HTMLVideoElement}
 */
let backgroundVideoEl;

// Récupérer les éléments DOM
let accueilDiv, runningDiv, resultsDiv, leaderboardDiv;
let vitesseEl, distanceEl, dureeEl, vitesseMoyEl, vitesseMaxEl;
let countdownDiv;

window.addEventListener('DOMContentLoaded', () => {
  accueilDiv = document.getElementById('accueil');
  runningDiv = document.getElementById('running');
  resultsDiv = document.getElementById('results');
  leaderboardDiv = document.getElementById('leaderboard');
  vitesseEl = document.getElementById('vitesse');
  distanceEl = document.getElementById('distance');
  dureeEl = document.getElementById('temps-course');
  vitesseMoyEl = document.getElementById('vitesse-moy');
  vitesseMaxEl = document.getElementById('vitesse-max');
  backgroundVideoEl = document.getElementById('background-video');
  countdownDiv = document.createElement('div');
  countdownDiv.id = 'countdown-running';
  runningDiv.appendChild(countdownDiv);
  countdownDiv.classList.remove('show');

  showState('idle');

  requestAnimationFrame(function updateLoop() {
    updateUI();
    requestAnimationFrame(updateLoop);
  });
});

function showState(newState) {
  if (newState === 'idle') {
    runningDiv.classList.remove('show');
    resultsDiv.classList.remove('show');
    leaderboardDiv.classList.remove('show');
    accueilDiv.classList.add('show');
    // Mettre à jour le texte d'accueil
    // if (accueilDiv && accueilMsg !== undefined) {
    //   const h1 = accueilDiv.querySelector('h1');
    //   if (h1) h1.textContent = accueilMsg;
    // }
  }
  if (newState === 'running') {
    accueilDiv.classList.remove('show');
    resultsDiv.classList.remove('show');
    leaderboardDiv.classList.remove('show');
    runningDiv.classList.add('show');
    // Mettre à jour le texte d'accueil dans running
    let welcomeMsg = runningDiv.querySelector('.welcome');
    if (!welcomeMsg) {
      welcomeMsg = document.createElement('div');
      welcomeMsg.className = 'welcome';
      welcomeMsg.id = 'welcome-msg';
      runningDiv.insertBefore(
        welcomeMsg,
        runningDiv.querySelector('.compteurs'),
      );
    }
    // welcomeMsg.textContent = accueilMsg;
  }
  if (newState === 'results') {
    accueilDiv.classList.remove('show');
    runningDiv.classList.remove('show');
    leaderboardDiv.classList.remove('show');
    resultsDiv.classList.add('show');
    updateResultsUI();
  }
  if (newState === 'leaderboard') {
    accueilDiv.classList.remove('show');
    runningDiv.classList.remove('show');
    resultsDiv.classList.remove('show');
    leaderboardDiv.classList.add('show');
    updateLeaderboardUI();
  }
}

function formatDistance(d) {
  return d.toFixed(1).replace('.', ',') + ' m';
}

function formatVitesse(v) {
  return v.toFixed(0).replace('.', ',') + ' km/h';
}

function formatDuree(ms) {
  let s = Math.floor(ms / 1000);
  let m = Math.floor(s / 60);
  s = s % 60;
  return `${m.toString().padStart(2, '0')}.${s.toString().padStart(2, '0')}.${(Math.floor(ms / 10) % 100).toString().padStart(2, '0')}`;
}

function readCSV() {
  return window.api.getCsvData();
}

// Large screen is now a simple follower - removed complex table creation and rating logic

bc.onmessage = (event) => {
  console.log(event.data);
  const data = event.data;
  const prevState = state;
  state = data.state;
  session = data.session;
  config = data.config;
  accueilMsg = data.accueilMsg;
  showCompteurs = data.showCompteurs;

  // Large screen is now a simple follower - no special rating state handling

  if (prevState !== state && state === 'idle') {
    backgroundVideoEl.currentTime = 0;
    backgroundVideoEl.play();
  }

  // Affichage du compte à rebours synchronisé
  if (
    data.state === 'running' &&
    data.showCountdown &&
    data.countdownValue > 0
  ) {
    countdownDiv.textContent = `Fin de la course dans ${data.countdownValue}s`;
    countdownDiv.classList.add('show');
  } else {
    countdownDiv.classList.remove('show');
  }

  // Gestion des classes show pour welcomeMsg et compteursDiv
  const welcomeMsg = document.getElementById('welcome-msg');
  const compteursDiv = document.querySelector('.compteurs');
  
  if (welcomeMsg && compteursDiv) {
    if (data.state === 'running') {
      if (showCompteurs) {
        welcomeMsg.classList.remove('show');
        compteursDiv.classList.add('show');
      } else {
        welcomeMsg.classList.add('show');
        compteursDiv.classList.remove('show');
      }
    } else {
      // Dans les autres états, masquer les deux
      welcomeMsg.classList.remove('show');
      compteursDiv.classList.remove('show');
    }
  }
};

function updateUI() {
  if (state === 'idle') {
    showState('idle');
  } else if (state === 'running') {
    showState('running');
    if (vitesseEl && session) {
      vitesseEl.textContent = formatVitesse(session.vitesses?.at(-1) || 0);
    }
    if (distanceEl && session) {
      distanceEl.textContent = formatDistance(session.distance || 0);
    }
    if (dureeEl && session && session.start) {
      const tempsEcoule = Date.now() - session.start;
      dureeEl.textContent = formatDuree(tempsEcoule);
    }
  } else if (state === 'results') {
    showState('results');
    updateResultsUI();
  } else if (state === 'leaderboard') {
    showState('leaderboard');
    updateLeaderboardUI();
  }
}

function updateResultsUI() {
  if (!session || !session.end || !session.start) return;

  // Calculer la vitesse moyenne
  let vitesseMoyenne = 0;
  if (session.vitesses && session.vitesses.length > 0) {
    const sommeVitesses = session.vitesses.reduce((sum, v) => sum + v, 0);
    vitesseMoyenne = sommeVitesses / session.vitesses.length;
  }

  // Calculer la durée de session
  const dureeSession = session.end - session.start;

  // Mettre à jour les éléments d'affichage
  const resultsVitesseMoyEl = document.getElementById('results-vitesse-moy');
  const resultsVitesseMaxEl = document.getElementById('results-vitesse-max');
  const resultsDistanceEl = document.getElementById('results-distance');
  const resultsDureeEl = document.getElementById('results-duree');

  if (resultsVitesseMoyEl) {
    resultsVitesseMoyEl.textContent = formatVitesse(vitesseMoyenne);
  }
  if (resultsVitesseMaxEl) {
    resultsVitesseMaxEl.textContent = formatVitesse(session.vitesseMax);
  }
  if (resultsDistanceEl) {
    resultsDistanceEl.textContent = formatDistance(session.distance);
  }
  if (resultsDureeEl) {
    resultsDureeEl.textContent = formatDuree(dureeSession);
  }

  // Charger et afficher le classement
  loadLeaderboard();
}

function updateLeaderboardUI() {
  if (!session || !session.end || !session.start) return;

  // Charger et afficher le mini-classement
  loadMiniLeaderboard();
}

function loadMiniLeaderboard() {
  readCSV().then((rows) => {
    if (!rows || rows.length === 0) {
      createMiniLeaderboardTable([]);
      return;
    }

    // Calculer le classement selon le critère configuré
    const rankingCriteria = config.rankingCriteria || 'vitesseMoyenne';
    const sorted = rows.slice().sort((a, b) => {
      if (rankingCriteria === 'vitesseMax') {
        return b.vMax - a.vMax;
      } else if (rankingCriteria === 'distance') {
        return b.distance - a.distance;
      } else {
        return b.vMoy - a.vMoy;
      }
    });

    // Trouver la position de la session courante (par date de la session)
    const sessionDate = new Date(session.end).toISOString().replace('T', ' ').substring(0, 19);
    const currentPosition = sorted.findIndex((r) => r.date === sessionDate);

    // Créer le mini-classement avec la logique d'affichage optimisée
    const miniLeaderboard = [];
    const totalParticipants = sorted.length;

    let startIndex, endIndex;

    if (currentPosition === 0) {
      // Premier : Session courante + 5 après
      startIndex = 0;
      endIndex = Math.min(6, totalParticipants);
    } else if (currentPosition === 1) {
      // Deuxième : 1 avant + Session courante + 4 après
      startIndex = 0;
      endIndex = Math.min(6, totalParticipants);
    } else if (currentPosition === totalParticipants - 2) {
      // Avant-dernier : 4 avant + Session courante + 1 après
      startIndex = Math.max(0, currentPosition - 4);
      endIndex = totalParticipants;
    } else if (currentPosition === totalParticipants - 1) {
      // Dernier : 5 avant + Session courante
      startIndex = Math.max(0, totalParticipants - 6);
      endIndex = totalParticipants;
    } else {
      // Positions centrales : ajuster pour avoir 6 résultats quand possible
      const positionsAfter = totalParticipants - currentPosition - 1;

      if (positionsAfter >= 3) {
        // Assez de positions après : 2 avant + Session courante + 3 après
        startIndex = Math.max(0, currentPosition - 2);
        endIndex = currentPosition + 4;
      } else if (positionsAfter === 2) {
        // 2 positions après : 3 avant + Session courante + 2 après
        startIndex = Math.max(0, currentPosition - 3);
        endIndex = currentPosition + 3;
      } else if (positionsAfter === 1) {
        // 1 position après : 4 avant + Session courante + 1 après
        startIndex = Math.max(0, currentPosition - 4);
        endIndex = currentPosition + 2;
      } else {
        // 0 position après : 5 avant + Session courante
        startIndex = Math.max(0, currentPosition - 5);
        endIndex = currentPosition + 1;
      }
    }

    for (let i = startIndex; i < endIndex; i++) {
      miniLeaderboard.push({
        ...sorted[i],
        position: i + 1,
        isCurrent: i === currentPosition,
      });
    }

    createMiniLeaderboardTable(miniLeaderboard);
  });
}

function createMiniLeaderboardTable(miniLeaderboard) {
  const leaderboardTable = document.getElementById('mini-leaderboard-table');
  if (!leaderboardTable) return;

  // Vider le tableau
  leaderboardTable.innerHTML = '';

  // Déterminer le critère de classement
  const rankingCriteria = config.rankingCriteria || 'vitesseMoyenne';

  miniLeaderboard.forEach((row) => {
    const rowDiv = document.createElement('div');
    rowDiv.classList.add('leaderboard-row');

    if (row.isCurrent) {
      rowDiv.classList.add('current-session');
    }

    // Déterminer la valeur à afficher selon le critère
    let displayValue = '';
    switch (rankingCriteria) {
      case 'vitesseMax':
        displayValue = formatVitesse(row.vMax);
        break;
      case 'distance':
        displayValue = formatDistance(row.distance);
        break;
      case 'vitesseMoyenne':
      default:
        displayValue = formatVitesse(row.vMoy);
        break;
    }

    rowDiv.innerHTML = `
			<div class="leaderboard-cell position">${row.position}E</div>
			<div class="leaderboard-cell value">${displayValue}</div>
		`;

    leaderboardTable.appendChild(rowDiv);
  });
}

function loadLeaderboard() {
  readCSV().then((rows) => {
    if (!rows || rows.length === 0) {
      updatePositionDisplay(1, 1);
      return;
    }

    // Calculer le classement selon le critère configuré
    const rankingCriteria = config.rankingCriteria || 'vitesseMoyenne';
    const sorted = rows.slice().sort((a, b) => {
      if (rankingCriteria === 'vitesseMax') {
        return b.vMax - a.vMax;
      } else if (rankingCriteria === 'distance') {
        return b.distance - a.distance;
      } else {
        return b.vMoy - a.vMoy;
      }
    });

    // Trouver la position de la session courante (par date de la session)
    const sessionDate = new Date(session.end).toISOString().replace('T', ' ').substring(0, 19);
    const position = sorted.findIndex((r) => r.date === sessionDate) + 1;

    // Afficher la position
    updatePositionDisplay(position, sorted.length);
  });
}

function updatePositionDisplay(position, totalParticipants) {
  const positionTextEl = document.getElementById('position-text');

  if (positionTextEl) {
    positionTextEl.innerHTML = `Félicitations,<br/>Vous êtes à la ${position}E place&nbsp;!`;
  }
}
