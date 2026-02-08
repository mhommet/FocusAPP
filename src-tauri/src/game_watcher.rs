//! Game Watcher Module - Détection d'état du jeu League of Legends
//!
//! =============================================================================
//! CONFORMITE VANGUARD / RIOT GAMES
//! =============================================================================
//!
//! Ce module est 100% conforme aux Terms of Service de Riot Games car :
//!
//! 1. **Zero Memory Reading** : Utilise UNIQUEMENT les APIs HTTP officielles
//!    - LCU API (League Client) sur port dynamique
//!    - Live Client Data API (In-Game) sur port 2999
//!
//! 2. **No Automation** : Ne simule aucun input clavier/souris
//!    - Lecture seule des données publiques
//!    - Aucune modification du client de jeu
//!
//! 3. **Official APIs** :
//!    - /lol-gameflow/v1/gameflow-phase (LCU)
//!    - /liveclientdata/allgamedata (Live Client)
//!    - Documentées sur https://developer.riotgames.com/docs/lol
//!
//! 4. **Local Only** : Toutes les requêtes restent sur localhost (127.0.0.1)
//!    - Aucune donnée n'est envoyée à des serveurs externes
//!    - Respecte la politique de sécurité Vanguard
//!
//! Références :
//! - https://developer.riotgames.com/docs/lol#game-client-api
//! - https://support-leagueoflegends.riotgames.com/hc/en-us/articles/225266848
//! =============================================================================

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use tokio::time::{interval, Duration};

use crate::lcu::{find_lockfile, GameflowPhase, LcuConnection};

// =============================================================================
// CONSTANTES
// =============================================================================

/// Port fixe de l'API Live Client Data (In-Game)
/// ATTENTION : C'est bien 2999, PAS 29990!
const LIVE_CLIENT_PORT: u16 = 2999;

/// Intervalle de polling pour le LCU (Client)
const LCU_POLL_INTERVAL_MS: u64 = 1000;

/// Intervalle de polling pour le Live Client (In-Game) - plus rapide
const INGAME_POLL_INTERVAL_MS: u64 = 500;

/// Timeout pour les requêtes HTTP vers les APIs locales
const REQUEST_TIMEOUT_SECS: u64 = 3;

// =============================================================================
// STRUCTURES DE DONNÉES
// =============================================================================

/// État actuel du jeu détecté par le watcher
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GameState {
    /// Client fermé ou inaccessible
    ClientClosed,
    /// Client ouvert, aucune activité
    None,
    /// Dans un lobby
    Lobby,
    /// Recherche de partie
    Matchmaking,
    /// Sélection de champion
    ChampSelect { champion_id: Option<i64> },
    /// En jeu (phase de chargement)
    GameStart,
    /// Partie en cours
    InProgress { game_data: Option<LiveGameData> },
    /// Fin de partie
    EndOfGame,
    /// Erreur de détection
    Error { message: String },
}

impl Default for GameState {
    fn default() -> Self {
        GameState::ClientClosed
    }
}

/// Données du jeu en cours (depuis Live Client Data API)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveGameData {
    /// CS actuels (creep score)
    pub current_cs: i32,
    /// CS par minute
    pub cs_per_minute: f64,
    /// Or actuel
    pub current_gold: f64,
    /// Temps de jeu en secondes
    pub game_time: f64,
    /// Nom du champion joué
    pub champion_name: String,
    /// ID de la partie
    pub game_id: String,
    /// Niveau du champion
    pub level: i32,
    /// HP actuels
    pub current_health: f64,
    /// HP max
    pub max_health: f64,
    /// Mana/Energy actuel
    pub current_mana: f64,
    /// Mana/Energy max
    pub max_mana: f64,
}

/// État interne du watcher (partagé entre threads)
#[derive(Debug, Default)]
struct WatcherState {
    /// Dernière phase connue
    last_phase: Option<GameflowPhase>,
    /// Dernière connexion LCU valide
    last_connection: Option<LcuConnection>,
    /// ID de la partie en cours (pour éviter les doublons)
    current_game_id: Option<String>,
    /// Indique si on est en mode "jeu en cours"
    in_live_game: bool,
}

// =============================================================================
// GAME WATCHER - STRUCTURE PRINCIPALE
// =============================================================================

/// Gestionnaire de surveillance du jeu
///
/// Cette structure est thread-safe et peut être partagée entre
/// les commandes Tauri et la tâche de polling en arrière-plan.
pub struct GameWatcher {
    /// État interne protégé par un RwLock pour lecture concurrente
    state: Arc<RwLock<WatcherState>>,
    /// Handle de l'application Tauri pour émettre des événements
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    /// Indique si le watcher est en cours d'exécution
    running: Arc<RwLock<bool>>,
}

impl GameWatcher {
    /// Crée une nouvelle instance du watcher
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(WatcherState::default())),
            app_handle: Arc::new(Mutex::new(None)),
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Démarre le watcher avec l'AppHandle Tauri
    ///
    /// Cette méthode démarre une tâche asynchrone en arrière-plan
    /// qui poll les APIs en continu.
    pub async fn start(&self, app: AppHandle) {
        // Stocke l'app handle
        {
            let mut handle = self.app_handle.lock().await;
            *handle = Some(app);
        }

        // Marque comme running
        {
            let mut running = self.running.write().await;
            *running = true;
        }

        // Clone les Arc pour le spawn
        let state = Arc::clone(&self.state);
        let app_handle = Arc::clone(&self.app_handle);
        let running = Arc::clone(&self.running);

        // Démarre la tâche de polling en arrière-plan
        tokio::spawn(async move {
            polling_loop(state, app_handle, running).await;
        });

        #[cfg(debug_assertions)]
        eprintln!("[GameWatcher] Démarré");
    }

    /// Arrête le watcher
    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
        #[cfg(debug_assertions)]
        eprintln!("[GameWatcher] Arrêté");
    }

    /// Retourne l'état actuel du jeu
    pub async fn get_current_state(&self) -> GameState {
        let state = self.state.read().await;
        self.build_game_state(&state).await
    }
    
    /// Retourne l'état actuel du jeu (version pour commandes Tauri)
    pub async fn get_current_state_result(&self) -> Result<GameState, String> {
        Ok(self.get_current_state().await)
    }

    /// Construit l'état du jeu à partir de l'état interne
    async fn build_game_state(&self, state: &WatcherState) -> GameState {
        match &state.last_phase {
            None => GameState::ClientClosed,
            Some(phase) => match phase {
                GameflowPhase::None => GameState::None,
                GameflowPhase::Lobby => GameState::Lobby,
                GameflowPhase::Matchmaking => GameState::Matchmaking,
                GameflowPhase::ChampSelect => {
                    // Tente de récupérer le champion sélectionné
                    let champion_id = if let Some(conn) = &state.last_connection {
                        get_selected_champion(conn).await.ok()
                    } else {
                        None
                    };
                    GameState::ChampSelect { champion_id }
                }
                GameflowPhase::GameStart => GameState::GameStart,
                GameflowPhase::InProgress => {
                    if state.in_live_game {
                        // Récupère les données live si disponibles
                        match fetch_live_game_data().await {
                            Ok(data) => GameState::InProgress {
                                game_data: Some(data),
                            },
                            Err(_) => GameState::InProgress { game_data: None },
                        }
                    } else {
                        GameState::InProgress { game_data: None }
                    }
                }
                GameflowPhase::EndOfGame | GameflowPhase::PreEndOfGame => GameState::EndOfGame,
                _ => GameState::None,
            },
        }
    }
}

impl Default for GameWatcher {
    fn default() -> Self {
        Self::new()
    }
}

// Clone manuel pour permettre le partage dans Tauri State
impl Clone for GameWatcher {
    fn clone(&self) -> Self {
        Self {
            state: Arc::clone(&self.state),
            app_handle: Arc::clone(&self.app_handle),
            running: Arc::clone(&self.running),
        }
    }
}

// =============================================================================
// BOUCLE DE POLLING PRINCIPALE
// =============================================================================

/// Boucle principale de polling qui tourne en arrière-plan
///
/// Cette fonction est exécutée dans une tâche Tokio séparée et
/// poll alternativement le LCU et le Live Client selon l'état.
async fn polling_loop(
    state: Arc<RwLock<WatcherState>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    running: Arc<RwLock<bool>>,
) {
    let mut lcu_interval = interval(Duration::from_millis(LCU_POLL_INTERVAL_MS));
    let mut ingame_interval = interval(Duration::from_millis(INGAME_POLL_INTERVAL_MS));

    // Désactive le tick immédiat
    lcu_interval.tick().await;

    loop {
        // Vérifie si on doit s'arrêter
        {
            let is_running = *running.read().await;
            if !is_running {
                break;
            }
        }

        // Récupère l'état actuel
        let current_mode = {
            let state_guard = state.read().await;
            if state_guard.in_live_game {
                "ingame"
            } else {
                "lcu"
            }
        };

        // Poll selon le mode
        if current_mode == "lcu" {
            tokio::select! {
                _ = lcu_interval.tick() => {
                    if let Err(e) = poll_lcu(&state, &app_handle).await {
                        #[cfg(debug_assertions)]
                        eprintln!("[GameWatcher] LCU poll error: {}", e);
                    }
                }
            }
        } else {
            tokio::select! {
                _ = ingame_interval.tick() => {
                    if let Err(e) = poll_ingame(&state, &app_handle).await {
                        #[cfg(debug_assertions)]
                        eprintln!("[GameWatcher] InGame poll error: {}", e);
                    }
                }
            }
        }
    }
}

// =============================================================================
// POLLING LCU (LEAGUE CLIENT)
// =============================================================================

/// Polling de l'état du League Client
async fn poll_lcu(
    state: &Arc<RwLock<WatcherState>>,
    app_handle: &Arc<Mutex<Option<AppHandle>>>,
) -> Result<(), String> {
    // 1. Tente de trouver le lockfile
    let connection = match find_lockfile().await {
        Ok(conn) => conn,
        Err(_) => {
            // Client fermé
            let mut state_guard = state.write().await;
            let changed = state_guard.last_phase.is_some();
            state_guard.last_phase = None;
            state_guard.last_connection = None;
            state_guard.in_live_game = false;

            if changed {
                drop(state_guard);
                emit_state_change(app_handle, GameState::ClientClosed).await;
            }
            return Ok(());
        }
    };

    // 2. Récupère la phase actuelle
    let phase = match fetch_gameflow_phase(&connection).await {
        Ok(p) => p,
        Err(e) => {
            #[cfg(debug_assertions)]
            eprintln!("[GameWatcher] Failed to fetch gameflow phase: {}", e);
            return Ok(());
        }
    };

    // 3. Met à jour l'état si changement
    let mut state_guard = state.write().await;
    let previous_phase = state_guard.last_phase.clone();

    if previous_phase.as_ref() != Some(&phase) {
        #[cfg(debug_assertions)]
        eprintln!(
            "[GameWatcher] Phase changed: {:?} -> {:?}",
            previous_phase,
            phase
        );

        state_guard.last_phase = Some(phase.clone());
        state_guard.last_connection = Some(connection);

        // Détecte le passage en mode "In Game"
        if phase == GameflowPhase::InProgress {
            state_guard.in_live_game = true;
        }

        // Construit et émet le nouvel état
        let game_state = match phase {
            GameflowPhase::None => GameState::None,
            GameflowPhase::Lobby => GameState::Lobby,
            GameflowPhase::ChampSelect => GameState::ChampSelect { champion_id: None },
            GameflowPhase::GameStart => GameState::GameStart,
            GameflowPhase::InProgress => GameState::InProgress { game_data: None },
            GameflowPhase::EndOfGame => GameState::EndOfGame,
            _ => GameState::None,
        };

        drop(state_guard);
        emit_state_change(app_handle, game_state).await;
    } else {
        // Même phase, met juste à jour la connexion
        state_guard.last_connection = Some(connection);
    }

    Ok(())
}

/// Récupère la phase actuelle depuis le LCU
async fn fetch_gameflow_phase(
    connection: &LcuConnection,
) -> Result<GameflowPhase, String> {
    let client = create_lcu_http_client()?;
    let url = format!("{}/lol-gameflow/v1/gameflow-phase", connection.base_url());

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let phase_str: String = response.json().await.map_err(|e| e.to_string())?;

    // Parse la chaîne en enum
    let phase = match phase_str.as_str() {
        "None" => GameflowPhase::None,
        "Lobby" => GameflowPhase::Lobby,
        "Matchmaking" => GameflowPhase::Matchmaking,
        "CheckedIntoTournament" => GameflowPhase::CheckedIntoTournament,
        "ReadyCheck" => GameflowPhase::ReadyCheck,
        "ChampSelect" => GameflowPhase::ChampSelect,
        "GameStart" => GameflowPhase::GameStart,
        "FailedToLaunch" => GameflowPhase::FailedToLaunch,
        "InProgress" => GameflowPhase::InProgress,
        "Reconnect" => GameflowPhase::Reconnect,
        "WaitingForStats" => GameflowPhase::WaitingForStats,
        "PreEndOfGame" => GameflowPhase::PreEndOfGame,
        "EndOfGame" => GameflowPhase::EndOfGame,
        "TerminatedInError" => GameflowPhase::TerminatedInError,
        _ => GameflowPhase::Unknown,
    };

    Ok(phase)
}

/// Récupère le champion sélectionné pendant la champ select
async fn get_selected_champion(
    connection: &LcuConnection,
) -> Result<i64, String> {
    let client = create_lcu_http_client()?;
    let url = format!(
        "{}/lol-champ-select/v1/session",
        connection.base_url()
    );

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err("Not in champ select".to_string());
    }

    #[derive(Deserialize)]
    struct Session {
        #[serde(rename = "localPlayerCellId")]
        local_player_cell_id: i64,
        #[serde(rename = "myTeam")]
        my_team: Vec<TeamMember>,
    }

    #[derive(Deserialize)]
    struct TeamMember {
        #[serde(rename = "cellId")]
        cell_id: i64,
        #[serde(rename = "championId")]
        champion_id: i64,
    }

    let session: Session = response.json().await.map_err(|e| e.to_string())?;

    // Trouve le champion du joueur local
    let champion_id = session
        .my_team
        .iter()
        .find(|m| m.cell_id == session.local_player_cell_id)
        .map(|m| m.champion_id)
        .unwrap_or(0);

    Ok(champion_id)
}

// =============================================================================
// POLLING IN-GAME (LIVE CLIENT DATA API)
// =============================================================================

/// Polling des données en jeu
async fn poll_ingame(
    state: &Arc<RwLock<WatcherState>>,
    app_handle: &Arc<Mutex<Option<AppHandle>>>,
) -> Result<(), String> {
    // Vérifie si le jeu est toujours actif
    match fetch_live_game_data().await {
        Ok(data) => {
            // Jeu toujours actif, émet les données mises à jour
            let game_state = GameState::InProgress {
                game_data: Some(data.clone()),
            };
            emit_state_change(app_handle, game_state).await;

            // Met à jour l'ID de partie
            let mut state_guard = state.write().await;
            state_guard.current_game_id = Some(data.game_id);
        }
        Err(_) => {
            // Le jeu n'est plus accessible
            let mut state_guard = state.write().await;

            if state_guard.in_live_game {
                #[cfg(debug_assertions)]
            eprintln!("[GameWatcher] Game ended, switching back to LCU mode");
                state_guard.in_live_game = false;
                state_guard.current_game_id = None;

                // Revérifie le LCU pour voir la nouvelle phase
                drop(state_guard);
                poll_lcu(state, app_handle).await?;
            }
        }
    }

    Ok(())
}

/// Récupère les données de jeu en temps réel depuis le Live Client Data API
///
/// # Compliance Note
/// Cette fonction utilise l'endpoint officiel /liveclientdata/activeplayer
/// fourni par Riot Games. C'est une API documentée et autorisée.
async fn fetch_live_game_data() -> Result<LiveGameData, String> {
    let client = create_ingame_http_client()?;

    // Récupère les données du joueur actif
    let active_player_url = format!(
        "https://127.0.0.1:{}/liveclientdata/activeplayer",
        LIVE_CLIENT_PORT
    );

    let active_player_response = client
        .get(&active_player_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !active_player_response.status().is_success() {
        return Err("Live Client API not available".to_string());
    }

    #[derive(Deserialize)]
    struct ActivePlayer {
        #[serde(rename = "championStats")]
        champion_stats: ChampionStats,
        #[serde(rename = "fullRunes")]
        full_runes: Option<serde_json::Value>,
    }

    #[derive(Deserialize)]
    struct ChampionStats {
        #[serde(rename = "championName")]
        champion_name: Option<String>,
        #[serde(rename = "creepScore")]
        creep_score: f64,
        #[serde(rename = "currentGold")]
        current_gold: f64,
        level: i32,
        #[serde(rename = "currentHealth")]
        current_health: f64,
        #[serde(rename = "maxHealth")]
        max_health: f64,
        #[serde(rename = "resourceValue")]
        resource_value: f64,
        #[serde(rename = "resourceMax")]
        resource_max: f64,
    }

    let active_player: ActivePlayer = active_player_response.json().await.map_err(|e| e.to_string())?;
    let stats = active_player.champion_stats;

    // Récupère les stats de la partie
    let game_stats_url = format!(
        "https://127.0.0.1:{}/liveclientdata/gamestats",
        LIVE_CLIENT_PORT
    );

    let game_stats_response = client.get(&game_stats_url).send().await.map_err(|e| e.to_string())?;

    #[derive(Deserialize)]
    struct GameStats {
        #[serde(rename = "gameTime")]
        game_time: f64,
        #[serde(rename = "gameMode")]
        game_mode: String,
        #[serde(rename = "gameId")]
        game_id: Option<String>,
    }

    let game_stats: GameStats = game_stats_response.json().await.map_err(|e| e.to_string())?;

    // Calcule le CS/min
    let cs = stats.creep_score as i32;
    let cs_per_min = if game_stats.game_time > 0.0 {
        cs as f64 / (game_stats.game_time / 60.0)
    } else {
        0.0
    };

    Ok(LiveGameData {
        current_cs: cs,
        cs_per_minute: cs_per_min.round() as f64 / 100.0 * 100.0, // Arrondi à 2 décimales
        current_gold: stats.current_gold,
        game_time: game_stats.game_time,
        champion_name: stats.champion_name.unwrap_or_else(|| "Unknown".to_string()),
        game_id: game_stats.game_id.unwrap_or_else(|| "unknown".to_string()),
        level: stats.level,
        current_health: stats.current_health,
        max_health: stats.max_health,
        current_mana: stats.resource_value,
        max_mana: stats.resource_max,
    })
}

// =============================================================================
// ÉMISSION D'ÉVÉNEMENTS TAURI
// =============================================================================

/// Émet un événement `game-state-changed` vers le frontend
async fn emit_state_change(app_handle: &Arc<Mutex<Option<AppHandle>>>, state: GameState) {
    let handle_guard = app_handle.lock().await;

    if let Some(app) = handle_guard.as_ref() {
        // Émet vers la fenêtre principale
        if let Err(e) = app.emit("game-state-changed", &state) {
            #[cfg(debug_assertions)]
            eprintln!("[GameWatcher] Failed to emit state change: {}", e);
        }

        // Émet également vers l'overlay s'il existe
        let _ = app.emit("cs-overlay-update", &state);

        #[cfg(debug_assertions)]
        eprintln!("[GameWatcher] Emitted state: {:?}", state);
    }
}

// =============================================================================
// CLIENTS HTTP AVEC GESTION DES CERTIFICATS
// =============================================================================

/// Crée un client HTTP configuré pour le LCU (League Client)
///
/// # Security Note
/// `danger_accept_invalid_certs(true)` est nécessaire car le League Client
/// utilise un certificat auto-signé. C'est sécurisé car :
/// - La connexion est locale (127.0.0.1)
/// - Le lockfile est lu depuis le système de fichiers local
/// - Aucune donnée ne quitte la machine
fn create_lcu_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

/// Crée un client HTTP configuré pour le Live Client Data API (In-Game)
///
/// # Security Note
/// Même configuration que le LCU - le jeu utilise un certificat auto-signé.
/// C'est sécurisé car c'est une connexion localhost uniquement.
fn create_ingame_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

// =============================================================================
// COMMANDES TAURI
// =============================================================================

/// Commande Tauri : Obtient l'état actuel du jeu
///
/// # Usage Frontend (JavaScript/TypeScript)
/// ```typescript
/// const state = await invoke('get_game_state');
/// console.log(state); // { type: 'InProgress', currentCs: 120, ... }
/// ```
#[tauri::command]
pub async fn get_game_state(
    watcher: tauri::State<'_, GameWatcher>,
) -> Result<GameState, String> {
    Ok(watcher.get_current_state().await)
}

/// Commande Tauri : Démarre le watcher manuellement
/// (Normalement démarré automatiquement au lancement)
#[tauri::command]
pub async fn start_game_watcher(
    app: AppHandle,
    watcher: tauri::State<'_, GameWatcher>,
) -> Result<(), String> {
    watcher.start(app).await;
    Ok(())
}

/// Commande Tauri : Arrête le watcher
#[tauri::command]
pub async fn stop_game_watcher(
    watcher: tauri::State<'_, GameWatcher>,
) -> Result<(), String> {
    watcher.stop().await;
    Ok(())
}

/// Commande Tauri : Force un refresh manuel de l'état
#[tauri::command]
pub async fn refresh_game_state(
    app: AppHandle,
    watcher: tauri::State<'_, GameWatcher>,
) -> Result<GameState, String> {
    // Réémet l'état actuel
    let state = watcher.get_current_state().await;
    let _ = app.emit("game-state-changed", &state);
    Ok(state)
}
