***

# FocusApp - League of Legends Companion

> A modern desktop application for viewing champion builds, tier lists, and item data for League of Legends.

## ✨ Features

- **🏆 Live Tier List** - Diamond+ champion rankings with winrates and pickrates
- **📊 Champion Builds** - Optimized runes, items, skill orders, and summoner spells
- **💎 Items Database** - Browse all items with stats and gold efficiency
- **🎨 Modern UI** - Clean Catppuccin Mocha theme with glassmorphism effects
- **⚡ Fast & Lightweight** - Built with Tauri 2.0 (~10MB bundle, <1s startup)
- **🔄 Smart Caching** - Color-coded cache indicators for data freshness
- **📈 Data Quality** - Build reliability indicators based on sample size

## 🖼️ Screenshots




## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│         Desktop App (Tauri 2.0)             │
│  HTML/CSS/JavaScript + Rust Backend         │
└──────────────────┬──────────────────────────┘
                   │ HTTP
┌──────────────────▼──────────────────────────┐
│      Backend API (Rust Axum)                │
│  Diamond+ Data Aggregation + Cache          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   PostgreSQL Database                       │
│   Game Records + Builds + Tier Lists        │
└─────────────────────────────────────────────┘
```

## 📦 Installation

### Prerequisites

- **Node.js** 18+ - [https://nodejs.org/](https://nodejs.org/)
- **Rust** (latest stable) - [https://rustup.rs/](https://rustup.rs/)
- **PostgreSQL** 14+ (for backend API)
- **Visual Studio Build Tools** (Windows only)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/mhommet/FocusAPP.git
cd FocusAPP

# 2. Setup Backend API (in a separate terminal)
cd focusapp-api
cargo build --release
cargo run --release
# API runs on http://localhost:8000

# 3. Setup Frontend (in another terminal)
cd ../focusapp-frontend
npm install
npm run dev
```

### Production Build

```bash
# Build Windows installer (.msi)
cd focusapp-frontend
npm run build

# Output: src-tauri/target/release/bundle/msi/FocusApp_1.0.0_x64_en-US.msi
```

## 🚀 Usage

1. **Launch the application** - Double-click `FocusApp.exe` or run `npm run dev`
2. **Browse Tier List** - View Diamond+ champion rankings by role
3. **Search Champions** - Filter by role or search by name
4. **View Builds** - Select a champion and role to see optimal builds with reliability indicators
5. **Explore Items** - Browse items with gold efficiency calculations
6. **Refresh Data** - Click refresh to get the latest statistics from the API

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Desktop** | Tauri 2.0 (Rust + Webview) |
| **Frontend** | Vanilla JS (ES Modules), HTML5, CSS3 |
| **Backend API** | Rust (Axum framework) |
| **Database** | PostgreSQL 14+ |
| **Data Source** | Riot Games API (Diamond+ aggregated) |
| **Assets** | DDragon, CommunityDragon |
| **Theme** | [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) |

## 📁 Project Structure

```
FocusAPP/
├── focusapp-frontend/           # Tauri Desktop App
│   ├── src/
│   │   ├── index.html          # Main HTML page
│   │   ├── scripts/
│   │   │   ├── api.js          # HTTP client
│   │   │   ├── main.js         # App logic
│   │   │   └── runesService.js # Runes handling
│   │   └── styles/
│   │       └── style.css       # Catppuccin theme
│   ├── src-tauri/
│   │   ├── src/main.rs         # Tauri entry point
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json     # App configuration
│   └── package.json
│
├── focusapp-api/                # Rust Backend API
│   ├── src/
│   │   ├── main.rs             # Axum server
│   │   ├── routes/             # API endpoints
│   │   ├── models/             # Database models
│   │   ├── workers/            # Background workers
│   │   └── migrations/         # DB migrations
│   └── Cargo.toml
│
└── README.md
```

## 🔌 API Reference

The application uses a custom Rust API that aggregates Diamond+ data:

### Endpoints

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /api/v1/tierlist?role={role}` | Fetch tier list by role | `?role=top` |
| `GET /api/v1/build/{champion}/{role}` | Fetch build data | `/jinx/adc` |
| `GET /api/v1/items` | Get all items with gold efficiency | - |
| `GET /api/v1/health` | Backend health check | - |
| `GET /api/v1/status` | Worker status & database stats | - |

### Example Response (Build)

```json
{
  "champion": "Jinx",
  "role": "adc",
  "build": {
    "runes": [
      {
        "name": "Precision",
        "path": 8000,
        "keystones": [{"id": 8005, "name": "Press the Attack", "winrate": 0.54}],
        "runes": [{"id": 9111, "name": "Triumph"}, ...]
      },
      {
        "name": "Inspiration",
        "path": 8300,
        "runes": [{"id": 8321, "name": "Future's Market"}, ...]
      }
    ],
    "stat_shards": [
      {"id": 5005, "name": "Attack Speed"},
      {"id": 5008, "name": "Adaptive Force"},
      {"id": 5002, "name": "Armor"}
    ],
    "items": {
      "core": [3031, 3094, 3087],
      "boots": 3006,
      "starting": [1055, 2003]
    },
    "skill_priority": [{"order": ["Q", "W", "E"], "winrate": 0.53}]
  },
  "total_games_analyzed": 1547,
  "weighted_winrate": 0.525,
  "data_quality": {
    "quality_level": "HIGH",
    "confidence": 0.95,
    "games_analyzed": 1547
  }
}
```

## ⚙️ Configuration

### Tauri HTTP Permissions (`src-tauri/capabilities/default.json`)

```json
{
  "permissions": [
    {
      "identifier": "http:default",
      "allow": [
        {"url": "http://localhost:8000/**"},
        {"url": "https://ddragon.leagueoflegends.com/**"},
        {"url": "https://raw.communitydragon.org/**"}
      ]
    }
  ]
}
```

### Backend API Configuration (`.env`)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/focusapp
RIOT_API_KEY=your_riot_api_key_here
RUST_LOG=info
PORT=8000
```

## 🔄 Key Differences: Python EEL → Tauri 2.0

| Aspect | Python EEL (Old) | Tauri 2.0 (New) |
|--------|------------------|-----------------|
| Communication | `eel.function()()` | HTTP `fetch()` |
| Backend | Python integrated | External Rust API |
| Permissions | Implicit | Explicit HTTP scope |
| Bundle size | ~150MB | ~10MB |
| Startup time | 2-3s | <1s |
| Memory usage | ~100MB | ~30MB |
| Auto-update | ❌ | ✅ (built-in) |

## 🐛 Troubleshooting

### "Backend API is not running"

Ensure the Rust API server is running:
```bash
cd focusapp-api
cargo run --release
```

### Build fails on Windows

1. Install **Visual Studio Build Tools**: [https://visualstudio.microsoft.com/downloads/](https://visualstudio.microsoft.com/downloads/)
2. Select "Desktop development with C++"
3. Restart terminal and retry

### Database connection errors

```bash
# Check PostgreSQL is running
psql -U postgres

# Create database
createdb focusapp

# Run migrations
cd focusapp-api
sqlx migrate run
```

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. Code follows **Rust** conventions (`cargo fmt`, `cargo clippy`)
2. Frontend follows **JavaScript Standard Style**
3. All functions have docstrings/JSDoc comments
4. Comments are in English
5. No `console.log` or debug prints in production code

### Development Setup

```bash
# Rust formatting & linting
cargo fmt
cargo clippy

# JavaScript linting (if using ESLint)
npm run lint
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Backend**: Rust, Axum, SQLx, Tokio
- **Frontend**: Tauri 2.0, Vanilla JavaScript
- **Data Source**: Riot Games API (Diamond+ aggregated statistics)
- **Assets**: Riot Games DDragon and CommunityDragon
- **Icons**: Font Awesome
- **Theme**: [Catppuccin Mocha](https://github.com/catppuccin/catppuccin)

## ⚠️ Disclaimer

FocusApp isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

***

**Made with ❤️ by [Milan Hommet](https://github.com/mhommet)**

***
