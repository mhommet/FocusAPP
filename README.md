***

# FocusApp Ecosystem - League of Legends Companion Suite

> A complete data-driven League of Legends companion ecosystem consisting of a **promotional website**, **native desktop application**, and **high-performance API**.

***

## 🌐 Three Components, One Ecosystem

### 🎨 Website (Marketing)
**Landing page showcasing FocusApp features and download links.**

- **Repository**: [FocusWebsite](https://github.com/mhommet/FocusWebsite)
- **Technology**: HTML, CSS, JavaScript (static site)
- **Deployment**: GitHub Pages or Vercel
- **Purpose**: Product showcase, downloads, documentation
- **URL**: [focus.hommet.ch](https://focus.hommet.ch)

### 🖥️ Desktop App (Tauri)
**Native Windows application for real-time champion builds and tier lists.**

- **Repository**: [FocusAPP](https://github.com/mhommet/FocusAPP)
- **Technology**: Tauri 2.0 (Rust + Web UI)
- **Size**: ~10MB installer
- **Performance**: <1s startup, ~30MB RAM
- **Features**: Offline caching, auto-updates, system tray

### ⚙️ Backend API (Rust/Axum)
**High-performance REST API powering the desktop app.**

- **Technology**: Rust, Axum, PostgreSQL
- **Performance**: ~10x faster than Python FastAPI
- **Scale**: Handles 50,000+ requests/hour
- **Documentation**: Interactive Swagger UI at `/docs`

***

## ✨ Features

### 🏆 Diamond+ Meta Tier Lists
- **Real-time Rankings**: Champions ranked by role with live stats
- **Win/Pick/Ban Rates**: Comprehensive performance metrics
- **Tier Assignment**: S+, S, A, B, C tiers based on statistical analysis
- **Role Filtering**: Top, Jungle, Mid, ADC, Support

### 📊 Optimized Champion Builds
- **Runes**: Primary/secondary trees with win rates per selection
- **Stat Shards**: Optimal offense, flex, and defense shards
- **Items**: Core build paths, boots, starting items with purchase rates
- **Skill Priority**: Data-driven skill max order (Q/W/E)
- **Summoner Spells**: Most successful spell combinations
- **Reliability Indicators**: Visual badges showing sample size confidence

### 💎 Items Database
- **Gold Efficiency**: Real-time calculations for all items
- **Stats Breakdown**: AD, AP, Armor, MR, Health, AS, CDR, etc.
- **Build Paths**: Component breakdowns and upgrade trees
- **Advanced Filtering**: Search by name, tag, or minimum efficiency

### 🔄 Smart Data Pipeline
- **Continuous Collection**: Background workers fetch Diamond+ matches 24/7
- **Intelligent Caching**: Color-coded indicators for data freshness
- **Rate Limiting**: Respects Riot API quotas automatically
- **Auto-Updates**: Builds refresh every 6 hours

***

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Interfaces                               │
├──────────────────────────┬──────────────────────────────────────┤
│   🎨 Website (Marketing) │   🖥️ Desktop App (Tauri)             │
│   • Static HTML/CSS/JS   │   • Native Windows UI                 │
│   • Product showcase     │   • Offline support                   │
│   • Download links       │   • Auto-updates                      │
│   • Documentation        │   • System tray integration           │
└────────┬─────────────────┴──────────────┬───────────────────────┘
         │                                │
         │        HTTP REST API           │
         │                                │
┌────────▼────────────────────────────────▼───────────────────────┐
│              ⚙️ Backend API (Rust/Axum)                         │
│  High-performance async web server                              │
│  • RESTful endpoints                                            │
│  • Swagger UI documentation                                     │
│  • CORS & rate limiting                                         │
│  • Request caching (in-memory)                                  │
│  • Health monitoring                                            │
└──────────────┬──────────────────────────────────────────────────┘
               │ SQL + Background Jobs
┌──────────────▼──────────────────────────────────────────────────┐
│          💾 PostgreSQL Database                                 │
│  Persistent storage for game data                               │
│  • game_records: 50,000+ Diamond+ matches/patch                 │
│  • builds: Pre-aggregated champion builds                       │
│  • tierlist: Calculated tier rankings                           │
│  • items: Static data with gold efficiency                      │
└──────────────┬──────────────────────────────────────────────────┘
               │ Background Workers (Tokio)
┌──────────────▼──────────────────────────────────────────────────┐
│        🔄 Data Collection Workers                               │
│  • Build Worker: Collects matches + generates builds            │
│  • Tierlist Worker: Calculates champion rankings                │
│  • Item Worker: Syncs with Data Dragon                          │
│  • Match Worker: Fetches Diamond+ games via Riot API            │
└──────────────┬──────────────────────────────────────────────────┘
               │ External APIs
┌──────────────▼──────────────────────────────────────────────────┐
│        🎮 Riot Games APIs                                       │
│  • Match-v5: Game records (Diamond+ ranked)                     │
│  • Summoner-v4: Player lookups                                  │
│  • League-v4: Rank data                                         │
│  • DDragon: Static data (champions, items, runes)               │
│  • CommunityDragon: High-res assets                             │
└─────────────────────────────────────────────────────────────────┘
```

***

## 📊 Component Comparison

| Feature | Marketing Website | Desktop App | Backend API |
|---------|------------------|-------------|-------------|
| **Purpose** | Promotion & docs | Full app | Data source |
| **Access** | Any browser | Windows only | Programmatic |
| **Auto-Updates** | N/A | ✅ Built-in | Manual deploy |
| **Performance** | 🌐 Static | ⚡ Native | 🚀 Rust optimized |
| **Installation** | None | Required (.exe) | Server only |
| **Mobile Support** | ✅ Responsive | ❌ No | N/A |
| **Best For** | Discovery | Daily players | Developers |

***

## 🎨 Website (FocusWebsite)

### Purpose
**Landing page** pour présenter FocusApp, fournir les téléchargements et expliquer les fonctionnalités. [mobiskill](https://www.mobiskill.fr/blog-posts/application-web-vs-site-web-quelles-differences)

### Technology Stack
- **HTML/CSS/JavaScript**: Site statique (pas de framework)
- **Deployment**: GitHub Pages, Vercel, ou Netlify
- **Design**: Thème Catppuccin Mocha

### Sections Principales
- **Hero**: Tagline + bouton téléchargement
- **Features**: Tier lists, builds, base de données items
- **Screenshots**: Captures d'écran de l'interface
- **Download**: Lien vers l'installateur Windows
- **About**: Contexte du projet et technologies
- **Footer**: Liens GitHub, Discord, documentation

***

## 🖥️ Desktop App (Tauri 2.0)

### Technology Stack
- **Framework**: Tauri 2.0 (Rust backend + Web UI)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **State Management**: Local storage + API cache
- **Theme**: Catppuccin Mocha avec glassmorphism

### Key Features
- **Lightweight**: 10MB installer vs 150MB (Python/Eel)
- **Fast Startup**: <1 seconde de lancement
- **Low Memory**: ~30MB RAM
- **System Tray**: Réduction dans la barre système
- **Auto-Updates**: Mises à jour automatiques
- **Offline Support**: Builds en cache fonctionnent hors ligne

***

## ⚙️ Backend API (Rust/Axum)

### Technology Stack
- **Language**: Rust 1.75+
- **Web Framework**: Axum (Tokio async runtime)
- **Database**: PostgreSQL 15+ avec SQLx
- **Caching**: Cache LRU en mémoire
- **Documentation**: Utoipa (Swagger/OpenAPI)

### Performance Benchmarks

| Métrique | Python FastAPI | Rust Axum | Amélioration |
|----------|---------------|-----------|--------------|
| **Requêtes/sec** | ~500 | ~5,000 | 10x plus rapide |
| **Latence moy.** | ~50ms | ~5ms | 10x plus faible |
| **Mémoire** | ~200MB | ~50MB | 4x moins |
| **CPU** | ~40% | ~8% | 5x moins |

***

## 📄 License

MIT License - voir [LICENSE](LICENSE)

***

## ⚠️ Disclaimer

FocusApp n'est pas approuvé par Riot Games. Riot Games et toutes les propriétés associées sont des marques déposées de Riot Games, Inc.

***

**Made with ❤️ by [Milan Hommet](https://github.com/mhommet)**
