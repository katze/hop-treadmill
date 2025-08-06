/**
 * ============================
 * Résumé du fonctionnement principal de l'application
 * ============================
 *
 * États principaux de l'application :
 *  - idle    : Affichage d'accueil, attente de mouvement sur le tapis.
 *  - running : Séance de course en cours, affichage des compteurs (distance, vitesse, etc.).
 *  - results : Affichage des résultats de la session et de la position dans le classement.
 *  - leaderboard : Affichage du mini-classement avec la session courante et les places adjacentes.
 *
 * Transitions et déclencheurs :
 *  - idle → idle (message de bienvenue) :
 *      * Dès que la vitesse mesurée par le backend dépasse 0.1 km/h, l'état idle (message de bienvenue) s'affiche.
 *      * Les compteurs restent masqués tant que la vitesse n'atteint pas vMin.
 *  - idle (message de bienvenue) → running :
 *      * Si la vitesse du sensor atteint ou dépasse vMin (après le délai messageDuration), passage en mode running.
 *      * Les compteurs s'affichent, la session running démarre réellement.
 *  - running → results :
 *      * Si la vitesse repasse sous vMin pendant plus de pauseDurationBeforeEnd secondes, la course est considérée comme terminée.
 *      * Si la vitesse descend sous 0.1 km/h après le délai, passage en mode results.
 *      * Les données de la session sont sauvegardées dans le CSV.
 *  - results → leaderboard :
 *      * Après expiration du temps d'affichage des résultats (resultsDisplayDuration), passage au leaderboard.
 *  - leaderboard → idle :
 *      * Après expiration du temps d'affichage du leaderboard (scoreDisplayDuration), retour à l'accueil.
 *      * Ou après clic sur le bouton "Retour à l'accueil".
 *  - running/results/leaderboard/idle → idle (reset global) :
 *      * Un triple clic ou triple tap dans le coin supérieur gauche de l'écran déclenche un RESET.
 *      * Le RESET remet l'application et le backend dans l'état initial (idle), réinitialise les compteurs et l'affichage.
 *
 * Communication :
 *  - Les transitions d'état sont synchronisées avec le backend via WebSocket (messages 'setState', 'RESET', etc.).
 *  - Les données de vitesse sont reçues en temps réel du backend (action 'sensor').
 *  - Les paramètres (coefficient, fréquence, etc.) sont synchronisés entre frontend et backend.
 *
 * Sauvegarde :
 *  - À chaque fin de séance, la session est enregistrée dans un fichier CSV (avec BOM UTF-8 pour compatibilité Excel).
 *  - Les colonnes incluent : Date, Durée (hh:mm:ss), Distance, Vitesse moyenne, Vitesse max.
 *
 * Sécurité & maintenance :
 *  - Le triple tap/clic coin haut gauche permet un reset rapide pour maintenance ou en cas de bug.
 *
 * Voir le reste du fichier pour le détail de chaque logique.
 */
// ===============================
// renderer.js
// Logique principale du frontend Electron pour l'application Tapis de course
// ===============================
// Ce fichier gère l'affichage, la communication WebSocket, la gestion des états, la sauvegarde CSV, et l'interface utilisateur.

let config = {};
let state = 'idle';
let session = null;
let tripleTapTimestamps = [];
let accueilMsg = '';
let runningTimerInterval = null; // Variable globale pour le timer de course
let countdownTimeout = null; // Timer pour le compte à rebours
let countdownValue = 0; // Valeur courante du compte à rebours
let resultsTimeoutInterval = null; // Timer pour l'affichage des résultats
let leaderboardTimeoutInterval = null; // Timer pour l'affichage du leaderboard
/**
 * @type {HTMLVideoElement}
 */
let backgroundVideoEl;

/**
 * @type {HTMLDivElement}
 */
let tempsEl;

const RANK_TEXT = ['1ST', '2ND', '3RD'];

// Add a buffer for speed smoothing
const SPEED_SMOOTHING_WINDOW = 3;

// === Ajout BroadcastChannel pour synchronisation Grand écran ===
const bc = new BroadcastChannel('tapis-display');

function broadcastState() {
  // Préparer les données à envoyer
  bc.postMessage({
    state,
    session,
    config,
    accueilMsg,
    showCompteurs: compteursDiv && compteursDiv.classList.contains('show'),
    countdownValue: typeof countdownValue !== 'undefined' ? countdownValue : 0,
    showCountdown: !!countdownTimeout,
  });
}

// Elements - seront initialisés après le chargement du DOM
let accueilDiv, runningDiv, resultsDiv, leaderboardDiv, configForm, configOverlay;
let vitesseEl, distanceEl, dureeEl, vitesseMoyEl, vitesseMaxEl;
let resultsVitesseMoyEl, resultsVitesseMaxEl, resultsDistanceEl, resultsTimeoutEl, resultsDureeEl;
let leaderboardTimeoutEl;
/**
 * @type {HTMLDivElement}
 */
let welcomeMsg, compteursDiv;

// ===============================
// Fonctions utilitaires d'affichage
// ===============================
/**
 * Affiche un élément HTML
 * @param {HTMLElement} div - Élément à afficher
 */
function show(div) {
  // accueilDiv.style.display = 'none';
  // runningDiv.style.display = 'none';
  // resultsDiv.style.display = 'none';
  // leaderboardDiv.style.display = 'none';
  // div.style.display = 'flex';

  accueilDiv !== div && accueilDiv.classList.remove('show');
  runningDiv !== div && runningDiv.classList.remove('show');
  resultsDiv !== div && resultsDiv.classList.remove('show');
  leaderboardDiv !== div && leaderboardDiv.classList.remove('show');
  div.classList.add('show');
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

function resetSession() {
  session = {
    start: null,
    end: null,
    distance: 0,
    vitesseMax: 0,
    vitesses: [],
    note: null,
    delaiEcoule: false,
    speedsBuffer: [], // Initialize the buffer
  };
}

// ===============================
// Gestion des états de l'application
// ===============================
/**
 * Change l'état de l'application et met à jour l'UI en conséquence
 * @param {string} newState - Nouvel état ('idle', 'running')
 */
function setState(newState) {
  console.log('🔄 [RENDERER] Changement d\'état:', state, '→', newState);

  // Nettoyer le timer de course si on change d'état
  if (runningTimerInterval && (newState === 'idle' || newState === 'results')) {
    clearInterval(runningTimerInterval);
    runningTimerInterval = null;
    // Sauvegarder la session si on passe de running à results
    if (state === 'running' && session && session.start) {
      session.end = Date.now();
      saveSession();
    }
  }

  // Nettoyer le timer des résultats si on change d'état
  if (resultsTimeoutInterval && (newState === 'idle' || newState === 'running' || newState === 'leaderboard')) {
    clearInterval(resultsTimeoutInterval);
    resultsTimeoutInterval = null;
  }

  // Nettoyer le timer du leaderboard si on change d'état
  if (leaderboardTimeoutInterval && (newState === 'idle' || newState === 'running' || newState === 'results')) {
    clearInterval(leaderboardTimeoutInterval);
    leaderboardTimeoutInterval = null;
  }

  state = newState;
  broadcastState();
  if (state === 'idle') {
    backgroundVideoEl.currentTime = 0;
    backgroundVideoEl.play();
    show(accueilDiv);
    updateAccueilMessage(0); // Forcer le message d'accueil par défaut
    resetSession();
  } else if (state === 'running') {
    show(runningDiv);
    session.start = Date.now();
    session.distance = 0;
    session.vitesseMax = 0;
    session.vitesses = [];
    window.api.getCsvData().then(
      /** @param {{distance: number, vMax: number, vMoy: number}[]} rows */
      (rows) => {
        /** @type {HTMLTemplateElement} */
        const leaderboardRowTemplate = document.getElementById('template-leaderboard-row');
        const leaderboardRowsElements = rows.map((row) => {
          switch (config.rankingCriteria) {
            case 'vitesseMax':
              return row.vMax;
            case 'distance':
              return row.distance;
            case 'vitesseMoyenne':
            default:
              return row.vMoy;
          }
        }).toSorted((a, b) => b - a)
          .slice(0, 3)
          .map((row, idx) => {
            /** @type {HTMLElement} */
            const leaderboardRow = leaderboardRowTemplate.content.cloneNode(true);
            leaderboardRow.querySelector('.rank').textContent = RANK_TEXT[idx];
            let value = row.toFixed(1);
            switch (config.rankingCriteria) {
              case 'vitesseMax':
              case 'vitesseMoyenne':
                value = row.toFixed(1).replace('.', ',') + ' km/h';
                break;
              case 'distance':
                value = row.toFixed(1).replace('.', ',') + ' m';
                break;
            }
            leaderboardRow.querySelector('.value').textContent = value;
            return leaderboardRow;
          });
        const leaderboardContainer = document.querySelector('.compteurs .leaderboard');
        for (let i = leaderboardContainer.childElementCount - 1; i >= 0; i--) {
          leaderboardContainer.children.item(i).remove();
        }
        leaderboardContainer.append(...leaderboardRowsElements);
      });

    // Démarrer le timer de course qui se met à jour toutes les secondes
    if (runningTimerInterval) {
      clearInterval(runningTimerInterval);
    }
    runningTimerInterval = setInterval(() => {
      if (state === 'running' && session.start) {
        updateRunningUI();

        // Vérifier la durée maximale de course
        if (config.maxDuration > 0) {
          const dureeEcoulee = Date.now() - session.start;
          const tempsRestant = config.maxDuration * 1000 - dureeEcoulee;

          // Si le temps restant est inférieur ou égal à la durée du compte à rebours
          if (
            tempsRestant <= config.countdownDuration * 1000 &&
            tempsRestant > 0
          ) {
            // Lancer le compte à rebours si countdownDuration > 0 et qu'il n'est pas déjà lancé
            // Lancer le compte à rebours si countdownDuration > 0 et qu'il n'est pas déjà lancé
            if (config.countdownDuration > 0 && !countdownTimeout) {
              countdownValue = Math.ceil(tempsRestant / 1000);
              showCountdownOnRunning();
              broadcastState(); // Synchroniser avec le grand écran
              countdownTimeout = setInterval(() => {
                countdownValue--;
                showCountdownOnRunning();
                broadcastState();
                if (countdownValue <= 0) {
                  clearInterval(countdownTimeout);
                  countdownTimeout = null;
                  hideCountdownOnRunning();
                  setState('results');
                  compteursDiv.classList.remove('show');
                }
              }, 1000);
            }
          }
          // Si le temps est écoulé (tempsRestant <= 0)
          else if (tempsRestant <= 0) {
            if (countdownTimeout) {
              clearInterval(countdownTimeout);
              countdownTimeout = null;
              hideCountdownOnRunning();
            }
            setState('results');
            compteursDiv.classList.remove('show');
          }
        }
      }
    }, 10);

    // Afficher le message de bienvenue et masquer les compteurs
    welcomeMsg.classList.add('show');
    compteursDiv.classList.remove('show');

    // Après le délai, surveiller en continu si la vitesse minimale est atteinte
    setTimeout(() => {
      if (state === 'running') {
        console.log(
          '⏰ [RENDERER] Délai écoulé, surveillance de la vitesse minimale',
        );
        session.delaiEcoule = true;
        // Vérifier immédiatement si la vitesse actuelle dépasse le seuil minimum
        const vitesseActuelle =
          session.vitesses.length > 0
            ? session.vitesses[session.vitesses.length - 1]
            : 0;
        if (vitesseActuelle >= config.vMin) {
          console.log(
            '📊 [RENDERER] Vitesse minimale atteinte, affichage des compteurs',
          );
          welcomeMsg.classList.remove('show');
          compteursDiv.classList.add('show');
          updateRunningUI();
        }
      }
    }, config.messageDuration * 1000);
  } else if (state === 'results') {
    show(resultsDiv);
    updateResultsUI();
    startResultsTimeout();
  } else if (state === 'leaderboard') {
    show(leaderboardDiv);
    updateLeaderboardUI();
    startLeaderboardTimeout();
  }
}

function updateRunningUI() {
  vitesseEl.textContent = formatVitesse(session.vitesses.at(-1) || 0);
  distanceEl.textContent = formatDistance(session.distance);

  // Calculer et afficher le temps de course écoulé
  if (session.start) {
    const tempsEcoule = Date.now() - session.start;
    if (tempsEl) {
      tempsEl.textContent = formatDuree(tempsEcoule);
    }
  }

  broadcastState();
}

function updateAccueilMessage(vitesse) {
  if (state !== 'idle') return;
  console.log(vitesse);
  // if (accueilDiv) accueilDiv.querySelector('h1').textContent = accueilMsg;
  broadcastState();
}

function handleSensor(data) {
  // data: { dist, speed, ts, dur }
  const d = data.dist;
  session.distance += d;
  // Speed smoothing
  if (!session.speedsBuffer) session.speedsBuffer = [];
  session.speedsBuffer.push(data.speed);
  if (session.speedsBuffer.length > SPEED_SMOOTHING_WINDOW)
    session.speedsBuffer.shift();
  const v =
    session.speedsBuffer.reduce((a, b) => a + b, 0) /
    session.speedsBuffer.length;
  session.vitesses.push(v);
  if (v > session.vitesseMax) session.vitesseMax = v;

  // Affichage debug détaillé
  // console.log(`[DISTANCE] d=${d.toFixed(3)} m, v_smoothed=${v.toFixed(2)} km/h, total=${session.distance.toFixed(2)} m`);
  // console.log(`[CALCUL] v = ${d.toFixed(3)} × 3.6 / (${config.frequency} / 1000) = ${d.toFixed(3)} × 3.6 / ${(config.frequency / 1000).toFixed(3)} = ${v.toFixed(2)} km/h`);

  // Afficher le message de bienvenue si vitesse > 0.1 km/h en mode idle
  if (state === 'idle' && v > 0.1) {
    console.log(
      '🏃 [RENDERER] Vitesse > 0.1 km/h détectée, affichage du message de bienvenue',
    );
    // Mettre à jour le message d'accueil
    accueilMsg = 'A toi de jouer';
    broadcastState(); // Synchroniser avec le grand écran
    show(runningDiv);
    welcomeMsg.classList.add('show');
    compteursDiv.classList.remove('show');
    // Après le délai, vérifier si la vitesse minimale est atteinte
    setTimeout(() => {
      if (state === 'idle') {
        console.log(
          '⏰ [RENDERER] Délai écoulé, vérification de la vitesse minimale',
        );
        session.delaiEcoule = true;
        const vitesseActuelle =
          session.vitesses.length > 0
            ? session.vitesses[session.vitesses.length - 1]
            : 0;
        if (vitesseActuelle >= config.vMin) {
          console.log(
            '🏃 [RENDERER] Vitesse minimale atteinte, passage en mode running',
          );
          setState('running');
        } else if (vitesseActuelle <= 0.05) {
          console.log(
            '🏠 [RENDERER] Vitesse <= 0.05 km/h après délai, retour à l\'accueil',
          );
          // setState('idle'); // Ne pas envoyer au backend
        }
      }
    }, config.messageDuration * 1000);
  }

  // Transition vers running si vitesse >= vMin en mode idle
  if (state === 'idle' && v >= config.vMin) {
    console.log(
      '🏃 [RENDERER] Vitesse minimale atteinte, passage en mode running',
    );
    setState('running');
  }

  // Passage en mode results si vitesse < 0.05 km/h en mode running ET que le délai est écoulé
  if (state === 'running' && session.delaiEcoule && v <= 0.05) {
    console.log(
      '🏁 [RENDERER] Vitesse <= 0.05 km/h après délai, affichage des résultats',
    );
    session.end = Date.now();
    // saveSession();
    setState('results');
    compteursDiv.classList.remove('show');
    return;
  }

  // Retour à l'accueil si vitesse < 0.1 km/h en mode idle avec message de bienvenue
  // Ajouter une tolérance pour éviter les basculements intempestifs
  // if (state === 'idle' && welcomeMsg.classList.contains('show') && v <= 0.05) {
  //   console.log('🏠 [RENDERER] Vitesse <= 0.05 km/h, retour à l\'accueil');
  //   // Mettre à jour le message d'accueil
  //   accueilMsg = 'Viens tester nos super chaussures';
  //   broadcastState(); // Synchroniser avec le grand écran
  //   setState('idle'); // Ne pas envoyer au backend
  //   return;
  // }

  // Traitement des données en mode running ou en mode idle avec message de bienvenue
  if (
    state !== 'running' &&
    !(state === 'idle' && welcomeMsg.classList.contains('show'))
  )
    return;

  updateRunningUI();
  // Détection pause (seulement si les compteurs sont affichés ET que le délai est écoulé)
  if (
    session.delaiEcoule &&
    compteursDiv.classList.contains('show') &&
    v < config.vMin
  ) {
    if (!session.pauseStart) session.pauseStart = Date.now();
    else if (
      Date.now() - session.pauseStart >
      config.pauseDurationBeforeEnd * 1000
    ) {
      console.log('⏸️ [RENDERER] Pause détectée, affichage des résultats');
      session.end = Date.now();
      saveSession();
      setState('results');
      compteursDiv.classList.remove('show');
    }
  } else {
    session.pauseStart = null;
  }
  // Ne mettre à jour le message d'accueil que si on est en mode idle
  if (state === 'idle') {
    updateAccueilMessage(0);
  }
}

// ===============================
// Communication Serie
// ===============================
/**
 * Gère la réception des messages WebSocket
 * @param {Object} msg - Message reçu du backend
 */
function handleSerialMessage(msg) {
  // Handle ACK/ERR for interval changes
  if (msg && msg.type === 'ack') {
    console.log(`[SERIAL] Intervalle accepté: ${msg.value} ms`);
    // Optionally update UI
    return;
  }
  if (msg && msg.type === 'err') {
    console.error('[SERIAL] Erreur intervalle:', msg.message);
    // Optionally update UI
    return;
  }
  // Handle treadmill data
  if (msg && typeof msg.dist === 'number' && typeof msg.speed === 'number') {
    handleSensor(msg);
    // console.log('[SERIAL DATA]', msg);
  }
}

window.api.onSerialMessage((msg) => {
  handleSerialMessage(msg);
});

// Affichage du compte à rebours sur le petit écran
function showCountdownOnRunning() {
  let countdownDiv = document.getElementById('countdown-running');
  countdownDiv.classList.add('show');
  countdownDiv.textContent = `Fin de la course dans ${countdownValue}...`;
}

function hideCountdownOnRunning() {
  const countdownDiv = document.getElementById('countdown-running');
  if (countdownDiv) {
    countdownDiv.classList.remove('show');
  }
}

/**
 * Met à jour l'interface utilisateur de l'écran de résultats
 */
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

  broadcastState();
}

/**
 * Démarre le timer pour l'affichage des résultats
 */
function startResultsTimeout() {
  // Nettoyer le timer précédent s'il existe
  if (resultsTimeoutInterval) {
    clearInterval(resultsTimeoutInterval);
    resultsTimeoutInterval = null;
  }

  const duration = config.resultsDisplayDuration || 15;

  // Timer silencieux - pas d'affichage du compte à rebours
  resultsTimeoutInterval = setTimeout(() => {
    resultsTimeoutInterval = null;
    setState('leaderboard');
  }, duration * 1000);
}

/**
 * Charge et affiche la position dans le classement global
 */
function loadLeaderboard() {
  window.api.getCsvData().then((rows) => {
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

    const position = sorted.findIndex(
      (r) => r.date === sessionDate,
    ) + 1;

    // Afficher la position
    updatePositionDisplay(position, sorted.length);
  });
}

/**
 * Met à jour l'affichage de la position
 */
function updatePositionDisplay(position, totalParticipants) {
  const positionTextEl = document.getElementById('position-text');

  if (positionTextEl) {
    positionTextEl.innerHTML = `Félicitations,<br/>
Vous êtes à la ${position}E place&nbsp;!`;
  }
}


/**
 * Met à jour l'interface utilisateur de l'écran leaderboard
 */
function updateLeaderboardUI() {
  if (!session || !session.end || !session.start) return;

  // Charger et afficher le mini-classement
  loadMiniLeaderboard();

  broadcastState();
}

/**
 * Démarre le timer pour l'affichage du leaderboard
 */
function startLeaderboardTimeout() {
  // Nettoyer le timer précédent s'il existe
  if (leaderboardTimeoutInterval) {
    clearTimeout(leaderboardTimeoutInterval);
    leaderboardTimeoutInterval = null;
  }

  const duration = config.scoreDisplayDuration || 10;

  // Timer silencieux - pas d'affichage du compte à rebours
  leaderboardTimeoutInterval = setTimeout(() => {
    leaderboardTimeoutInterval = null;
    setState('idle');
  }, duration * 1000);
}

/**
 * Charge et affiche le mini-classement avec la session courante et les places adjacentes
 */
function loadMiniLeaderboard() {
  window.api.getCsvData().then((rows) => {
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

    const currentPosition = sorted.findIndex(
      (r) => r.date === sessionDate,
    );

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
      const positionsBefore = currentPosition;

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

/**
 * Crée le tableau du mini-classement
 */
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


/**
 * Sauvegarde la session courante dans le fichier CSV avec BOM UTF-8
 * Format : Date;Durée;Distance (m);Vitesse moyenne;Vitesse max
 */
function saveSession() {
  const now = new Date();
  const datetime = now.toISOString().replace('T', ' ').substring(0, 19);
  // Durée au format hh:mm:ss
  const ms = session.end - session.start;
  const duree = formatDuree(ms);

  // Calculer la vitesse moyenne à partir des vitesses enregistrées
  let vMoy = 0;
  if (session.vitesses && session.vitesses.length > 0) {
    const sommeVitesses = session.vitesses.reduce((sum, v) => sum + v, 0);
    vMoy = sommeVitesses / session.vitesses.length;
  }

  const sessionData = {
    date: datetime,
    duree: duree,
    distance: session.distance,
    vMoy: vMoy,
    vMax: session.vitesseMax,
  };

  window.api.saveSessionRow(sessionData).then((result) => {
    if (result && result.error) {
      console.error(
        'Erreur lors de la sauvegarde de la session:',
        result.error,
      );
    } else {
      console.log('📝 [MAIN] Session sauvegardée:', sessionData);
      broadcastState();
    }
  });
}

/**
 * Initialise les événements de la fenêtre de configuration
 */
function initConfigEvents() {
  document.getElementById('config-annuler').onclick = closeConfig;

  document.getElementById('config-enregistrer').onclick = async () => {
    // Build new config object from form fields
    const newConfig = {
      messageDuration:
        parseFloat(document.getElementById('config-messageDuration').value) ||
        3,
      vMin: parseFloat(document.getElementById('config-vMin').value) || 2,
      coefficient:
        parseFloat(document.getElementById('config-coefficient').value) || 1.2,
      frequency:
        parseInt(document.getElementById('config-frequency').value) || 500,
      maxDuration:
        parseInt(document.getElementById('config-maxDuration').value) || 30,
      countdownDuration:
        parseInt(document.getElementById('config-countdownDuration').value) ||
        5,
      pauseDurationBeforeEnd:
        parseInt(
          document.getElementById('config-pauseDurationBeforeEnd').value,
        ) || 1,
      scoreDisplayDuration:
        parseInt(
          document.getElementById('config-scoreDisplayDuration').value,
        ) || 10,
      resultsDisplayDuration:
        parseInt(
          document.getElementById('config-resultsDisplayDuration').value,
        ) || 15,
      rankingCriteria:
        document.getElementById('config-rankingCriteria').value ||
        'vitesseMoyenne',
    };
    try {
      await window.api.setConfig(newConfig);
      config = await window.api.getConfig();
      console.log('✅ Configuration enregistrée et rechargée:', config);
      // Envoyer les messages de configuration au backend
      window.api.setSerialInterval(config.frequency);

      // Rafraîchir l'affichage si on est sur l'écran leaderboard
      if (state === 'leaderboard') {
        loadMiniLeaderboard();
      }

      closeConfig();
      alert('Configuration enregistrée !');
    } catch (e) {
      alert('Erreur lors de l\'enregistrement de la configuration.');
      console.error(e);
    }
  };
}

/**
 * Détecte un triple clic ou triple touch dans le coin supérieur gauche pour déclencher un RESET
 */
function initTripleTouchReset() {
  window.addEventListener('pointerdown', (e) => {
    if (e.clientX < 100 && e.clientY < 100) {
      const now = Date.now();
      tripleTapTimestamps.push(now);
      tripleTapTimestamps = tripleTapTimestamps.filter((t) => now - t < 600);
      if (tripleTapTimestamps.length >= 3) {
        console.log('🔄 [RENDERER] Triple tap détecté - RESET');
        setState('idle');
        tripleTapTimestamps = [];
        // Renvoyer la fréquence après le reset
        window.api.setSerialInterval(config.frequency);
      }
    }
  });
}

// ===============================
// Initialisation générale de l'application
// ===============================
/**
 * Initialise l'application au démarrage
 */
async function initApp() {
  console.log('🚀 [RENDERER] Initialisation de l\'application');
  initElements();
  initConfigEvents();
  initTripleTouchReset();
  config = await window.api.getConfig();
  console.log(
    '⚙️ [RENDERER] Configuration chargée:',
    JSON.stringify(config, null, 2),
  );
  // Synchroniser la fréquence avec le backend dès le démarrage
  window.api.setSerialInterval(config.frequency);
  setState('idle');

  // Touche Espace = config
  window.addEventListener('keypress', (e) => {
    console.log(e.code);
    if (e.code === 'Space') openConfig();
  });

  let debugInterval = void 0;
  window.addEventListener('keydown', (evt) => {
    switch (evt.key) {
      case 'ArrowUp':
        clearInterval(debugInterval);
        setState('running');
        debugInterval = window.setInterval(() => {
          handleSensor({dist: 50, speed: 33});
          session.start = Date.now();
        }, 1000);
        break;
      case 'ArrowDown':
        clearInterval(debugInterval);
        handleSensor({dist: 0, speed: 0});
    }
  });
}

// Initialiser le message d'accueil au démarrage
window.addEventListener('DOMContentLoaded', () => {
  // Appel de l'initialisation au chargement
  initApp().then();
  accueilDiv = document.getElementById('accueil');
  updateAccueilMessage(0);
});

// Initialisation des éléments DOM
function initElements() {
  accueilDiv = document.getElementById('accueil');
  runningDiv = document.getElementById('running');
  resultsDiv = document.getElementById('results');
  configForm = document.getElementById('config-form');
  configOverlay = document.getElementById('config-overlay');
  vitesseEl = document.getElementById('vitesse');
  distanceEl = document.getElementById('distance');
  dureeEl = document.getElementById('duree');
  vitesseMoyEl = document.getElementById('vitesse-moy');
  vitesseMaxEl = document.getElementById('vitesse-max');
  resultsVitesseMoyEl = document.getElementById('results-vitesse-moy');
  resultsVitesseMaxEl = document.getElementById('results-vitesse-max');
  resultsDistanceEl = document.getElementById('results-distance');
  resultsDureeEl = document.getElementById('results-duree');
  resultsTimeoutEl = document.getElementById('results-timeout');
  leaderboardDiv = document.getElementById('leaderboard');
  leaderboardTimeoutEl = document.getElementById('leaderboard-timeout');
  welcomeMsg = document.getElementById('welcome-msg');
  compteursDiv = document.querySelector('.compteurs');
  tempsEl = document.getElementById('temps-course');
  backgroundVideoEl = document.getElementById('background-video');
}

// Formulaire config
function openConfig() {
  configOverlay.classList.add('show');
  for (const key in config) {
    const input = document.getElementById('config-' + key);
    if (input) input.value = config[key];
  }
  // Ajout gestion maxDuration
  const maxDurationInput = document.getElementById('config-maxDuration');
  if (maxDurationInput) maxDurationInput.value = config.maxDuration || 0;
  // Ajout gestion countdownDuration
  const countdownInput = document.getElementById('config-countdownDuration');
  if (countdownInput) countdownInput.value = config.countdownDuration || 0;


  // Ajout gestion resultsDisplayDuration
  const resultsInput = document.getElementById('config-resultsDisplayDuration');
  if (resultsInput) resultsInput.value = config.resultsDisplayDuration || 15;

  // Ajout gestion scoreDisplayDuration
  const scoreInput = document.getElementById('config-scoreDisplayDuration');
  if (scoreInput) scoreInput.value = config.scoreDisplayDuration || 10;
}

function closeConfig() {
  configOverlay.classList.remove('show');
}