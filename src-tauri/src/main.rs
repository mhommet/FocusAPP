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

mod lcu;

use lcu::{
    add_item_set, create_rune_page, find_lockfile, ImportPayloadResponse, ImportResult, LcuError,
};
use serde::{Deserialize, Serialize};
use std::panic;

/// API configuration
const FOCUS_API_BASE_URL: &str = "https://api.hommet.ch/api/v1";

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
    let mut messages: Vec<String> = Vec::new();

    // Step 3: Import runes if available
    if let Some(rune_payload) = payload_response.rune_page_payload {
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
    if let Some(item_set_payload) = payload_response.item_set_payload {
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

    let success = runes_imported || items_imported;
    let message = if messages.is_empty() {
        "No data to import".to_string()
    } else {
        messages.join(". ")
    };

    Ok(ImportResult {
        success,
        runes_imported,
        items_imported,
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

    let response = client.post(&url).json(payload).send().await?;

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

/// Initialize the application with proper error handling.
/// This function runs before Tauri starts to catch early errors.
fn initialize_app() -> Result<(), Box<dyn std::error::Error>> {
    // Set up panic hook for better error messages in debug builds
    #[cfg(debug_assertions)]
    {
        panic::set_hook(Box::new(|panic_info| {
            eprintln!("=== PANIC DETECTED ===");
            eprintln!("{}", panic_info);
            if let Some(location) = panic_info.location() {
                eprintln!(
                    "Location: {}:{}:{}",
                    location.file(),
                    location.line(),
                    location.column()
                );
            }
            eprintln!("======================");
        }));
    }

    // Log startup in debug mode
    #[cfg(debug_assertions)]
    {
        eprintln!("=== FocusApp Starting ===");
        eprintln!("Debug mode enabled");
        if let Ok(exe_path) = std::env::current_exe() {
            eprintln!("Executable path: {:?}", exe_path);
        }
        if let Ok(cwd) = std::env::current_dir() {
            eprintln!("Current directory: {:?}", cwd);
        }
    }

    Ok(())
}

fn main() {
    // Run initialization and catch any errors before Tauri starts
    if let Err(e) = initialize_app() {
        eprintln!("Initialization error: {:?}", e);
        #[cfg(debug_assertions)]
        {
            // In debug mode, wait for user to see the error
            eprintln!("Press Enter to exit...");
            let mut input = String::new();
            let _ = std::io::stdin().read_line(&mut input);
        }
        std::process::exit(1);
    }

    // Build and run Tauri application
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            import_build_to_client,
            is_league_client_running
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            eprintln!("Tauri setup complete - commands registered");
            Ok(())
        })
        .run(tauri::generate_context!());

    // Handle Tauri errors
    if let Err(e) = result {
        eprintln!("Tauri error: {:?}", e);
        #[cfg(debug_assertions)]
        {
            eprintln!("Press Enter to exit...");
            let mut input = String::new();
            let _ = std::io::stdin().read_line(&mut input);
        }
        std::process::exit(1);
    }
}
