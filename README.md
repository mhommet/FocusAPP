# FocusApp Frontend - Tauri 2.0

League of Legends Companion Desktop App built with Tauri 2.0.

## Architecture

- **Frontend**: HTML/CSS/JavaScript (ES Modules)
- **Backend**: External Rust Axum API on `http://localhost:8000`
- **Desktop**: Tauri 2.0 for native Windows app

## Prerequisites

1. **Rust** (latest stable): https://rustup.rs/
2. **Node.js** (18+): https://nodejs.org/
3. **Backend API**: Rust Axum server running on port 8000

## Setup

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Build production MSI
npm run build
# Output: src-tauri/target/release/bundle/msi/FocusApp_1.0.0_x64_en-US.msi
```

## Project Structure

```
focusapp-frontend/
├── src/                          # Frontend assets
│   ├── index.html               # Main HTML page
│   ├── scripts/
│   │   ├── api.js               # HTTP client for Axum API
│   │   └── main.js              # Main application logic
│   ├── styles/
│   │   └── style.css            # Catppuccin theme
│   └── assets/
│       └── logo.ico
├── src-tauri/                    # Tauri backend
│   ├── src/
│   │   └── main.rs              # Minimal Tauri entry point
│   ├── Cargo.toml
│   ├── tauri.conf.json          # Tauri configuration
│   └── capabilities/
│       └── default.json         # HTTP permissions
└── package.json
```

## API Endpoints

All API calls go to `http://localhost:8000/api/v1/`:

| Endpoint | Description |
|----------|-------------|
| `GET /tierlist?role={role}` | Champion tier list (Diamond+) |
| `GET /build/{champion}/{role}` | Champion build data |
| `GET /items` | All items with gold efficiency |
| `GET /health` | Backend health check |

## Running the App

### Development

1. Start the backend API:
   ```bash
   cd focusapp-api
   cargo run --release
   ```

2. Start the frontend:
   ```bash
   cd focusapp-frontend
   npm run dev
   ```

### Production Build

```bash
npm run build
```

Output: `src-tauri/target/release/bundle/msi/FocusApp_1.0.0_x64_en-US.msi`

## Key Differences from EEL Version

| Aspect | Python EEL | Tauri 2.0 |
|--------|-----------|-----------|
| Communication | `eel.function()()` | HTTP `fetch()` |
| Backend | Python integrated | External Rust API |
| Permissions | Implicit | Explicit HTTP scope |
| Bundle size | ~150MB | ~10MB |
| Startup time | 2-3s | <1s |

## Configuration

### HTTP Scope (tauri.conf.json)

```json
{
  "plugins": {
    "http": {
      "scope": {
        "allow": [
          { "url": "http://localhost:8000/**" },
          { "url": "https://ddragon.leagueoflegends.com/**" },
          { "url": "https://raw.communitydragon.org/**" }
        ]
      }
    }
  }
}
```

### CSP (Content Security Policy)

The app is configured with strict CSP allowing only:
- Self-hosted scripts and styles
- Images from DDragon and CommunityDragon
- API connections to localhost:8000

## Troubleshooting

### "Backend API is not running"

Ensure the Rust Axum server is running:
```bash
cd focusapp-api
cargo run --release
```

### Build fails

1. Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. Install Visual Studio Build Tools (Windows)
3. Restart terminal and retry

## License

MIT
