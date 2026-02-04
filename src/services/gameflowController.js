/**
 * GameflowController - LCU-based Game State Automation
 * =====================================================
 *
 * =============================================================================
 * RIOT GAMES COMPLIANCE - VANGUARD SAFETY DECLARATION
 * =============================================================================
 *
 * This controller STRICTLY uses the League Client Update (LCU) API:
 * - All endpoints are OFFICIAL and DOCUMENTED by Riot Games
 * - Uses HTTPS requests to 127.0.0.1:{port} (local client only)
 * - NO memory reading, injection, or process manipulation
 * - NO pixel scanning or screen capture
 * - NO mouse/keyboard input simulation or macros
 *
 * Endpoints used:
 * - /lol-gameflow/v1/session (game state monitoring)
 * - /lol-champ-select/v1/session (champion select data)
 * - /lol-summoner/v1/current-summoner (local player identification)
 * - /lol-perks/v1/pages (rune import - via existing importBuild)
 * - /lol-item-sets/v1/item-sets (item set import - via existing importBuild)
 *
 * Reference: https://developer.riotgames.com/docs/lol#league-client-api
 * Reference: https://riot-api-libraries.readthedocs.io/en/latest/lcu.html
 *
 * This tool is FULLY COMPLIANT with Riot's Third-Party Application Policy.
 * =============================================================================
 *
 * @author FocusApp Team
 * @license MIT
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const GAMEFLOW_POLL_INTERVAL_MS = 1500;  // Check gameflow every 1.5 seconds
const CHAMPSELECT_POLL_INTERVAL_MS = 1000; // Check champ select every 1 second

// =============================================================================
// STATE
// =============================================================================

const state = {
    // Polling state
    isMonitoring: false,
    gameflowIntervalId: null,
    champSelectIntervalId: null,

    // Game state tracking
    currentPhase: 'None',
    previousPhase: 'None',
    inChampSelect: false,

    // Champion select tracking
    currentSummonerId: null,
    localPlayerCellId: null,
    lastDetectedChampionId: null,
    lastImportedChampionId: null,
    detectedRole: null,

    // Feature flags
    autoSwitchTab: true,
    autoLoadBuild: true,
    autoImportEnabled: false,

    // Callbacks for external listeners
    callbacks: {
        onPhaseChange: null,
        onChampionDetected: null,
        onBuildLoaded: null,
        onBuildImported: null,
        onError: null,
    },
};

// =============================================================================
// TAURI INTEGRATION
// =============================================================================

/**
 * Get the Tauri invoke function.
 * @returns {Function} The invoke function
 * @throws {Error} If Tauri is not available
 */
function getTauriInvoke() {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
        throw new Error('Tauri core not available');
    }
    return window.__TAURI__.core.invoke;
}

// =============================================================================
// GAMEFLOW MONITORING
// =============================================================================

/**
 * Check the current gameflow phase from the LCU.
 * Triggers callbacks when phase changes.
 *
 * @compliance Uses /lol-gameflow/v1/session - official LCU endpoint
 */
async function checkGameflowPhase() {
    try {
        const invoke = getTauriInvoke();
        const session = await invoke('get_gameflow_session_cmd');

        if (!session || !session.phase) {
            return;
        }

        const newPhase = session.phase;

        // Detect phase change
        if (newPhase !== state.currentPhase) {
            const oldPhase = state.currentPhase;
            state.previousPhase = oldPhase;
            state.currentPhase = newPhase;

            console.log(`[GameflowController] Phase changed: ${oldPhase} -> ${newPhase}`);

            // Handle phase transitions
            handlePhaseTransition(oldPhase, newPhase, session);

            // Notify external listeners
            if (state.callbacks.onPhaseChange) {
                state.callbacks.onPhaseChange(newPhase, oldPhase, session);
            }
        }
    } catch (error) {
        // Client not running or not logged in - this is expected
        if (state.currentPhase !== 'None') {
            state.previousPhase = state.currentPhase;
            state.currentPhase = 'None';
            state.inChampSelect = false;
            resetChampSelectState();
        }
    }
}

/**
 * Handle gameflow phase transitions.
 *
 * @param {string} oldPhase - Previous phase
 * @param {string} newPhase - New phase
 * @param {Object} session - Full gameflow session data
 */
function handlePhaseTransition(oldPhase, newPhase, session) {
    switch (newPhase) {
        case 'ChampSelect':
            handleEnterChampSelect();
            break;

        case 'InProgress':
        case 'GameStart':
            handleGameStart();
            break;

        case 'EndOfGame':
        case 'PreEndOfGame':
            handleGameEnd();
            break;

        case 'None':
        case 'Lobby':
            handleReturnToLobby();
            break;
    }
}

/**
 * Handle entering champion select phase.
 * - Switches to Builds tab if enabled
 * - Starts champion select monitoring
 */
function handleEnterChampSelect() {
    console.log('[GameflowController] Entering Champion Select');
    state.inChampSelect = true;
    resetChampSelectState();

    // Auto-switch to Builds tab
    if (state.autoSwitchTab && typeof window.switchTab === 'function') {
        console.log('[GameflowController] Auto-switching to Builds tab');
        window.switchTab('builds');
    }

    // Start champion select polling
    startChampSelectPolling();
}

/**
 * Handle game starting (leaving champ select).
 */
function handleGameStart() {
    console.log('[GameflowController] Game starting');
    state.inChampSelect = false;
    stopChampSelectPolling();
}

/**
 * Handle game ending.
 */
function handleGameEnd() {
    console.log('[GameflowController] Game ended');
    state.inChampSelect = false;
    resetChampSelectState();
}

/**
 * Handle returning to lobby.
 */
function handleReturnToLobby() {
    console.log('[GameflowController] Returned to lobby');
    state.inChampSelect = false;
    stopChampSelectPolling();
    resetChampSelectState();
}

/**
 * Reset champion select state tracking.
 */
function resetChampSelectState() {
    state.localPlayerCellId = null;
    state.lastDetectedChampionId = null;
    state.detectedRole = null;
    // Note: Don't reset lastImportedChampionId - prevents re-importing same champ
}

// =============================================================================
// CHAMPION SELECT MONITORING
// =============================================================================

/**
 * Start polling for champion select changes.
 */
function startChampSelectPolling() {
    if (state.champSelectIntervalId) {
        return; // Already polling
    }

    console.log('[GameflowController] Starting champion select polling');
    state.champSelectIntervalId = setInterval(checkChampionSelect, CHAMPSELECT_POLL_INTERVAL_MS);

    // Check immediately
    checkChampionSelect();
}

/**
 * Stop champion select polling.
 */
function stopChampSelectPolling() {
    if (state.champSelectIntervalId) {
        clearInterval(state.champSelectIntervalId);
        state.champSelectIntervalId = null;
        console.log('[GameflowController] Stopped champion select polling');
    }
}

/**
 * Check champion select session for local player's champion and role.
 *
 * @compliance Uses /lol-champ-select/v1/session - official LCU endpoint
 */
async function checkChampionSelect() {
    if (!state.inChampSelect) {
        return;
    }

    try {
        const invoke = getTauriInvoke();
        const session = await invoke('get_champion_select_session_cmd');

        if (!session) {
            return;
        }

        // Get local player's cell ID
        const localCellId = session.localPlayerCellId;
        if (localCellId === null || localCellId === undefined) {
            return;
        }
        state.localPlayerCellId = localCellId;

        // Find local player's champion from actions
        const championId = findLocalPlayerChampion(session, localCellId);
        const role = findLocalPlayerRole(session, localCellId);

        // Only proceed if champion is actually selected (ID > 0)
        if (!championId || championId <= 0) {
            return;
        }

        // Detect if champion changed
        if (championId !== state.lastDetectedChampionId) {
            state.lastDetectedChampionId = championId;
            state.detectedRole = role;

            console.log(`[GameflowController] Champion detected: ${championId}, Role: ${role}`);

            // Notify external listeners
            if (state.callbacks.onChampionDetected) {
                state.callbacks.onChampionDetected(championId, role);
            }

            // Auto-load and import build
            if (state.autoLoadBuild) {
                await loadAndImportBuild(championId, role);
            }
        }
    } catch (error) {
        // Not in champ select or error - expected in some cases
        console.debug('[GameflowController] Champ select check:', error.message);
    }
}

/**
 * Find the local player's selected champion from the session.
 *
 * @param {Object} session - Champion select session
 * @param {number} cellId - Local player's cell ID
 * @returns {number|null} Champion ID or null
 */
function findLocalPlayerChampion(session, cellId) {
    // Check actions array (nested arrays of pick/ban actions)
    if (session.actions && Array.isArray(session.actions)) {
        for (const actionGroup of session.actions) {
            if (!Array.isArray(actionGroup)) continue;

            for (const action of actionGroup) {
                if (
                    action.actorCellId === cellId &&
                    action.type === 'pick' &&
                    action.championId > 0
                ) {
                    // Prefer completed actions, but accept in-progress picks too
                    if (action.completed || action.isInProgress) {
                        return action.championId;
                    }
                }
            }
        }
    }

    // Fallback: Check myTeam array
    if (session.myTeam && Array.isArray(session.myTeam)) {
        const localPlayer = session.myTeam.find(p => p.cellId === cellId);
        if (localPlayer && localPlayer.championId > 0) {
            return localPlayer.championId;
        }
    }

    return null;
}

/**
 * Find the local player's assigned role from the session.
 *
 * @param {Object} session - Champion select session
 * @param {number} cellId - Local player's cell ID
 * @returns {string} Normalized role ('top', 'jungle', 'mid', 'adc', 'support')
 */
function findLocalPlayerRole(session, cellId) {
    if (session.myTeam && Array.isArray(session.myTeam)) {
        const localPlayer = session.myTeam.find(p => p.cellId === cellId);
        if (localPlayer && localPlayer.assignedPosition) {
            return normalizeRole(localPlayer.assignedPosition);
        }
    }

    // Default to mid if role not detected (e.g., blind pick)
    return 'mid';
}

/**
 * Normalize LCU role strings to our standard format.
 *
 * @param {string} lcuRole - Role from LCU (TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY)
 * @returns {string} Normalized role
 */
function normalizeRole(lcuRole) {
    const roleMap = {
        'TOP': 'top',
        'JUNGLE': 'jungle',
        'MIDDLE': 'mid',
        'MID': 'mid',
        'BOTTOM': 'adc',
        'ADC': 'adc',
        'UTILITY': 'support',
        'SUPPORT': 'support',
        'FILL': 'mid',
        '': 'mid',
    };
    return roleMap[lcuRole?.toUpperCase()] || 'mid';
}

// =============================================================================
// BUILD LOADING & IMPORTING
// =============================================================================

/**
 * Load and optionally import a build for the detected champion.
 *
 * @param {number} championId - Champion ID
 * @param {string} role - Normalized role
 */
async function loadAndImportBuild(championId, role) {
    try {
        // Get champion name from ID
        const championName = await getChampionNameFromId(championId);
        if (!championName) {
            console.warn(`[GameflowController] Could not find name for champion ID: ${championId}`);
            return;
        }

        console.log(`[GameflowController] Loading build for ${championName} (${role})`);

        // Fetch and display build using existing function
        if (typeof window.fetchAndDisplayBuild === 'function') {
            await window.fetchAndDisplayBuild(championName, role);
        } else {
            // Fallback: Use API directly
            const { getChampionBuild } = await import('./api.js');
            const build = await getChampionBuild(championName, role);

            if (build && build.success) {
                // Store for import
                window.currentBuild = build;
                window.selectedChampionName = championName;
            }
        }

        // Notify external listeners
        if (state.callbacks.onBuildLoaded) {
            state.callbacks.onBuildLoaded(championName, role);
        }

        // Check auto-import checkbox
        await checkAndAutoImport(championId, championName, role);

    } catch (error) {
        console.error('[GameflowController] Build load error:', error);
        if (state.callbacks.onError) {
            state.callbacks.onError('build_load', error);
        }
    }
}

/**
 * Check if auto-import is enabled and import if so.
 *
 * @param {number} championId - Champion ID
 * @param {string} championName - Champion name
 * @param {string} role - Role
 */
async function checkAndAutoImport(championId, championName, role) {
    // Check the auto-import checkbox
    const checkbox = document.getElementById('auto-import-toggle');
    const isEnabled = checkbox?.checked || state.autoImportEnabled;

    if (!isEnabled) {
        console.log('[GameflowController] Auto-import disabled, skipping import');
        return;
    }

    // Prevent importing same champion twice in one session
    if (championId === state.lastImportedChampionId) {
        console.log('[GameflowController] Already imported this champion, skipping');
        return;
    }

    console.log(`[GameflowController] Auto-importing build for ${championName}`);

    try {
        // Use existing import function if available
        if (typeof window.importBuild === 'function') {
            await window.importBuild();
        } else if (typeof window.autoImportBuild === 'function') {
            await window.autoImportBuild(championName, role);
        } else {
            // Direct Tauri call as fallback
            await importBuildDirect(championName, role);
        }

        state.lastImportedChampionId = championId;

        // Notify external listeners
        if (state.callbacks.onBuildImported) {
            state.callbacks.onBuildImported(championName, role);
        }

        // Show success toast
        if (typeof window.showToast === 'function') {
            const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
            window.showToast(`✓ ${championName} ${roleDisplay} build imported!`, 'success');
        }

    } catch (error) {
        console.error('[GameflowController] Auto-import error:', error);
        if (state.callbacks.onError) {
            state.callbacks.onError('auto_import', error);
        }
    }
}

/**
 * Direct build import using Tauri command.
 * Fallback when window.importBuild is not available.
 *
 * @compliance Uses /lol-perks and /lol-item-sets - official LCU endpoints
 * @param {string} championName - Champion name
 * @param {string} role - Role
 */
async function importBuildDirect(championName, role) {
    const invoke = getTauriInvoke();
    const build = window.currentBuild;

    if (!build || !build.success) {
        throw new Error('No build loaded to import');
    }

    // Build the import payload (same structure as existing code)
    const payload = {
        champion: championName,
        role: role === 'adc' ? 'bottom' : role,
        runes: build.runes,
        items: build.items,
        summoners: build.summoners,
    };

    const result = await invoke('import_build_to_client', { payload });

    if (!result.success) {
        throw new Error(result.message || 'Import failed');
    }

    return result;
}

/**
 * Get champion name from champion ID.
 *
 * @param {number} championId - Champion ID
 * @returns {string|null} Champion name or null
 */
async function getChampionNameFromId(championId) {
    // Try global champions data first
    if (window.allChampions && Array.isArray(window.allChampions)) {
        const champ = window.allChampions.find(c => c.id === championId || c.key === String(championId));
        if (champ) {
            return champ.name || champ.id;
        }
    }

    // Try build champions data
    if (window.buildChampions && Array.isArray(window.buildChampions)) {
        const champ = window.buildChampions.find(c => c.id === championId || c.key === String(championId));
        if (champ) {
            return champ.name || champ.id;
        }
    }

    // Fallback: Fetch from API
    try {
        const { getChampionList } = await import('./api.js');
        const champions = await getChampionList();
        const champ = champions.find(c => c.id === championId || c.key === String(championId));
        return champ?.name || null;
    } catch (e) {
        console.warn('[GameflowController] Could not fetch champion list:', e);
        return null;
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Start the gameflow controller.
 * Begins monitoring LCU for game state changes.
 */
function start() {
    if (state.isMonitoring) {
        console.log('[GameflowController] Already monitoring');
        return;
    }

    console.log('[GameflowController] Starting gameflow monitoring');
    state.isMonitoring = true;

    // Start gameflow polling
    state.gameflowIntervalId = setInterval(checkGameflowPhase, GAMEFLOW_POLL_INTERVAL_MS);

    // Check immediately
    checkGameflowPhase();
}

/**
 * Stop the gameflow controller.
 */
function stop() {
    if (!state.isMonitoring) {
        return;
    }

    console.log('[GameflowController] Stopping gameflow monitoring');
    state.isMonitoring = false;

    // Clear intervals
    if (state.gameflowIntervalId) {
        clearInterval(state.gameflowIntervalId);
        state.gameflowIntervalId = null;
    }

    stopChampSelectPolling();
    resetChampSelectState();
}

/**
 * Set callback functions for events.
 *
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onPhaseChange - Called when gameflow phase changes
 * @param {Function} callbacks.onChampionDetected - Called when champion is detected
 * @param {Function} callbacks.onBuildLoaded - Called when build is loaded
 * @param {Function} callbacks.onBuildImported - Called when build is imported
 * @param {Function} callbacks.onError - Called on error
 */
function setCallbacks(callbacks) {
    state.callbacks = { ...state.callbacks, ...callbacks };
}

/**
 * Configure feature flags.
 *
 * @param {Object} config - Configuration options
 * @param {boolean} config.autoSwitchTab - Auto-switch to Builds tab on ChampSelect
 * @param {boolean} config.autoLoadBuild - Auto-load build when champion detected
 * @param {boolean} config.autoImportEnabled - Override auto-import checkbox
 */
function configure(config) {
    if (config.autoSwitchTab !== undefined) {
        state.autoSwitchTab = config.autoSwitchTab;
    }
    if (config.autoLoadBuild !== undefined) {
        state.autoLoadBuild = config.autoLoadBuild;
    }
    if (config.autoImportEnabled !== undefined) {
        state.autoImportEnabled = config.autoImportEnabled;
    }
}

/**
 * Get current state (for debugging).
 *
 * @returns {Object} Current state
 */
function getState() {
    return {
        isMonitoring: state.isMonitoring,
        currentPhase: state.currentPhase,
        previousPhase: state.previousPhase,
        inChampSelect: state.inChampSelect,
        lastDetectedChampionId: state.lastDetectedChampionId,
        detectedRole: state.detectedRole,
        autoSwitchTab: state.autoSwitchTab,
        autoLoadBuild: state.autoLoadBuild,
        autoImportEnabled: state.autoImportEnabled,
    };
}

/**
 * Force refresh - manually trigger a check.
 */
async function forceCheck() {
    await checkGameflowPhase();
    if (state.inChampSelect) {
        await checkChampionSelect();
    }
}

// =============================================================================
// EXPORT
// =============================================================================

window.GameflowController = {
    start,
    stop,
    setCallbacks,
    configure,
    getState,
    forceCheck,

    // Expose phase constants for external use
    phases: {
        NONE: 'None',
        LOBBY: 'Lobby',
        MATCHMAKING: 'Matchmaking',
        READY_CHECK: 'ReadyCheck',
        CHAMP_SELECT: 'ChampSelect',
        GAME_START: 'GameStart',
        IN_PROGRESS: 'InProgress',
        END_OF_GAME: 'EndOfGame',
    },
};

console.log('[GameflowController] Service loaded');
