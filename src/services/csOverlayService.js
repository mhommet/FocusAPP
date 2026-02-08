/**
 * CS Overlay Service - Intégration avec GameWatcher
 * 
 * Ce service gère l'overlay de CS et s'intègre avec le GameWatcher
 * pour démarrer/arrêter automatiquement le tracking.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import gameWatcher from './gameWatcherService.js';

// État de l'overlay
let isOverlayVisible = false;
let isClickThrough = true;
let overlayPosition = { x: 10, y: 150 };
let currentStats = null;

// Configuration
let config = {
  role: 'mid',
  rank: 'platinum',
  opacity: 0.88,
  autoShow: true  // Affiche automatiquement en début de partie
};

// Callbacks
const statsListeners = [];

/**
 * Initialise le service d'overlay
 */
export async function initCsOverlay() {
  // Écoute les mises à jour CS depuis le Rust
  await listen('cs-overlay-update', (event) => {
    if (event.payload && event.payload.gameData) {
      updateStats(event.payload.gameData);
    }
  });

  // S'abonne aux événements du GameWatcher
  gameWatcher.on('gameStarted', async (state) => {
    console.log('[CS Overlay] Game started, showing overlay');
    if (config.autoShow) {
      await showOverlay();
    }
  });

  gameWatcher.on('gameEnded', async () => {
    console.log('[CS Overlay] Game ended, hiding overlay');
    await hideOverlay();
  });

  gameWatcher.on('csUpdated', (data) => {
    updateStats(data);
  });

  console.log('[CS Overlay] Service initialized');
}

/**
 * Affiche l'overlay
 */
export async function showOverlay() {
  if (isOverlayVisible) return;
  
  try {
    await invoke('show_cs_overlay');
    isOverlayVisible = true;
    
    // Applique la position sauvegardée
    await invoke('move_overlay', {
      x: overlayPosition.x,
      y: overlayPosition.y
    });
    
    // Applique le mode click-through
    await invoke('set_overlay_click_through', {
      enabled: isClickThrough
    });
    
    console.log('[CS Overlay] Overlay shown');
  } catch (e) {
    console.error('[CS Overlay] Failed to show overlay:', e);
  }
}

/**
 * Cache l'overlay
 */
export async function hideOverlay() {
  if (!isOverlayVisible) return;
  
  try {
    await invoke('hide_cs_overlay');
    isOverlayVisible = false;
    console.log('[CS Overlay] Overlay hidden');
  } catch (e) {
    console.error('[CS Overlay] Failed to hide overlay:', e);
  }
}

/**
 * Définit le mode click-through
 * @param {boolean} enabled 
 */
export async function setClickThrough(enabled) {
  isClickThrough = enabled;
  if (isOverlayVisible) {
    try {
      await invoke('set_overlay_click_through', { enabled });
    } catch (e) {
      console.error('[CS Overlay] Failed to set click through:', e);
    }
  }
}

/**
 * Déplace l'overlay
 * @param {number} x 
 * @param {number} y 
 */
export async function moveOverlay(x, y) {
  overlayPosition = { x, y };
  if (isOverlayVisible) {
    try {
      await invoke('move_overlay', { x, y });
    } catch (e) {
      console.error('[CS Overlay] Failed to move overlay:', e);
    }
  }
}

/**
 * Met à jour les stats affichées
 * @param {Object} data 
 */
function updateStats(data) {
  currentStats = data;
  statsListeners.forEach(cb => cb(data));
}

/**
 * S'abonne aux mises à jour de stats
 * @param {Function} callback 
 * @returns {Function} Unsubscribe
 */
export function onStatsUpdate(callback) {
  statsListeners.push(callback);
  return () => {
    const index = statsListeners.indexOf(callback);
    if (index > -1) {
      statsListeners.splice(index, 1);
    }
  };
}

/**
 * Récupère les stats actuelles
 * @returns {Object|null}
 */
export function getCurrentStats() {
  return currentStats;
}

/**
 * Vérifie si l'overlay est visible
 * @returns {boolean}
 */
export function isVisible() {
  return isOverlayVisible;
}

/**
 * Configure le service
 * @param {Object} newConfig 
 */
export function setConfig(newConfig) {
  config = { ...config, ...newConfig };
}

/**
 * Récupère les benchmarks CS depuis l'API FocusApp
 * @param {string} role - Rôle (top, jungle, mid, bottom, support)
 * @param {string} rank - Rang (iron, bronze, silver, gold, platinum, diamond, master, grandmaster, challenger)
 * @returns {Promise<Object>}
 */
export async function fetchCsBenchmarks(role, rank) {
  try {
    const response = await fetch(
      `https://api.hommet.ch/api/v1/benchmarks/cs?role=${role}&rank=${rank}`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    console.error('[CS Overlay] Failed to fetch benchmarks:', e);
    return null;
  }
}

// Export par défaut
export default {
  initCsOverlay,
  showOverlay,
  hideOverlay,
  setClickThrough,
  moveOverlay,
  onStatsUpdate,
  getCurrentStats,
  isVisible,
  setConfig,
  fetchCsBenchmarks
};
