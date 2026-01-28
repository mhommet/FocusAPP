/**
 * CS Overlay Service - Polling et calcul des statistiques CS
 * ===========================================================
 *
 * =============================================================================
 * CONFORMITE RIOT GAMES - DECLARATION DE TRANSPARENCE
 * =============================================================================
 *
 * Cet overlay utilise EXCLUSIVEMENT :
 * 1. L'API FocusApi pour les benchmarks (/api/v1/benchmarks/cs)
 *    - Donnees publiques agregees de performances par role/rang
 *
 * 2. Le Live Client Data API local de Riot (port 2999)
 *    - API OFFICIELLEMENT fournie et documentee par Riot Games
 *    - Reference: https://developer.riotgames.com/docs/lol#game-client-api
 *    - Recupere CS et temps de jeu en temps reel
 *
 * CE QUE CET OUTIL NE FAIT PAS :
 * - Aucune injection de code dans le client LoL
 * - Aucun envoi d'inputs (clavier/souris) au jeu
 * - Aucune macro ou automatisation
 * - Aucune modification de fichiers du jeu
 * - Aucune lecture de memoire du processus
 *
 * CE QUE CET OUTIL FAIT :
 * - Affiche des statistiques en lecture seule
 * - Compare votre CS aux moyennes publiques par timestamp
 * - Fonctionne comme un "second ecran" d'information
 *
 * Cet outil est comparable a un site web de stats ouvert sur un second
 * moniteur - il n'offre aucun avantage que vous ne pourriez obtenir
 * en consultant manuellement les donnees.
 * =============================================================================
 *
 * @author Milan Hommet
 * @license MIT
 */

// Configuration
const FOCUS_API_BASE = "https://api.hommet.ch/api/v1";
const API_KEY = "focusapp_prod_2026_x7k9p2m4q8v1n5r3";
const POLLING_INTERVAL_MS = 3000; // 3 secondes
const GAME_CHECK_INTERVAL_MS = 5000; // 5 secondes

// Utilise Tauri HTTP plugin - lazy initialization to avoid accessing __TAURI__ before ready
let _tauriFetch = null;
let _tauriInvoke = null;
let _tauriEmit = null;

function getTauriFetch() {
  if (!_tauriFetch) {
    if (!window.__TAURI__ || !window.__TAURI__.http) {
      throw new Error("Tauri HTTP plugin not available");
    }
    _tauriFetch = window.__TAURI__.http.fetch;
  }
  return _tauriFetch;
}

function getTauriInvoke() {
  if (!_tauriInvoke) {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
      throw new Error("Tauri core not available");
    }
    _tauriInvoke = window.__TAURI__.core.invoke;
  }
  return _tauriInvoke;
}

function getTauriEmit() {
  if (!_tauriEmit) {
    if (!window.__TAURI__ || !window.__TAURI__.event) {
      throw new Error("Tauri event not available");
    }
    _tauriEmit = window.__TAURI__.event.emit;
  }
  return _tauriEmit;
}

/**
 * Etat du service
 * NOTE: currentRank is hardcoded to "diamond" - Diamond+ benchmarks only
 */
const state = {
  isPolling: false,
  isWatching: false,
  pollIntervalId: null,
  gameCheckIntervalId: null,
  benchmarksCache: null,
  currentRole: "mid", // Auto-detected from LCU
  currentRank: "diamond", // HARDCODED - Diamond+ only, no user option
  lastGameTime: 0,
  roleAutoDetected: false,
  callbacks: {
    onUpdate: null,
    onGameStart: null,
    onGameEnd: null,
    onError: null,
  },
};

/**
 * @typedef {Object} BenchmarkTarget
 * @property {number} timestampSeconds - Timestamp en secondes
 * @property {number} targetCsPerMinute - CS/min cible pour ce timestamp
 */

/**
 * @typedef {Object} BenchmarksResponse
 * @property {string} role
 * @property {string} rank
 * @property {BenchmarkTarget[]} targets
 */

/**
 * @typedef {Object} LiveCsStats
 * @property {string} puuid
 * @property {string} gameId
 * @property {number} currentCs
 * @property {number} gameTimeSeconds
 * @property {number} csPerMinute
 * @property {Array} timeline
 * @property {boolean} isLive
 */

/**
 * Charge les benchmarks depuis l'API FocusApi
 * @param {string} role - Role du joueur
 * @param {string} rank - Rang cible
 * @returns {Promise<BenchmarksResponse>}
 */
async function loadBenchmarks(role, rank) {
  const cacheKey = `${role}-${rank}`;

  // Verifier le cache
  if (state.benchmarksCache && state.benchmarksCache._cacheKey === cacheKey) {
    return state.benchmarksCache;
  }

  try {
    const url = `${FOCUS_API_BASE}/benchmarks/cs?role=${role}&rank=${rank}`;

    const response = await getTauriFetch()(url, {
      method: "GET",
      timeout: { secs: 10, nanos: 0 },
      headers: {
        Accept: "application/json",
        "X-API-Key": API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    data._cacheKey = cacheKey;
    state.benchmarksCache = data;

    console.log("[CSOverlay] Benchmarks loaded:", data);
    return data;
  } catch (error) {
    console.error("[CSOverlay] Error loading benchmarks:", error);
    // Retourner des benchmarks par defaut
    return getDefaultBenchmarks(role, rank);
  }
}

/**
 * Benchmarks par defaut si l'API echoue
 */
function getDefaultBenchmarks(role, rank) {
  // Valeurs approximatives basees sur les donnees Diamond+
  const baseTargets = {
    top: [
      { timestampSeconds: 300, targetCsPerMinute: 5.8 },
      { timestampSeconds: 600, targetCsPerMinute: 6.5 },
      { timestampSeconds: 900, targetCsPerMinute: 6.8 },
      { timestampSeconds: 1200, targetCsPerMinute: 7.0 },
      { timestampSeconds: 1800, targetCsPerMinute: 7.2 },
    ],
    jungle: [
      { timestampSeconds: 300, targetCsPerMinute: 5.0 },
      { timestampSeconds: 600, targetCsPerMinute: 5.5 },
      { timestampSeconds: 900, targetCsPerMinute: 5.8 },
      { timestampSeconds: 1200, targetCsPerMinute: 6.0 },
      { timestampSeconds: 1800, targetCsPerMinute: 6.2 },
    ],
    mid: [
      { timestampSeconds: 300, targetCsPerMinute: 6.0 },
      { timestampSeconds: 600, targetCsPerMinute: 6.8 },
      { timestampSeconds: 900, targetCsPerMinute: 7.2 },
      { timestampSeconds: 1200, targetCsPerMinute: 7.5 },
      { timestampSeconds: 1800, targetCsPerMinute: 7.8 },
    ],
    adc: [
      { timestampSeconds: 300, targetCsPerMinute: 6.5 },
      { timestampSeconds: 600, targetCsPerMinute: 7.2 },
      { timestampSeconds: 900, targetCsPerMinute: 7.6 },
      { timestampSeconds: 1200, targetCsPerMinute: 8.0 },
      { timestampSeconds: 1800, targetCsPerMinute: 8.3 },
    ],
    support: [
      { timestampSeconds: 300, targetCsPerMinute: 0.8 },
      { timestampSeconds: 600, targetCsPerMinute: 1.0 },
      { timestampSeconds: 900, targetCsPerMinute: 1.2 },
      { timestampSeconds: 1200, targetCsPerMinute: 1.5 },
      { timestampSeconds: 1800, targetCsPerMinute: 1.8 },
    ],
  };

  // Facteurs de rang (Master = 1.0)
  const rankFactors = {
    iron: 0.65,
    bronze: 0.7,
    silver: 0.75,
    gold: 0.82,
    platinum: 0.88,
    emerald: 0.92,
    diamond: 0.96,
    master: 1.0,
  };

  const factor = rankFactors[rank] || 0.88;
  const targets = (baseTargets[role] || baseTargets.mid).map((t) => ({
    timestampSeconds: t.timestampSeconds,
    targetCsPerMinute: Math.round(t.targetCsPerMinute * factor * 10) / 10,
  }));

  return { role, rank, targets };
}

/**
 * Trouve le benchmark cible pour un timestamp donne
 * Utilise le bracket le plus proche mais inferieur au temps actuel
 */
function findTargetForTimestamp(benchmarks, gameTimeSeconds) {
  if (!benchmarks || !benchmarks.targets || benchmarks.targets.length === 0) {
    return 7.0; // Valeur par defaut
  }

  // Trouver le bracket le plus proche
  let target = benchmarks.targets[0].targetCsPerMinute;

  for (const bracket of benchmarks.targets) {
    if (gameTimeSeconds >= bracket.timestampSeconds) {
      target = bracket.targetCsPerMinute;
    } else {
      break;
    }
  }

  return target;
}

/**
 * Recupere les stats CS en temps reel depuis le Live Client API local.
 * Utilise une commande Tauri pour gerer le certificat auto-signe.
 * @returns {Promise<LiveCsStats|null>}
 */
async function fetchLiveCsStats() {
  try {
    // Appel a la commande Tauri qui interroge le Live Client API local (port 2999)
    const data = await getTauriInvoke()("get_live_cs_stats");

    if (!data) {
      // Pas de partie en cours
      return null;
    }

    // Transformer le format Rust (snake_case) en format JS (camelCase)
    return {
      currentCs: data.current_cs,
      gameTimeSeconds: data.game_time_seconds,
      csPerMinute: data.cs_per_minute,
      gameId: data.game_id,
      isLive: true,
    };
  } catch (error) {
    // Erreur de connexion = pas de partie en cours
    console.debug("[CSOverlay] Live stats not available:", error.message || error);
    return null;
  }
}

/**
 * Calcule le delta et la couleur associee
 */
function calculateDelta(currentCsPerMin, targetCsPerMin) {
  const delta = currentCsPerMin - targetCsPerMin;

  let color;
  if (delta >= 0.5) {
    color = "#22c55e"; // Vert - Excellent
  } else if (delta >= 0) {
    color = "#84cc16"; // Vert-jaune - Bon
  } else if (delta >= -0.5) {
    color = "#eab308"; // Jaune - Attention
  } else if (delta >= -1.0) {
    color = "#f97316"; // Orange - En retard
  } else {
    color = "#ef4444"; // Rouge - Critique
  }

  return { delta: Math.round(delta * 10) / 10, color };
}

/**
 * Fonction principale de polling
 */
async function pollCsStats() {
  try {
    // 1. Recuperer les stats live depuis FocusApi
    const liveStats = await fetchLiveCsStats();

    if (!liveStats) {
      // Partie terminee ou non accessible
      if (state.isPolling && state.callbacks.onGameEnd) {
        state.callbacks.onGameEnd();
      }
      return;
    }

    // 2. Charger les benchmarks (avec cache)
    const benchmarks = await loadBenchmarks(state.currentRole, state.currentRank);

    // 3. Trouver la cible CS/min pour le timestamp actuel
    const targetCsPerMinute = findTargetForTimestamp(
      benchmarks,
      liveStats.gameTimeSeconds
    );

    // 4. Calculer le delta
    const { delta, color } = calculateDelta(
      liveStats.csPerMinute,
      targetCsPerMinute
    );

    // 5. Construire l'objet de stats complet
    const stats = {
      currentCs: liveStats.currentCs,
      gameTimeSeconds: liveStats.gameTimeSeconds,
      csPerMinute: Math.round(liveStats.csPerMinute * 10) / 10,
      targetCsPerMinute,
      delta,
      deltaColor: color,
      role: state.currentRole,
      rank: state.currentRank,
      gameId: liveStats.gameId,
      timeline: liveStats.timeline || [],
    };

    // 6. Emettre l'evenement vers l'overlay
    await getTauriEmit()("cs-overlay-update", stats);

    // 7. Notifier le callback local
    if (state.callbacks.onUpdate) {
      state.callbacks.onUpdate(stats);
    }

    // Mettre a jour le dernier temps de jeu connu
    state.lastGameTime = liveStats.gameTimeSeconds;
  } catch (error) {
    console.error("[CSOverlay] Polling error:", error);
    if (state.callbacks.onError) {
      state.callbacks.onError(error);
    }
  }
}

/**
 * Auto-detect the player's role from LCU champion select session
 * Returns the detected role or saved role as default
 * NOTE: This only works in normal games with champion select, not Practice Tool
 */
async function autoDetectRole() {
  // First try to get saved role from localStorage
  const savedRole = localStorage.getItem('cs-overlay-role') || 'mid';

  try {
    // Try to get lobby state from the Tauri command (may fail in Practice Tool)
    const lobbyState = await getTauriInvoke()("get_lobby_state");

    if (lobbyState && lobbyState.assignedRole) {
      const lcuRole = lobbyState.assignedRole.toUpperCase();
      const roleMap = {
        'TOP': 'top',
        'JUNGLE': 'jungle',
        'MIDDLE': 'mid',
        'MID': 'mid',
        'BOTTOM': 'adc',
        'ADC': 'adc',
        'UTILITY': 'support',
        'SUPPORT': 'support',
      };
      const detectedRole = roleMap[lcuRole] || savedRole;
      console.log("[CSOverlay] Role auto-detected from LCU:", detectedRole);
      return detectedRole;
    }
  } catch (error) {
    // This is expected in Practice Tool - no champion select session
    console.debug("[CSOverlay] Could not auto-detect role (Practice Tool?):", error.message || error);
  }

  console.log("[CSOverlay] Using saved/default role:", savedRole);
  return savedRole;
}

/**
 * Verifie si une partie est en cours
 */
async function checkGameActive() {
  try {
    const isActive = await getTauriInvoke()("is_game_active");

    if (isActive && !state.isPolling) {
      // Partie detectee, demarrer le polling
      console.log("[CSOverlay] Game detected, starting polling");
      await getTauriEmit()("cs-overlay-state", { state: "loading" });

      // Auto-detect role if not already done
      if (!state.roleAutoDetected) {
        const detectedRole = await autoDetectRole();
        state.currentRole = detectedRole;
        state.roleAutoDetected = true;

        // Notify overlay of the detected role (rank stays diamond)
        await getTauriEmit()("cs-overlay-config", {
          role: detectedRole,
          rank: "diamond", // Always diamond
        });

        // Invalidate benchmarks cache to use new role
        state.benchmarksCache = null;
        console.log("[CSOverlay] Using role:", detectedRole, "rank: diamond");
      }

      startPolling();

      if (state.callbacks.onGameStart) {
        state.callbacks.onGameStart();
      }

      // Afficher l'overlay
      try {
        await getTauriInvoke()("show_cs_overlay");
        await getTauriInvoke()("set_overlay_click_through", { enabled: true });
      } catch (e) {
        console.warn("[CSOverlay] Could not show overlay:", e);
      }
    } else if (!isActive && state.isPolling) {
      // Partie terminee, arreter le polling
      console.log("[CSOverlay] Game ended, stopping polling");
      stopPolling();
      state.roleAutoDetected = false; // Reset for next game
      await getTauriEmit()("cs-overlay-state", { state: "waiting" });

      if (state.callbacks.onGameEnd) {
        state.callbacks.onGameEnd();
      }

      // Masquer l'overlay apres un delai
      setTimeout(async () => {
        try {
          await getTauriInvoke()("hide_cs_overlay");
        } catch (e) {
          console.warn("[CSOverlay] Could not hide overlay:", e);
        }
      }, 5000);
    }
  } catch (error) {
    console.error("[CSOverlay] Game check error:", error);
  }
}

/**
 * Demarre le polling des stats CS
 */
function startPolling() {
  if (state.isPolling) return;

  state.isPolling = true;
  state.pollIntervalId = setInterval(pollCsStats, POLLING_INTERVAL_MS);

  // Poll immediatement
  pollCsStats();

  console.log("[CSOverlay] Polling started");
}

/**
 * Arrete le polling
 */
function stopPolling() {
  if (!state.isPolling) return;

  state.isPolling = false;
  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId);
    state.pollIntervalId = null;
  }

  console.log("[CSOverlay] Polling stopped");
}

/**
 * Demarre la surveillance de l'etat de jeu
 */
function startGameWatcher() {
  if (state.isWatching) return;

  state.isWatching = true;
  state.gameCheckIntervalId = setInterval(checkGameActive, GAME_CHECK_INTERVAL_MS);

  // Verifier immediatement
  checkGameActive();

  console.log("[CSOverlay] Game watcher started");
}

/**
 * Arrete la surveillance de l'etat de jeu
 */
function stopGameWatcher() {
  if (!state.isWatching) return;

  state.isWatching = false;
  if (state.gameCheckIntervalId) {
    clearInterval(state.gameCheckIntervalId);
    state.gameCheckIntervalId = null;
  }
  stopPolling();

  console.log("[CSOverlay] Game watcher stopped");
}

/**
 * Configure les callbacks
 */
function setCallbacks({ onUpdate, onGameStart, onGameEnd, onError }) {
  if (onUpdate) state.callbacks.onUpdate = onUpdate;
  if (onGameStart) state.callbacks.onGameStart = onGameStart;
  if (onGameEnd) state.callbacks.onGameEnd = onGameEnd;
  if (onError) state.callbacks.onError = onError;
}

/**
 * Configure le role cible (rank is always diamond)
 * @param {string} role - The role to set
 * @param {string} _rank - IGNORED - rank is hardcoded to diamond
 */
async function setTarget(role, _rank) {
  state.currentRole = role.toLowerCase();
  // Rank is ALWAYS diamond - ignore the parameter
  state.currentRank = "diamond";

  // Invalider le cache des benchmarks
  state.benchmarksCache = null;

  // Notifier l'overlay
  await getTauriEmit()("cs-overlay-config", {
    role: state.currentRole,
    rank: "diamond", // Always diamond
  });

  // Recharger les benchmarks
  await loadBenchmarks(state.currentRole, "diamond");

  console.log("[CSOverlay] Role set to:", state.currentRole, "(rank: diamond - hardcoded)");
}

/**
 * Invalide le cache des benchmarks
 */
function invalidateBenchmarksCache() {
  state.benchmarksCache = null;
}

/**
 * Retourne l'etat actuel du service
 */
function getState() {
  return {
    isPolling: state.isPolling,
    isWatching: state.isWatching,
    currentRole: state.currentRole,
    currentRank: state.currentRank,
    lastGameTime: state.lastGameTime,
  };
}

// Export du service comme objet global
window.CsOverlayService = {
  startGameWatcher,
  stopGameWatcher,
  startPolling,
  stopPolling,
  setCallbacks,
  setTarget,
  loadBenchmarks,
  invalidateBenchmarksCache,
  getState,
};

console.log("[CSOverlay] Service loaded");
