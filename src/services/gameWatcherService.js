/**
 * Game Watcher Service - Frontend
 *
 * Ce service ecoute les evenements Rust et gere les transitions d'etat du jeu.
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

// Etat actuel du jeu
let currentGameState = {
    type: 'ClientClosed',
    data: null
};

// Callbacks enregistrees
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
 * Demarre le service et commence a ecouter les evenements
 */
async function startGameWatcher() {
    try {
        await getInvoke()('start_game_watcher');
    } catch (e) {
        console.log('[GameWatcher] Watcher already started or:', e);
    }

    if (!unlistenFn) {
        unlistenFn = await getListen()('game-state-changed', (event) => {
            handleStateChange(event.payload);
        });
        console.log('[GameWatcher] Listening for events');
    }

    await refreshState();
}

/**
 * Arrete le service
 */
function stopGameWatcher() {
    if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
    }
    try {
        getInvoke()('stop_game_watcher').catch(console.error);
    } catch (e) {
        // Tauri not ready
    }
}

/**
 * Force un refresh de l'etat
 */
async function refreshState() {
    try {
        const state = await getInvoke()('get_game_state');
        handleStateChange(state);
        return state;
    } catch (e) {
        console.error('[GameWatcher] Failed to get state:', e);
        return null;
    }
}

/**
 * Gere un changement d'etat
 */
function handleStateChange(newState) {
    const oldState = currentGameState;
    currentGameState = newState;

    console.log('[GameWatcher] State changed:', oldState.type, '->', newState.type);

    listeners.stateChanged.forEach(cb => cb(newState, oldState));

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

    if (newState.type === 'InProgress' && newState.gameData) {
        listeners.csUpdated.forEach(cb => cb(newState.gameData));
    }
}

/**
 * S'abonne a un evenement
 */
function on(event, callback) {
    if (listeners[event]) {
        listeners[event].push(callback);
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

function getCurrentState() {
    return currentGameState;
}

function isInState(stateType) {
    return currentGameState.type === stateType;
}

function isInChampSelect() {
    return currentGameState.type === 'ChampSelect';
}

function isInGame() {
    return currentGameState.type === 'InProgress';
}

function getCurrentCsData() {
    if (currentGameState.type === 'InProgress') {
        return currentGameState.gameData;
    }
    return null;
}

// Export global
window.GameWatcherService = {
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

console.log('[GameWatcher] Service loaded');
