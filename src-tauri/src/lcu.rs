//! League Client Update (LCU) API Module
//!
//! This module handles communication with the local League of Legends client
//! for importing rune pages and item sets.
//!
//! # Third-Party Application Compliance
//!
//! This functionality is designed to comply with Riot Games' third-party application policy:
//! - It does NOT automate gameplay or provide unfair competitive advantages
//! - It does NOT send keyboard/mouse inputs to the game
//! - It ONLY uses the officially supported local HTTP API endpoints
//! - All actions require EXPLICIT user interaction (button click)
//! - The same configurations can be set manually in the client
//!
//! Reference: https://support-leagueoflegends.riotgames.com/hc/en-us/articles/225266848-Third-Party-Applications

use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

/// Errors that can occur when interacting with the League Client
#[derive(Error, Debug)]
pub enum LcuError {
    #[error("League Client is not running. Please start the client first.")]
    ClientNotRunning,

    #[error("Could not find League Client lockfile at: {0}")]
    LockfileNotFound(PathBuf),

    #[error("Failed to parse lockfile: {0}")]
    LockfileParseError(String),

    #[error("HTTP request to League Client failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("League Client API error: {0}")]
    ApiError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

/// Connection info extracted from the League Client lockfile
#[derive(Debug, Clone)]
pub struct LcuConnection {
    pub port: u16,
    pub password: String,
    pub protocol: String,
}

impl LcuConnection {
    /// Build the base URL for League Client API requests
    pub fn base_url(&self) -> String {
        format!("{}://127.0.0.1:{}", self.protocol, self.port)
    }

    /// Build the Authorization header value (Basic Auth)
    pub fn auth_header(&self) -> String {
        let credentials = format!("riot:{}", self.password);
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
        format!("Basic {}", encoded)
    }
}

/// Payload for creating a rune page in the League Client
/// This structure matches the League Client API format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunePagePayload {
    pub name: String,
    pub primary_style_id: i32,
    pub sub_style_id: i32,
    pub selected_perk_ids: Vec<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<bool>,
}

/// Payload for an item set in the League Client
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSetPayload {
    pub title: String,
    #[serde(rename = "associatedChampions")]
    pub associated_champions: Vec<i64>,
    #[serde(rename = "associatedMaps")]
    pub associated_maps: Vec<i32>,
    pub blocks: Vec<ItemSetBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub champion: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isDeletable")]
    pub is_deletable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isEditable")]
    pub is_editable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sortrank: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub set_type: Option<String>,
}

/// A block within an item set (e.g., "Starting Items", "Core Build")
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSetBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub items: Vec<ItemSetItem>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "hideIfSummonerSpell")]
    pub hide_if_summoner_spell: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "showIfSummonerSpell")]
    pub show_if_summoner_spell: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "maxSummonerLevel")]
    pub max_summoner_level: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "minSummonerLevel")]
    pub min_summoner_level: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "recMath")]
    pub rec_math: Option<bool>,
}

/// An item within an item set block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemSetItem {
    pub id: String,
    pub count: i32,
}

/// Summoner spells payload from FocusApi (matches LCU format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummonerSpellsPayload {
    pub spell1_id: i32,
    pub spell2_id: i32,
}

/// Response from FocusApi /lol/import-payload endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPayloadResponse {
    pub champion: Option<String>,
    pub role: Option<String>,
    pub rune_page_payload: Option<RunePagePayload>,
    pub item_set_payload: Option<ItemSetPayload>,
    pub summoner_spells_payload: Option<SummonerSpellsPayload>,
}

/// Existing rune page from the client (for listing/deletion)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingRunePage {
    pub id: i64,
    pub name: String,
    pub is_deletable: bool,
    pub is_editable: bool,
    #[serde(default)]
    pub is_active: bool,
}

/// Result of importing a build
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub runes_imported: bool,
    pub items_imported: bool,
    pub summoners_imported: bool,
    pub message: String,
}

/// Find and parse the League Client lockfile to get connection info
///
/// The lockfile is located at:
/// - Windows: C:\Riot Games\League of Legends\lockfile
/// - macOS: /Applications/League of Legends.app/Contents/LoL/lockfile
///
/// Format: processname:pid:port:password:protocol
pub async fn find_lockfile() -> Result<LcuConnection, LcuError> {
    // Common installation paths for the lockfile
    let possible_paths = if cfg!(target_os = "windows") {
        vec![
            PathBuf::from(r"C:\Riot Games\League of Legends\lockfile"),
            PathBuf::from(r"D:\Riot Games\League of Legends\lockfile"),
            // Also check via LOCALAPPDATA for Riot Client installed games
            std::env::var("LOCALAPPDATA")
                .map(|p| PathBuf::from(p).join(r"Riot Games\League of Legends\lockfile"))
                .unwrap_or_default(),
        ]
    } else if cfg!(target_os = "macos") {
        vec![PathBuf::from(
            "/Applications/League of Legends.app/Contents/LoL/lockfile",
        )]
    } else {
        vec![]
    };

    // Try each possible path
    for path in possible_paths {
        if path.as_os_str().is_empty() {
            continue;
        }
        if let Ok(contents) = tokio::fs::read_to_string(&path).await {
            return parse_lockfile(&contents);
        }
    }

    Err(LcuError::ClientNotRunning)
}

/// Parse the lockfile content into connection info
fn parse_lockfile(contents: &str) -> Result<LcuConnection, LcuError> {
    let parts: Vec<&str> = contents.trim().split(':').collect();

    if parts.len() < 5 {
        return Err(LcuError::LockfileParseError(format!(
            "Expected 5 parts, got {}",
            parts.len()
        )));
    }

    let port = parts[2]
        .parse::<u16>()
        .map_err(|_| LcuError::LockfileParseError("Invalid port number".to_string()))?;

    Ok(LcuConnection {
        port,
        password: parts[3].to_string(),
        protocol: parts[4].to_string(),
    })
}

/// Create an HTTP client configured for League Client API
///
/// The client ignores certificate validation because the League Client
/// uses a self-signed certificate for its local HTTPS server.
fn create_lcu_client() -> Result<Client, LcuError> {
    Client::builder()
        // Accept self-signed certificates from League Client
        .danger_accept_invalid_certs(true)
        // Reasonable timeout for local requests
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(LcuError::HttpError)
}

/// Get all existing rune pages from the League Client
pub async fn get_rune_pages(connection: &LcuConnection) -> Result<Vec<ExistingRunePage>, LcuError> {
    let client = create_lcu_client()?;
    let url = format!("{}/lol-perks/v1/pages", connection.base_url());

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Failed to get rune pages: {} - {}",
            status, body
        )));
    }

    response.json().await.map_err(LcuError::HttpError)
}

/// Delete a rune page by ID
pub async fn delete_rune_page(connection: &LcuConnection, page_id: i64) -> Result<(), LcuError> {
    let client = create_lcu_client()?;
    let url = format!("{}/lol-perks/v1/pages/{}", connection.base_url(), page_id);

    let response = client
        .delete(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Failed to delete rune page: {} - {}",
            status, body
        )));
    }

    Ok(())
}

/// Prefix for FocusApp rune pages (singleton pattern)
pub const FOCUS_RUNE_PAGE_PREFIX: &str = "⚡";

/// Prefix for FocusApp item sets (singleton pattern)
pub const FOCUS_ITEM_SET_PREFIX: &str = "Focus: ";

/// Create a new rune page in the League Client (Singleton Pattern)
///
/// This function implements a singleton pattern for FocusApp rune pages:
/// 1. First, delete any existing page starting with "⚡"
/// 2. Then create the new page
///
/// This ensures only ONE FocusApp rune page exists at any time.
pub async fn create_rune_page(
    connection: &LcuConnection,
    payload: &RunePagePayload,
) -> Result<(), LcuError> {
    // Step 1: Get all existing rune pages
    let pages = get_rune_pages(connection).await?;

    // Step 2: Delete any existing FocusApp pages (pages starting with "⚡ FOCUS")
    for page in pages.iter() {
        if page.name.starts_with(FOCUS_RUNE_PAGE_PREFIX) && page.is_deletable {
            #[cfg(debug_assertions)]
            eprintln!(
                "[create_rune_page] Deleting existing FocusApp page: '{}' (id: {})",
                page.name, page.id
            );
            delete_rune_page(connection, page.id).await?;
        }
    }

    // Step 3: Create the new rune page
    let client = create_lcu_client()?;
    let url = format!("{}/lol-perks/v1/pages", connection.base_url());

    #[cfg(debug_assertions)]
    eprintln!("[create_rune_page] Creating new page: '{}'", payload.name);

    let response = client
        .post(&url)
        .header("Authorization", connection.auth_header())
        .header("Content-Type", "application/json")
        .json(payload)
        .send()
        .await?;

    if response.status().is_success() {
        return Ok(());
    }

    // If we hit the page limit, try to delete an old editable page and retry
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if body.contains("Max pages reached") || status.as_u16() == 400 {
        // Try to delete any editable page (not a FocusApp one, since we already deleted those)
        if let Some(deletable_page) = pages.iter().find(|p| {
            p.is_deletable && p.is_editable && !p.name.starts_with(FOCUS_RUNE_PAGE_PREFIX)
        }) {
            #[cfg(debug_assertions)]
            eprintln!(
                "[create_rune_page] Max pages reached, deleting: '{}' (id: {})",
                deletable_page.name, deletable_page.id
            );
            delete_rune_page(connection, deletable_page.id).await?;

            // Retry creating the page
            let retry_response = create_lcu_client()?
                .post(&url)
                .header("Authorization", connection.auth_header())
                .header("Content-Type", "application/json")
                .json(payload)
                .send()
                .await?;

            if retry_response.status().is_success() {
                return Ok(());
            }

            let retry_body = retry_response.text().await.unwrap_or_default();
            return Err(LcuError::ApiError(format!(
                "Failed to create rune page after deleting old one: {}",
                retry_body
            )));
        }

        return Err(LcuError::ApiError(
            "Max rune pages reached and no deletable pages found".to_string(),
        ));
    }

    Err(LcuError::ApiError(format!(
        "Failed to create rune page: {} - {}",
        status, body
    )))
}

/// Set summoner spells during champion select
///
/// This only works when the player is in champion select.
/// Uses PATCH /lol-champ-select/v1/session/my-selection
pub async fn set_summoner_spells(
    connection: &LcuConnection,
    payload: &SummonerSpellsPayload,
) -> Result<(), LcuError> {
    let client = create_lcu_client()?;
    let url = format!(
        "{}/lol-champ-select/v1/session/my-selection",
        connection.base_url()
    );

    #[cfg(debug_assertions)]
    eprintln!("[set_summoner_spells] PATCH {} with {:?}", url, payload);

    let response = client
        .patch(&url)
        .header("Authorization", connection.auth_header())
        .header("Content-Type", "application/json")
        .json(payload)
        .send()
        .await?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    // 404 means not in champion select - this is expected outside of champ select
    if status.as_u16() == 404 {
        return Err(LcuError::ApiError(
            "Not in champion select - summoner spells can only be changed during champ select"
                .to_string(),
        ));
    }

    Err(LcuError::ApiError(format!(
        "Failed to set summoner spells: {} - {}",
        status, body
    )))
}

/// Get the current summoner ID (needed for item sets)
pub async fn get_current_summoner_id(connection: &LcuConnection) -> Result<i64, LcuError> {
    let client = create_lcu_client()?;
    let url = format!("{}/lol-summoner/v1/current-summoner", connection.base_url());

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Failed to get current summoner: {} - {}",
            status, body
        )));
    }

    #[derive(Deserialize)]
    struct Summoner {
        #[serde(rename = "summonerId")]
        summoner_id: i64,
    }

    let summoner: Summoner = response.json().await?;
    Ok(summoner.summoner_id)
}

/// Get existing item sets for the current summoner
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSetsResponse {
    pub account_id: i64,
    pub item_sets: Vec<ItemSetPayload>,
    pub timestamp: i64,
}

pub async fn get_item_sets(
    connection: &LcuConnection,
    summoner_id: i64,
) -> Result<ItemSetsResponse, LcuError> {
    let client = create_lcu_client()?;
    let url = format!(
        "{}/lol-item-sets/v1/item-sets/{}/sets",
        connection.base_url(),
        summoner_id
    );

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Failed to get item sets: {} - {}",
            status, body
        )));
    }

    response.json().await.map_err(LcuError::HttpError)
}

/// Update item sets for the current summoner
pub async fn update_item_sets(
    connection: &LcuConnection,
    summoner_id: i64,
    item_sets: &ItemSetsResponse,
) -> Result<(), LcuError> {
    let client = create_lcu_client()?;
    let url = format!(
        "{}/lol-item-sets/v1/item-sets/{}/sets",
        connection.base_url(),
        summoner_id
    );

    let response = client
        .put(&url)
        .header("Authorization", connection.auth_header())
        .header("Content-Type", "application/json")
        .json(item_sets)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Failed to update item sets: {} - {}",
            status, body
        )));
    }

    Ok(())
}

/// Add an item set to the player's collection
///
/// This will fetch existing item sets, add the new one, and save.
/// Uses singleton pattern: removes all existing FocusApp item sets before adding new one.
pub async fn add_item_set(
    connection: &LcuConnection,
    item_set: &ItemSetPayload,
) -> Result<(), LcuError> {
    let summoner_id = get_current_summoner_id(connection).await?;
    let mut sets_response = get_item_sets(connection, summoner_id).await?;

    // Remove ALL existing FocusApp item sets (singleton pattern - only keep one)
    sets_response
        .item_sets
        .retain(|s| !s.title.starts_with(FOCUS_ITEM_SET_PREFIX));

    // Add the new item set
    sets_response.item_sets.push(item_set.clone());

    // Update timestamp
    sets_response.timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    update_item_sets(connection, summoner_id, &sets_response).await
}

// =============================================================================
// CHAMPION SELECT DETECTION
// =============================================================================

/// Champion select session data from LCU
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSelectSession {
    /// Local player's cell ID
    pub local_player_cell_id: Option<i64>,
    /// All actions in champion select (picks, bans, etc.)
    pub actions: Option<Vec<Vec<ChampSelectAction>>>,
    /// Team information
    pub my_team: Option<Vec<ChampSelectTeamMember>>,
    /// Game ID
    pub game_id: Option<i64>,
    /// Is spectating
    #[serde(default)]
    pub is_spectating: bool,
}

/// An action in champion select (pick or ban)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampSelectAction {
    /// Actor cell ID
    pub actor_cell_id: i64,
    /// Champion ID (0 if not selected)
    pub champion_id: i64,
    /// Action completed
    pub completed: bool,
    /// Action ID
    pub id: i64,
    /// Action type ("pick" or "ban")
    #[serde(rename = "type")]
    pub action_type: String,
}

/// Team member in champion select
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampSelectTeamMember {
    /// Cell ID
    pub cell_id: i64,
    /// Champion ID
    pub champion_id: i64,
    /// Assigned position (e.g., "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY")
    pub assigned_position: Option<String>,
    /// Summoner ID
    pub summoner_id: Option<i64>,
}

/// Get the current champion select session from the League Client.
///
/// This is used for auto-import functionality to detect when a player picks a champion.
///
/// # Compliance Note
/// - Uses official LCU endpoint /lol-champ-select/v1/session
/// - Read-only operation, does not modify game state
/// - Used for quality-of-life auto-import feature (user opt-in)
pub async fn get_champion_select_session(
    connection: &LcuConnection,
) -> Result<ChampionSelectSession, LcuError> {
    let client = create_lcu_client()?;
    let url = format!(
        "{}/lol-champ-select/v1/session",
        connection.base_url()
    );

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Not in champion select or error: {} - {}",
            status, body
        )));
    }

    response.json().await.map_err(LcuError::HttpError)
}

// =============================================================================
// GAMEFLOW SESSION - For monitoring game state transitions
// =============================================================================

/// Possible game phases from the LCU Gameflow API.
///
/// # Compliance Note
/// - This uses the official /lol-gameflow/v1/session endpoint
/// - Read-only monitoring of publicly available game state
/// - No modifications to game behavior
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GameflowPhase {
    None,
    Lobby,
    Matchmaking,
    CheckedIntoTournament,
    ReadyCheck,
    ChampSelect,
    GameStart,
    FailedToLaunch,
    InProgress,
    Reconnect,
    WaitingForStats,
    PreEndOfGame,
    EndOfGame,
    TerminatedInError,
    #[serde(other)]
    Unknown,
}

impl Default for GameflowPhase {
    fn default() -> Self {
        GameflowPhase::None
    }
}

/// Gameflow session data from the LCU API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameflowSession {
    pub phase: GameflowPhase,
    #[serde(default)]
    pub game_client: Option<GameClient>,
    #[serde(default)]
    pub game_data: Option<GameData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameClient {
    #[serde(default)]
    pub running: bool,
    #[serde(default)]
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameData {
    #[serde(default)]
    pub game_id: i64,
    #[serde(default)]
    pub queue: Option<QueueInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QueueInfo {
    #[serde(default)]
    pub id: i32,
    #[serde(default)]
    pub is_ranked: bool,
    #[serde(rename = "type", default)]
    pub queue_type: String,
}

/// Current summoner data from the LCU API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSummoner {
    pub summoner_id: i64,
    pub account_id: i64,
    pub puuid: String,
    pub display_name: String,
    #[serde(default)]
    pub summoner_level: i64,
    #[serde(default)]
    pub profile_icon_id: i32,
}

/// Get the current gameflow session from the League Client.
///
/// # Compliance Note
/// - Uses official LCU endpoint /lol-gameflow/v1/session
/// - Read-only operation for monitoring game state
/// - No competitive advantage - same info visible in client UI
pub async fn get_gameflow_session(
    connection: &LcuConnection,
) -> Result<GameflowSession, LcuError> {
    let client = create_lcu_client()?;
    let url = format!(
        "{}/lol-gameflow/v1/session",
        connection.base_url()
    );

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Gameflow session error: {} - {}",
            status, body
        )));
    }

    response.json().await.map_err(LcuError::HttpError)
}

/// Get the current summoner (logged-in user) from the League Client.
///
/// # Compliance Note
/// - Uses official LCU endpoint /lol-summoner/v1/current-summoner
/// - Returns public profile information of the logged-in user
/// - Required to identify local player's cellId in champion select
pub async fn get_current_summoner(
    connection: &LcuConnection,
) -> Result<CurrentSummoner, LcuError> {
    let client = create_lcu_client()?;
    let url = format!(
        "{}/lol-summoner/v1/current-summoner",
        connection.base_url()
    );

    let response = client
        .get(&url)
        .header("Authorization", connection.auth_header())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LcuError::ApiError(format!(
            "Current summoner error: {} - {}",
            status, body
        )));
    }

    response.json().await.map_err(LcuError::HttpError)
}

/// Get only the gameflow phase (lightweight check).
/// Returns the phase as a string for simpler frontend handling.
pub async fn get_gameflow_phase(
    connection: &LcuConnection,
) -> Result<String, LcuError> {
    let session = get_gameflow_session(connection).await?;
    Ok(format!("{:?}", session.phase))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lockfile() {
        let lockfile = "LeagueClient:12345:54321:supersecretpassword:https";
        let connection = parse_lockfile(lockfile).unwrap();

        assert_eq!(connection.port, 54321);
        assert_eq!(connection.password, "supersecretpassword");
        assert_eq!(connection.protocol, "https");
    }

    #[test]
    fn test_auth_header() {
        let connection = LcuConnection {
            port: 12345,
            password: "test".to_string(),
            protocol: "https".to_string(),
        };

        let auth = connection.auth_header();
        assert!(auth.starts_with("Basic "));
    }
}
