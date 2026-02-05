//! FocusApp - Tauri 2.0 Desktop Application
//!
//! This application helps League of Legends players configure their rune pages
//! and item sets more efficiently. It is designed to comply with Riot Games'
//! third-party application policy.
//!
//! # Third-Party Application Compliance
//!
//! This application:
//! - Does NOT automate gameplay or provide unfair competitive advantages
//! - Does NOT send keyboard/mouse inputs to the game client
//! - ONLY uses the officially supported local HTTP API endpoints
//! - All actions require EXPLICIT user interaction (button clicks)
//! - The same configurations can be set manually in the client
//!
//! Reference: https://support-leagueoflegends.riotgames.com/hc/en-us/articles/225266848-Third-Party-Applications
//!
//! # Debug Guide
//!
//! - Build with `cargo tauri build --debug` to enable console output
//! - Check %APPDATA%/com.focusapp.frontend for any app data files
//! - Common issues: file paths, permissions, missing resources

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod champions;
mod lcu;
mod overlay;

use lcu::{
    add_item_set, create_rune_page, find_lockfile, get_champion_select_session,
    get_current_summoner, get_gameflow_session, set_summoner_spells,
    ChampionSelectSession, CurrentSummoner, GameflowSession, ImportPayloadResponse,
    ImportResult, LcuError, SummonerSpellsPayload, FOCUS_ITEM_SET_PREFIX, FOCUS_RUNE_PAGE_PREFIX,
};
use serde::{Deserialize, Serialize};
use std::panic;

/// API configuration
const FOCUS_API_BASE_URL: &str = "https://api.hommet.ch/api/v1";

/// API key embedded at compile time via `FOCUS_API_KEY` env var.
/// Build with: FOCUS_API_KEY=your_key cargo tauri build
const FOCUS_API_KEY: &str = match option_env!("FOCUS_API_KEY") {
    Some(key) => key,
    None => "",
};

#[tauri::command]
fn get_env_api_key() -> String {
    FOCUS_API_KEY.to_string()
}

/// Runes primary/secondary structure for API request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuneTree {
    pub rune_ids: Vec<i64>,
    pub tree_id: i64,
}

/// Build data from the frontend - matches FocusApi /lol/import-payload request body
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPayloadRequest {
    pub boots: Option<i64>,
    pub champion_id: i64,
    pub champion_key: String,
    pub items_core: Vec<i64>,
    #[serde(default)]
    pub items_situational: Vec<i64>,
    pub items_starting: Vec<i64>,
    pub patch: String,
    pub role: String,
    pub rune_shards: Vec<i64>,
    pub runes_primary: RuneTree,
    pub runes_secondary: RuneTree,
    pub source: String,
    #[serde(default)]
    pub summoner_spells: Vec<i64>,
    pub title: String,
}

/// Error type for Tauri commands
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<LcuError> for CommandError {
    fn from(err: LcuError) -> Self {
        let code = match &err {
            LcuError::ClientNotRunning => "CLIENT_NOT_RUNNING",
            LcuError::LockfileNotFound(_) => "LOCKFILE_NOT_FOUND",
            LcuError::LockfileParseError(_) => "LOCKFILE_PARSE_ERROR",
            LcuError::HttpError(_) => "HTTP_ERROR",
            LcuError::ApiError(_) => "API_ERROR",
            LcuError::IoError(_) => "IO_ERROR",
        };
        CommandError {
            code: code.to_string(),
            message: err.to_string(),
        }
    }
}

impl From<reqwest::Error> for CommandError {
    fn from(err: reqwest::Error) -> Self {
        CommandError {
            code: "HTTP_ERROR".to_string(),
            message: format!("HTTP request failed: {}", err),
        }
    }
}

/// Import a build into the League Client.
///
/// # Compliance Note
///
/// This command is designed to comply with Riot Games' third-party application policy:
/// - It is ONLY triggered by explicit user action (clicking the "Import Build" button)
/// - It makes a SINGLE request per user action (no loops, no spam, no automation)
/// - It only uses the official League Client local API endpoints
/// - It does NOT send any keyboard or mouse inputs
/// - The data imported can be manually configured in the client
///
/// # Arguments
///
/// * `payload` - The full build data to send to FocusApi
///
/// # Returns
///
/// * `Ok(ImportResult)` - Success with details of what was imported
/// * `Err(CommandError)` - Error with code and message for the frontend to display
#[tauri::command]
async fn import_build_to_client(
    payload: ImportPayloadRequest,
) -> Result<ImportResult, CommandError> {
    #[cfg(debug_assertions)]
    eprintln!(
        "[import_build_to_client] Starting import for {} ({})",
        payload.champion_key, payload.role
    );

    // Step 1: Find and connect to the League Client
    let connection = find_lockfile().await.map_err(|e| {
        #[cfg(debug_assertions)]
        eprintln!("[import_build_to_client] Failed to find lockfile: {}", e);
        CommandError::from(e)
    })?;

    #[cfg(debug_assertions)]
    eprintln!(
        "[import_build_to_client] Connected to League Client on port {}",
        connection.port
    );

    // Step 2: Call FocusApi to get the import payloads (POST request)
    let payload_response = fetch_import_payloads(&payload).await?;

    #[cfg(debug_assertions)]
    eprintln!(
        "[import_build_to_client] Got payload response for {} ({})",
        payload_response.champion.as_deref().unwrap_or("unknown"),
        payload_response.role.as_deref().unwrap_or("unknown")
    );

    let mut runes_imported = false;
    let mut items_imported = false;
    let mut summoners_imported = false;
    let mut messages: Vec<String> = Vec::new();

    // Step 3: Import runes if available
    if let Some(mut rune_payload) = payload_response.rune_page_payload {
        // Construct the singleton page name: "⚡{Champion} {Role}"
        let champion = payload_response.champion.as_deref().unwrap_or("Unknown");
        let role = payload_response.role.as_deref().unwrap_or("").to_uppercase();
        rune_payload.name = format!("{}{} {}", FOCUS_RUNE_PAGE_PREFIX, champion, role);

        match create_rune_page(&connection, &rune_payload).await {
            Ok(()) => {
                runes_imported = true;
                messages.push(format!("Rune page '{}' imported", rune_payload.name));
                #[cfg(debug_assertions)]
                eprintln!("[import_build_to_client] Runes imported successfully");
            }
            Err(e) => {
                messages.push(format!("Failed to import runes: {}", e));
                #[cfg(debug_assertions)]
                eprintln!("[import_build_to_client] Failed to import runes: {}", e);
            }
        }
    }

    // Step 4: Import item set if available
    if let Some(mut item_set_payload) = payload_response.item_set_payload {
        // Construct the singleton page name: "⚡{Champion} {Role}"
        let champion = payload_response.champion.as_deref().unwrap_or("Unknown");
        let role = payload_response.role.as_deref().unwrap_or("").to_uppercase();
        item_set_payload.title = format!("{}{} {}", FOCUS_ITEM_SET_PREFIX, champion, role);

        match add_item_set(&connection, &item_set_payload).await {
            Ok(()) => {
                items_imported = true;
                messages.push(format!("Item set '{}' imported", item_set_payload.title));
                #[cfg(debug_assertions)]
                eprintln!("[import_build_to_client] Items imported successfully");
            }
            Err(e) => {
                messages.push(format!("Failed to import items: {}", e));
                #[cfg(debug_assertions)]
                eprintln!("[import_build_to_client] Failed to import items: {}", e);
            }
        }
    }

    // Step 5: Import summoner spells if available (only works during champ select)
    if let Some(spells_payload) = payload_response.summoner_spells_payload {
        match set_summoner_spells(&connection, &spells_payload).await {
            Ok(()) => {
                summoners_imported = true;
                messages.push("Summoner spells set".to_string());
                #[cfg(debug_assertions)]
                eprintln!("[import_build_to_client] Summoner spells imported successfully");
            }
            Err(e) => {
                // Don't add to messages if not in champ select - it's expected
                #[cfg(debug_assertions)]
                eprintln!("[import_build_to_client] Failed to set summoner spells: {}", e);
            }
        }
    }

    let success = runes_imported || items_imported || summoners_imported;
    let message = if messages.is_empty() {
        "No data to import".to_string()
    } else {
        messages.join(". ")
    };

    Ok(ImportResult {
        success,
        runes_imported,
        items_imported,
        summoners_imported,
        message,
    })
}

/// Fetch import payloads from FocusApi.
///
/// This function calls the external FocusApi with a POST request to get the
/// rune page and item set payloads formatted for the League Client API.
async fn fetch_import_payloads(
    payload: &ImportPayloadRequest,
) -> Result<ImportPayloadResponse, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let url = format!("{}/lol/import-payload", FOCUS_API_BASE_URL);

    #[cfg(debug_assertions)]
    eprintln!("[fetch_import_payloads] POST to: {}", url);

    let response = client
        .post(&url)
        .header("X-API-Key", FOCUS_API_KEY)
        .json(payload)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError {
            code: "API_ERROR".to_string(),
            message: format!("FocusApi returned error {}: {}", status, body),
        });
    }

    response.json().await.map_err(|e| CommandError {
        code: "PARSE_ERROR".to_string(),
        message: format!("Failed to parse FocusApi response: {}", e),
    })
}

/// Check if the League Client is currently running.
///
/// This is a lightweight check that only looks for the lockfile.
/// Useful for showing the import button state in the UI.
#[tauri::command]
async fn is_league_client_running() -> bool {
    find_lockfile().await.is_ok()
}

/// Set summoner spells directly in champion select.
///
/// This is a lightweight command that only sets summoner spells without
/// going through the full import flow. Used for the swap summoners feature.
#[tauri::command]
async fn set_summoner_spells_cmd(spell1_id: i32, spell2_id: i32) -> Result<bool, CommandError> {
    // Step 1: Connect to League Client
    let connection = find_lockfile().await.map_err(|e| match e {
        LcuError::ClientNotRunning => CommandError {
            code: "CLIENT_NOT_RUNNING".to_string(),
            message: "League Client is not running".to_string(),
        },
        _ => CommandError {
            code: "CONNECTION_ERROR".to_string(),
            message: format!("Failed to connect to League Client: {}", e),
        },
    })?;

    // Step 2: Set summoner spells
    let payload = SummonerSpellsPayload {
        spell1_id,
        spell2_id,
    };

    set_summoner_spells(&connection, &payload)
        .await
        .map_err(|e| CommandError {
            code: "LCU_ERROR".to_string(),
            message: format!("{}", e),
        })?;

    Ok(true)
}

/// Get the current champion select session.
///
/// # Compliance Note
///
/// This command is designed to comply with Riot Games' third-party application policy:
/// - It ONLY reads data from the official League Client API (no writes)
/// - It is used for opt-in auto-import feature that users must explicitly enable
/// - The same information is visible in the game client UI
/// - It does NOT provide any competitive advantage
///
/// # Returns
///
/// * `Ok(ChampionSelectSession)` - The current champion select session
/// * `Err(CommandError)` - Not in champion select or client not running
#[tauri::command]
async fn get_champion_select_session_cmd() -> Result<ChampionSelectSession, CommandError> {
    let connection = find_lockfile().await.map_err(CommandError::from)?;
    get_champion_select_session(&connection)
        .await
        .map_err(CommandError::from)
}

/// Get the current gameflow session from the League Client.
///
/// # Compliance Note
/// - Uses official LCU endpoint /lol-gameflow/v1/session
/// - Read-only monitoring of game state (Lobby, ChampSelect, InProgress, etc.)
/// - No competitive advantage - same info is visible in the client UI
/// - Used for auto-switching tabs when entering champion select
#[tauri::command]
async fn get_gameflow_session_cmd() -> Result<GameflowSession, CommandError> {
    let connection = find_lockfile().await.map_err(CommandError::from)?;
    get_gameflow_session(&connection)
        .await
        .map_err(CommandError::from)
}

/// Get the current summoner (logged-in user) from the League Client.
///
/// # Compliance Note
/// - Uses official LCU endpoint /lol-summoner/v1/current-summoner
/// - Returns only public profile information of the logged-in user
/// - Required to identify the local player's cellId in champion select
#[tauri::command]
async fn get_current_summoner_cmd() -> Result<CurrentSummoner, CommandError> {
    let connection = find_lockfile().await.map_err(CommandError::from)?;
    get_current_summoner(&connection)
        .await
        .map_err(CommandError::from)
}

/// Initialize the application with proper error handling.
/// This function runs before Tauri starts to catch early errors.
fn initialize_app() -> Result<(), Box<dyn std::error::Error>> {
    // Set up panic hook in ALL builds — release builds are silent otherwise
    panic::set_hook(Box::new(|panic_info| {
        let msg = format!("=== FOCUSAPP PANIC ===\n{}\n", panic_info);
        eprintln!("{}", msg);

        // Write to a crash log file next to the executable
        if let Ok(exe) = std::env::current_exe() {
            let crash_log = exe.with_file_name("focusapp-crash.log");
            let _ = std::fs::write(&crash_log, &msg);
        }
    }));

    // Log startup info in ALL builds — essential for diagnosing release crashes
    eprintln!("--- FocusApp Starting ---");
    if let Ok(exe_path) = std::env::current_exe() {
        eprintln!("Executable: {:?}", exe_path);
    }
    if let Ok(cwd) = std::env::current_dir() {
        eprintln!("CWD: {:?}", cwd);
    }
    eprintln!("FOCUS_API_KEY embedded: {}", !FOCUS_API_KEY.is_empty());

    Ok(())
}

fn main() {
    // 1. Print immediately — visible when run from a terminal
    eprintln!("--- APP STARTING ---");

    // 2. Run initialization (panic hook + diagnostics)
    if let Err(e) = initialize_app() {
        eprintln!("Initialization error: {:?}", e);
        std::process::exit(1);
    }

    eprintln!("--- BUILDING TAURI ---");

    // 3. Build and run Tauri application
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            import_build_to_client,
            is_league_client_running,
            set_summoner_spells_cmd,
            get_env_api_key,
            get_champion_select_session_cmd,
            // Gameflow monitoring commands
            get_gameflow_session_cmd,
            get_current_summoner_cmd,
            // CS Overlay commands
            overlay::is_game_active,
            overlay::get_live_cs_stats,
            overlay::show_cs_overlay,
            overlay::hide_cs_overlay,
            overlay::set_overlay_click_through,
            overlay::move_overlay,
            overlay::emit_cs_update
        ])
        .setup(|_app| {
            eprintln!("--- SETUP PHASE --- commands registered");
            Ok(())
        })
        .run(tauri::generate_context!());

    // 4. Handle Tauri errors
    if let Err(e) = result {
        eprintln!("Tauri error: {:?}", e);
        std::process::exit(1);
    }
}
