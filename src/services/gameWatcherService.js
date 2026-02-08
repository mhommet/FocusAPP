/**
 * Game Watcher Service - Frontend
 * 
 * Ce service écoute les événements Rust et gère les transitions d'état du jeu.
 * Il remplace les appels directs à l'API qui échouaient à cause de CORS/certificats.
 * 
 * @module gameWatcherService
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// État actuel du jeu
let currentGameState = {
  type: 'ClientClosed',
  data: null
};

// Callbacks enregistrées
const listeners = {
  'stateChanged': [],
  'lobbyEntered': [],
  'champSelectStarted': [],
  'gameStarted': [],
  'gameEnded': [],
  'csUpdated': []
};

// Unsubscribe handle
let unlistenFn = null;

/**
 * Démarre le service et commence à écouter les événements
 * @returns {Promise<void>}
 */
export async function startGameWatcher() {
  // Démarre le watcher Rust (au cas où)
  try {
    await invoke('start_game_watcher');
  } catch (e) {
    // Le watcher est peut-être déjà démarré
    console.log('[GameWatcher] Watcher already started or:', e);
  }

  // Écoute les événements de changement d'état
  if (!unlistenFn) {
    unlistenFn = await listen('game-state-changed', (event) => {
      handleStateChange(event.payload);
    });
    console.log('[GameWatcher] Listening for events');
  }

  // Récupère l'état initial
  await refreshState();
}

/**
 * Arrête le service
 */
export function stopGameWatcher() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
  invoke('stop_game_watcher').catch(console.error);
}

/**
 * Force un refresh de l'état
 */
export async function refreshState() {
  try {
    const state = await invoke('get_game_state');
    handleStateChange(state);
    return state;
  } catch (e) {
    console.error('[GameWatcher] Failed to get state:', e);
    return null;
  }
}

/**
 * Gère un changement d'état
 * @param {Object} newState - Nouvel état du jeu
 */
function handleStateChange(newState) {
  const oldState = currentGameState;
  currentGameState = newState;

  console.log('[GameWatcher] State changed:', oldState.type, '->', newState.type);

  // Notifie tous les listeners
  listeners.stateChanged.forEach(cb => cb(newState, oldState));

  // Détecte les transitions spécifiques
  if (newState.type === 'Lobby' && oldState.type !== 'Lobby') {
    listeners.lobbyEntered.forEach(cb => cb(newState));
  }

  if (newState.type === 'ChampSelect' && oldState.type !== 'ChampSelect') {
    listeners.champSelectStarted.forEach(cb => cb(newState));
  }

  if (newState.type === 'InProgress' && oldState.type !== 'InProgress') {
    listeners.gameStarted.forEach(cb => cb(newState));
  }

  if (newState.type === 'EndOfGame' && oldState.type === 'InProgress') {
    listeners.gameEnded.forEach(cb => cb(newState));
  }

  // Mise à jour CS en temps réel
  if (newState.type === 'InProgress' && newState.gameData) {
    listeners.csUpdated.forEach(cb => cb(newState.gameData));
  }
}

/**
 * S'abonne à un événement
 * @param {string} event - Nom de l'événement
 * @param {Function} callback - Fonction de callback
 * @returns {Function} Fonction pour se désabonner
 */
export function on(event, callback) {
  if (listeners[event]) {
    listeners[event].push(callback);
    
    // Retourne une fonction pour se désabonner
    return () => {
      const index = listeners[event].indexOf(callback);
      if (index > -1) {
        listeners[event].splice(index, 1);
      }
    };
  }
  console.warn('[GameWatcher] Unknown event:', event);
  return () => {};
}

/**
 * Obtient l'état actuel
 * @returns {Object}
 */
export function getCurrentState() {
  return currentGameState;
}

/**
 * Vérifie si on est dans un état spécifique
 * @param {string} stateType - Type d'état à vérifier
 * @returns {boolean}
 */
export function isInState(stateType) {
  return currentGameState.type === stateType;
}

/**
 * Vérifie si on est en champion select
 * @returns {boolean}
 */
export function isInChampSelect() {
  return currentGameState.type === 'ChampSelect';
}

/**
 * Vérifie si une partie est en cours
 * @returns {boolean}
 */
export function isInGame() {
  return currentGameState.type === 'InProgress';
}

/**
 * Obtient les données CS actuelles si en jeu
 * @returns {Object|null}
 */
export function getCurrentCsData() {
  if (currentGameState.type === 'InProgress') {
    return currentGameState.gameData;
  }
  return null;
}

// Export par défaut
export default {
  startGameWatcher,
  stopGameWatcher,
  refreshState,
  on,
  getCurrentState,
  isInState,
  isInChampSelect,
  isInGame,
  getCurrentCsData
};
