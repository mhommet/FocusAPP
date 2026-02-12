/**
 * CS Overlay Service - Integration avec GameWatcher
 *
 * Ce service gere l'overlay de CS et s'integre avec le GameWatcher
 * pour demarrer/arreter automatiquement le tracking.
 *
 * Utilise window.__TAURI__ (withGlobalTauri: true) - pas de bundler requis.
 */

// Helpers Tauri (lazy init)
function getInvoke() {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
        throw new Error('Tauri core not available');
    }
    return window.__TAURI__.core.invoke;
}

function getListen() {
    if (!window.__TAURI__ || !window.__TAURI__.event) {
        throw new Error('Tauri event not available');
    }
    return window.__TAURI__.event.listen;
}

// Etat de l'overlay
let isOverlayVisible = false;
let isClickThrough = true;
let overlayPosition = { x: 10, y: 150 };
let currentStats = null;

// Configuration
let config = {
    role: 'mid',
    rank: 'diamond',
    opacity: 0.88,
    autoShow: true
};

// Callbacks
const statsListeners = [];

/**
 * Initialise le service d'overlay
 */
async function initCsOverlay() {
    // Ecoute les mises a jour CS depuis le Rust
    await getListen()('cs-overlay-update', (event) => {
        if (event.payload && event.payload.gameData) {
            updateStats(event.payload.gameData);
        }
    });

    // S'abonne aux evenements du GameWatcher
    if (window.GameWatcherService) {
        window.GameWatcherService.on('gameStarted', async (state) => {
            console.log('[CS Overlay] Game started, showing overlay');
            if (config.autoShow) {
                await showOverlay();
            }
        });

        window.GameWatcherService.on('gameEnded', async () => {
            console.log('[CS Overlay] Game ended, hiding overlay');
            await hideOverlay();
        });

        window.GameWatcherService.on('csUpdated', (data) => {
            updateStats(data);
        });
    }

    console.log('[CS Overlay] Service initialized');
}

/**
 * Affiche l'overlay
 */
async function showOverlay() {
    if (isOverlayVisible) return;

    try {
        await getInvoke()('show_cs_overlay');
        isOverlayVisible = true;

        await getInvoke()('move_overlay', {
            x: overlayPosition.x,
            y: overlayPosition.y
        });

        await getInvoke()('set_overlay_click_through', {
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
async function hideOverlay() {
    if (!isOverlayVisible) return;

    try {
        await getInvoke()('hide_cs_overlay');
        isOverlayVisible = false;
        console.log('[CS Overlay] Overlay hidden');
    } catch (e) {
        console.error('[CS Overlay] Failed to hide overlay:', e);
    }
}

/**
 * Definit le mode click-through
 */
async function setClickThrough(enabled) {
    isClickThrough = enabled;
    if (isOverlayVisible) {
        try {
            await getInvoke()('set_overlay_click_through', { enabled });
        } catch (e) {
            console.error('[CS Overlay] Failed to set click through:', e);
        }
    }
}

/**
 * Deplace l'overlay
 */
async function moveOverlay(x, y) {
    overlayPosition = { x, y };
    if (isOverlayVisible) {
        try {
            await getInvoke()('move_overlay', { x, y });
        } catch (e) {
            console.error('[CS Overlay] Failed to move overlay:', e);
        }
    }
}

/**
 * Met a jour les stats affichees
 */
function updateStats(data) {
    currentStats = data;
    statsListeners.forEach(cb => cb(data));
}

/**
 * S'abonne aux mises a jour de stats
 */
function onStatsUpdate(callback) {
    statsListeners.push(callback);
    return () => {
        const index = statsListeners.indexOf(callback);
        if (index > -1) {
            statsListeners.splice(index, 1);
        }
    };
}

function getCurrentStats() {
    return currentStats;
}

function isVisible() {
    return isOverlayVisible;
}

function setConfig(newConfig) {
    config = { ...config, ...newConfig };
}

/**
 * Demarre le game watcher (compat avec l'ancien API main.js)
 */
function startGameWatcher() {
    // Delegation vers le GameWatcherService si disponible
    if (window.GameWatcherService) {
        window.GameWatcherService.startGameWatcher();
    }
    // Init l'overlay
    initCsOverlay().catch(e => console.error('[CS Overlay] Init failed:', e));
}

// Export global (compatible avec main.js qui appelle window.CsOverlayService.startGameWatcher())
window.CsOverlayService = {
    startGameWatcher,
    initCsOverlay,
    showOverlay,
    hideOverlay,
    setClickThrough,
    moveOverlay,
    onStatsUpdate,
    getCurrentStats,
    isVisible,
    setConfig
};

console.log('[CSOverlay] Service loaded');
