//! CS Overlay Window Management Module
//!
//! =============================================================================
//! CONFORMITE RIOT GAMES - AVERTISSEMENT LEGAL
//! =============================================================================
//!
//! Cet overlay est un outil PUREMENT INFORMATIF qui :
//! - N'injecte AUCUN code dans le client League of Legends
//! - N'envoie AUCUN input (clavier/souris) au jeu
//! - Ne contient AUCUNE macro ni automatisation
//! - Se base UNIQUEMENT sur les donnees de la Live Client Data API officielle
//!
//! La Live Client Data API (https://developer.riotgames.com/docs/lol#game-client-api)
//! est une API OFFICIELLE fournie par Riot Games, accessible localement sur le port 2999
//! pendant une partie. Son utilisation est explicitement autorisee par Riot.
//!
//! Cet outil respecte les Terms of Service de Riot Games car :
//! 1. Il n'altere pas l'integrite du jeu
//! 2. Il n'offre aucun avantage competitif deloyal (les donnees sont accessibles a tous)
//! 3. Il n'affecte pas l'experience des autres joueurs
//! 4. Il ne modifie aucun fichier du jeu
//!
//! Reference: https://support-leagueoflegends.riotgames.com/hc/en-us/articles/225266848
//! =============================================================================

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// Constante pour le port Live Client API
const LIVE_CLIENT_API_PORT: u16 = 2999;

/// Configuration de l'overlay sauvegardee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayConfig {
    pub position_x: i32,
    pub position_y: i32,
    pub opacity: f64,
    pub click_through: bool,
    pub role: String,
    pub rank: String,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            position_x: 10,
            position_y: 150,
            opacity: 0.88,
            click_through: true,
            role: "mid".to_string(),
            rank: "platinum".to_string(),
        }
    }
}

/// Affiche l'overlay CS.
///
/// # Compliance Note
/// Cette commande affiche simplement une fenetre d'information.
/// Elle ne modifie pas le jeu et n'envoie aucun input.
#[tauri::command]
pub async fn show_cs_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("cs-overlay") {
        window.show().map_err(|e| e.to_string())?;
        // Ne pas prendre le focus pour ne pas interrompre le jeu
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Cache l'overlay CS.
#[tauri::command]
pub async fn hide_cs_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("cs-overlay") {
        window.hide().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Definit le mode click-through (les clics passent a travers la fenetre).
///
/// Quand active, l'overlay devient completement non-interactif,
/// permettant de cliquer sur le jeu en dessous.
#[tauri::command]
pub async fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("cs-overlay") {
        window
            .set_ignore_cursor_events(enabled)
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Deplace l'overlay a une nouvelle position.
#[tauri::command]
pub async fn move_overlay(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("cs-overlay") {
        use tauri::PhysicalPosition;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/// Verifie si une partie est en cours via la Live Client Data API.
///
/// # Compliance Note
/// Cette fonction fait une simple requete GET vers l'API locale de Riot
/// sur le port 2999. Cette API est OFFICIELLEMENT fournie par Riot Games
/// et documentee sur leur site developpeur.
///
/// Endpoint local: https://127.0.0.1:2999/liveclientdata/allgamedata
/// 
/// # Correction
/// Le port est bien 2999 (pas 29990 comme mentionné dans certaines docs obsolètes)
#[tauri::command]
pub async fn is_game_active() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true) // Certificat auto-signe de Riot (localhost uniquement)
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://127.0.0.1:{}/liveclientdata/gamestats",
        LIVE_CLIENT_API_PORT
    );

    match client.get(&url).send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false), // Pas de partie en cours ou API inaccessible
    }
}

/// Recupere le PUUID du joueur actif depuis le Live Client Data API.
///
/// Necessaire pour appeler l'endpoint /live/cs-stats de FocusApi.
#[tauri::command]
pub async fn get_active_player_puuid() -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    // D'abord on recupere le nom du joueur actif
    let active_player_response = match client
        .get("https://127.0.0.1:2999/liveclientdata/activeplayername")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp,
        _ => return Ok(None),
    };

    let active_player_name: String = active_player_response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // Ensuite on recupere la liste des joueurs pour trouver le PUUID
    let players_response = match client
        .get("https://127.0.0.1:2999/liveclientdata/playerlist")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp,
        _ => return Ok(None),
    };

    #[derive(Deserialize)]
    struct PlayerInfo {
        #[serde(rename = "riotIdGameName")]
        riot_id_game_name: Option<String>,
        #[serde(rename = "summonerName")]
        summoner_name: String,
        // Note: Le PUUID n'est pas directement expose par le Live Client API
        // On devra utiliser une autre methode ou l'obtenir du LCU
    }

    let players: Vec<PlayerInfo> = players_response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // Trouver le joueur actif
    let _active_player = players.iter().find(|p| {
        p.summoner_name == active_player_name
            || p.riot_id_game_name.as_ref() == Some(&active_player_name)
    });

    // Note: Le Live Client Data API ne fournit pas directement le PUUID
    // On retourne None pour l'instant, le frontend utilisera le LCU pour l'obtenir
    Ok(None)
}

/// Recupere les stats CS en temps reel depuis le Live Client Data API local.
/// Retourne les CS actuels et le temps de jeu.
/// 
/// # Endpoint
/// GET https://127.0.0.1:2999/liveclientdata/activeplayer
/// GET https://127.0.0.1:2999/liveclientdata/gamestats
#[tauri::command]
pub async fn get_live_cs_stats() -> Result<Option<LiveCsData>, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true) // Sécurisé : connexion localhost uniquement
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    // Recuperer les stats du joueur actif
    let active_player_url = format!(
        "https://127.0.0.1:{}/liveclientdata/activeplayer",
        LIVE_CLIENT_API_PORT
    );
    
    let active_player_response = match client.get(&active_player_url).send().await {
        Ok(resp) if resp.status().is_success() => resp,
        _ => return Ok(None),
    };

    let active_player: serde_json::Value = active_player_response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // Recuperer le temps de jeu
    let game_stats_url = format!(
        "https://127.0.0.1:{}/liveclientdata/gamestats",
        LIVE_CLIENT_API_PORT
    );
    
    let game_stats_response = match client.get(&game_stats_url).send().await {
        Ok(resp) if resp.status().is_success() => resp,
        _ => return Ok(None),
    };

    let game_stats: serde_json::Value = game_stats_response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // Extraire les donnees
    let cs = active_player
        .get("championStats")
        .and_then(|stats| stats.get("creepScore"))
        .and_then(|v| v.as_f64()) // creepScore can be float (42.0) or int (42)
        .map(|v| v as i32)
        .unwrap_or(0);

    let game_time = game_stats
        .get("gameTime")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let game_id = game_stats
        .get("gameId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Calculer CS/min
    let cs_per_min = if game_time > 0.0 {
        (cs as f64) / (game_time / 60.0)
    } else {
        0.0
    };

    Ok(Some(LiveCsData {
        current_cs: cs,
        game_time_seconds: game_time,
        cs_per_minute: cs_per_min,
        game_id,
    }))
}

/// Donnees CS en temps reel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveCsData {
    pub current_cs: i32,
    pub game_time_seconds: f64,
    pub cs_per_minute: f64,
    pub game_id: String,
}

/// Envoie un evenement a la fenetre overlay pour mettre a jour les stats.
#[tauri::command]
pub async fn emit_cs_update(app: AppHandle, stats: serde_json::Value) -> Result<(), String> {
    app.emit("cs-overlay-update", stats)
        .map_err(|e: tauri::Error| e.to_string())
}
