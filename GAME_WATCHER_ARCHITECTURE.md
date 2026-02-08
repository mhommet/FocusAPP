# Architecture GameWatcher - FocusApp

## 🎯 Résumé

Ce document explique l'architecture complète mise en place pour résoudre le problème de détection d'état du jeu League of Legends.

## 📋 Problème Originel

1. **L'application ne détectait pas** l'entrée dans le Lobby ni la Champ Select
2. **L'overlay CS restait bloqué** sur "En attente de partie"
3. **Causes root** :
   - Confusion entre LCU API et Live Client Data API
   - Frontend essayait d'appeler directement les APIs (CORS/certificats)
   - Port incorrect : `29990` au lieu de `2999`
   - Pas de polling continu côté Rust

---

## 🔧 Distinction APIs

### API LCU (League Client Update)
| Caractéristique | Valeur |
|-----------------|--------|
| **Port** | Dynamique (lu depuis `lockfile`) |
| **Auth** | Basic Auth (riot:password) |
| **Disponible** | Dès l'ouverture du client |
| **Endpoints clés** | `/lol-gameflow/v1/gameflow-phase`, `/lol-champ-select/v1/session` |
| **Usage** | Détecter Lobby, Champ Select, file d'attente |

### API Live Client Data (In-Game)
| Caractéristique | Valeur |
|-----------------|--------|
| **Port** | **2999** (⚠️ PAS 29990!) |
| **Auth** | Aucune |
| **Disponible** | Uniquement pendant une partie |
| **Endpoints clés** | `/liveclientdata/activeplayer`, `/liveclientdata/gamestats` |
| **Usage** | Récupérer CS, or, HP en temps réel |

**💡 Point clé** : Ces deux APIs sont complémentaires. Le LCU détecte les transitions de phase, et le Live Client fournit les données en jeu.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (JavaScript)                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Main Window     │  │  Overlay Window  │  │  GameWatcherSvc  │  │
│  │                  │  │                  │  │                  │  │
│  │ Écoute les       │  │ Affiche CS/min   │  │ Écoute events    │  │
│  │ événements Rust  │  │ comparé au bench │  │ game-state-changed│  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
└───────────┼────────────────────┼────────────────────┼────────────┘
            │                    │                    │
            │  Tauri Events      │                    │
            │  (game-state-changed)                   │
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Rust/Tauri)                         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     GameWatcher Struct                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │   │
│  │  │ Polling Loop │  │ WatcherState │  │ AppHandle (Emitter)  │ │   │
│  │  │              │  │              │  │                      │ │   │
│  │  │ Poll LCU     │  │ last_phase   │  │ Émet vers JS:        │ │   │
│  │  │ toutes les   │  │ last_conn    │  │ - game-state-changed │ │   │
│  │  │ 1000ms       │  │ in_live_game │  │ - cs-overlay-update  │ │   │
│  │  └──────┬───────┘  └──────────────┘  └──────────────────────┘ │   │
│  │         │                                                    │   │
│  │  ┌──────▼───────┐  ┌────────────────────────────────────────┐ │   │
│  │  │ Switch Mode  │  │  Phase InProgress détectée            │ │   │
│  │  │              │  │  → Bascule en mode InGame              │ │   │
│  │  │ LCU Mode     │  │  → Poll Live Client toutes les 500ms  │ │   │
│  │  │ InGame Mode  │  │  → Récupère CS, or, HP...             │ │   │
│  │  └──────────────┘  └────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                    HTTP Clients                                │   │
│  │  ┌─────────────────────┐      ┌───────────────────────────┐  │   │
│  │  │ create_lcu_client() │      │ create_ingame_client()    │  │   │
│  │  │                     │      │                           │  │   │
│  │  │ danger_accept_      │      │ danger_accept_            │  │   │
│  │  │ invalid_certs(true) │      │ invalid_certs(true)       │  │   │
│  │  │                     │      │                           │  │   │
│  │  │ Requiert Auth       │      │ Port 2999                 │  │   │
│  │  │ Basic (riot:pwd)    │      │ Pas d'auth                │  │   │
│  │  └─────────────────────┘      └───────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Fichiers Créés/Modifiés

### Backend Rust

| Fichier | Description |
|---------|-------------|
| `src-tauri/src/game_watcher.rs` | **NOUVEAU** - Module complet de surveillance d'état |
| `src-tauri/src/main.rs` | Modifié pour intégrer le GameWatcher |
| `src-tauri/src/lcu.rs` | Existant (pas de changement majeur) |
| `src-tauri/src/overlay.rs` | Corrigé (port 2999) |
| `src-tauri/Cargo.toml` | Ajout tokio features |

### Frontend JavaScript

| Fichier | Description |
|---------|-------------|
| `src/services/gameWatcherService.js` | **NOUVEAU** - Écoute events Tauri |
| `src/services/csOverlayService.js` | **NOUVEAU** - Intégration overlay |

---

## 🔄 Flux de Données

### 1. Démarrage Application

```rust
// main.rs
let game_watcher = GameWatcher::new();

.setup(move |app| {
    // Démarre le watcher auto
    tokio::spawn(async move {
        watcher.start(app_handle).await;
    });
})
```

### 2. Polling LCU (Mode Normal)

```rust
// Toutes les 1000ms
loop {
    1. find_lockfile() → Récupère port/password
    2. GET /lol-gameflow/v1/gameflow-phase
    3. Si changement → Émet event JS
}
```

### 3. Détection Partie (Transition)

```rust
// Phase passe à "InProgress"
if phase == GameflowPhase::InProgress {
    state.in_live_game = true;  // Bascule mode
    emit_event(GameState::InProgress { ... });
}
```

### 4. Polling In-Game (Mode Jeu)

```rust
// Toutes les 500ms
loop {
    1. GET /liveclientdata/activeplayer
    2. GET /liveclientdata/gamestats
    3. Calcule CS/min
    4. Émet event avec données
}
```

### 5. Fin de Partie

```rust
// Live Client API retourne erreur
if fetch_live_game_data().is_err() {
    state.in_live_game = false;
    // Retour au polling LCU
}
```

---

## 🛡️ Conformité Vanguard/ToS

### ✅ Ce qui est autorisé
- ✅ **HTTP Local uniquement** (127.0.0.1)
- ✅ **APIs officielles** documentées par Riot
- ✅ **Lecture seule** - aucune modification du jeu
- ✅ **Pas d'injection** - aucun code dans le processus
- ✅ **Pas d'automation** - aucun input clavier/souris

### ❌ Ce qui est interdit (et NON utilisé)
- ❌ Memory reading (ReadProcessMemory)
- ❌ DLL injection
- ❌ Hooking (Detours, etc.)
- ❌ SendInput / keybd_event
- ❌ Manipulation des fichiers du jeu

### 🔒 Sécurité Certificats

```rust
// NÉCESSAIRE pour les APIs locales
danger_accept_invalid_certs(true)
```

**Pourquoi c'est sécurisé :**
- Connexion strictement localhost
- Certificat généré par Riot pour l'instance locale
- Aucune donnée ne quitte la machine
- Le lockfile est lu depuis le filesystem

---

## 📡 Events Tauri

### `game-state-changed`

Émis à chaque changement de phase.

```typescript
// Payload TypeScript
interface GameStateChanged {
  type: 'ClientClosed' | 'None' | 'Lobby' | 'Matchmaking' | 
        'ChampSelect' | 'GameStart' | 'InProgress' | 'EndOfGame';
  
  // Si InProgress
  gameData?: {
    currentCs: number;
    csPerMinute: number;
    currentGold: number;
    gameTime: number;
    championName: string;
    level: number;
    currentHealth: number;
    maxHealth: number;
  };
  
  // Si ChampSelect
  championId?: number;
}
```

### Exemple d'utilisation Frontend

```javascript
import { startGameWatcher, on } from './services/gameWatcherService.js';

// Démarre le watcher
await startGameWatcher();

// Écoute les changements
on('stateChanged', (newState, oldState) => {
  console.log(`Transition: ${oldState.type} → ${newState.type}`);
});

// Détection spécifique
on('gameStarted', (state) => {
  showOverlay();
  console.log('CS actuels:', state.gameData?.currentCs);
});

on('champSelectStarted', () => {
  showBuildsPage();
});
```

---

## 🔌 Commandes Tauri Exposées

| Commande | Description |
|----------|-------------|
| `get_game_state` | Récupère l'état actuel |
| `start_game_watcher` | Démarre le watcher |
| `stop_game_watcher` | Arrête le watcher |
| `refresh_game_state` | Force un refresh + émet event |

---

## 🧪 Test de l'Architecture

### Test 1 : Démarrage Client
1. Lance FocusApp
2. Lance League Client
3. Vérifier console : `[GameWatcher] Phase changed: None → Lobby`

### Test 2 : Champ Select
1. Crée une partie personnalisée
2. Vérifier console : `[GameWatcher] Phase changed: Lobby → ChampSelect`

### Test 3 : Début de Partie
1. Lance la partie
2. Vérifier console : `[GameWatcher] Phase changed: ChampSelect → InProgress`
3. Overlay CS doit apparaître

### Test 4 : CS Live
1. En jeu, tuer des sbires
2. Vérifier console : CS mis à jour toutes les 500ms

### Test 5 : Fin de Partie
1. Quitte la partie
2. Vérifier console : Retour au mode LCU

---

## 🐛 Debugging

### Logs Rust
Les logs sont visibles dans la console si compilé en debug :
```bash
cargo tauri build --debug
```

### Logs Frontend
```javascript
// Active les logs détaillés
localStorage.setItem('debug', 'gameWatcher');
```

### Vérification manuelle API
```bash
# LCU (avec auth)
curl -k -u "riot:$PASSWORD" \
  "https://127.0.0.1:$PORT/lol-gameflow/v1/gameflow-phase"

# Live Client (pas d'auth)
curl -k "https://127.0.0.1:2999/liveclientdata/activeplayer"
```

---

## 🚀 Prochaines Améliorations

1. **WebSocket LCU** : Utiliser l'API WebSocket du LCU au lieu du polling
2. **Cache** : Cacher les données de champion pour réduire les appels
3. **Benchmarks** : Intégrer l'API benchmarks pour comparer CS en temps réel
4. **Replays** : Détecter les replays vs vraies parties

---

## 📚 Références

- [Riot Game Client API](https://developer.riotgames.com/docs/lol#game-client-api)
- [LCU API Docs communautaire](https://lcu.vivide.re/)
- [Tauri Events](https://tauri.app/v1/guides/features/events/)
