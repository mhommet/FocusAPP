***

# FocusApp Ecosystem - League of Legends Companion Suite

> A complete data-driven League of Legends companion ecosystem consisting of a web platform, high-performance API, and native desktop application.

***

## 🌐 Three Platforms, One Ecosystem

### 🖥️ Desktop App (Tauri)
**Native Windows application** for real-time champion builds and tier lists.

- **Technology**: Tauri 2.0 (Rust + Web UI)
- **Size**: ~10MB installer
- **Performance**: <1s startup, ~30MB RAM
- **Features**: Offline caching, auto-updates, native notifications

### 🌍 Web Platform (Next.js)
**Responsive web application** accessible from any browser.

- **Technology**: Next.js 14, TypeScript, TailwindCSS
- **Deployment**: Vercel Edge Network
- **Features**: SSR/SSG, SEO optimized, mobile-first design
- **URL**: [focusapp.gg](https://focusapp.gg) *(example)*

### ⚙️ Backend API (Rust/Axum)
**High-performance REST API** powering both platforms.

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
├─────────────────────────────┬───────────────────────────────────┤
│   🖥️ Desktop App (Tauri)    │   🌍 Web App (Next.js)            │
│   • Windows native UI        │   • Responsive design             │
│   • Offline support          │   • SEO optimized                 │
│   • Auto-updates             │   • Server-side rendering         │
│   • System tray integration  │   • Global CDN (Vercel)           │
└──────────────┬───────────────┴───────────────┬───────────────────┘
               │        HTTP REST API          │
               │                               │
┌──────────────▼───────────────────────────────▼───────────────────┐
│              ⚙️ Backend API (Rust/Axum)                          │
│  High-performance async web server                               │
│  • RESTful endpoints                                             │
│  • Swagger UI documentation                                      │
│  • CORS & rate limiting                                          │
│  • Request caching (in-memory)                                   │
│  • Health monitoring                                             │
└──────────────┬───────────────────────────────────────────────────┘
               │ SQL + Background Jobs
┌──────────────▼───────────────────────────────────────────────────┐
│          💾 PostgreSQL Database                                  │
│  Persistent storage for game data                                │
│  • game_records: 50,000+ Diamond+ matches/patch                  │
│  • builds: Pre-aggregated champion builds                        │
│  • tierlist: Calculated tier rankings                            │
│  • items: Static data with gold efficiency                       │
└──────────────┬───────────────────────────────────────────────────┘
               │ Background Workers (Tokio)
┌──────────────▼───────────────────────────────────────────────────┐
│        🔄 Data Collection Workers                                │
│  • Build Worker: Collects matches + generates builds             │
│  • Tierlist Worker: Calculates champion rankings                 │
│  • Item Worker: Syncs with Data Dragon                           │
│  • Match Worker: Fetches Diamond+ games via Riot API             │
└──────────────┬───────────────────────────────────────────────────┘
               │ External APIs
┌──────────────▼───────────────────────────────────────────────────┐
│        🎮 Riot Games APIs                                        │
│  • Match-v5: Game records (Diamond+ ranked)                      │
│  • Summoner-v4: Player lookups                                   │
│  • League-v4: Rank data                                          │
│  • DDragon: Static data (champions, items, runes)                │
│  • CommunityDragon: High-res assets                              │
└──────────────────────────────────────────────────────────────────┘
```

***

## 📊 Platform Comparison

| Feature | Desktop App | Web Platform | Backend API |
|---------|-------------|--------------|-------------|
| **Access** | Windows only | Any browser | Programmatic |
| **Offline Mode** | ✅ Yes | ❌ No | N/A |
| **Auto-Updates** | ✅ Built-in | ✅ Automatic | Manual deploy |
| **Performance** | ⚡ Native | 🌐 Network-dependent | 🚀 Rust optimized |
| **Installation** | Required | None | Server only |
| **Mobile Support** | ❌ No | ✅ Yes | N/A |
| **SEO** | N/A | ✅ Optimized | N/A |
| **Best For** | Daily players | Casual browsing | Developers |

***

## 🖥️ Desktop App (Tauri 2.0)

### Technology Stack
- **Framework**: Tauri 2.0 (Rust backend + Web UI)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **State Management**: Local storage + API cache
- **Theme**: Catppuccin Mocha with glassmorphism

### Key Features
- **Lightweight**: 10MB installer vs 150MB (Python/Eel)
- **Fast Startup**: <1 second launch time
- **Low Memory**: ~30MB RAM usage
- **System Tray**: Minimize to tray with quick access
- **Auto-Updates**: Seamless updates without reinstallation
- **Offline Support**: Cached builds work without internet

### File Structure
```
focusapp-frontend/
├── src/
│   ├── index.html              # Main UI
│   ├── scripts/
│   │   ├── api.js              # HTTP client
│   │   ├── main.js             # App logic
│   │   └── runesService.js     # Rune handling
│   └── styles/
│       └── style.css           # Catppuccin theme
└── src-tauri/
    ├── src/main.rs             # Tauri entry point
    ├── tauri.conf.json         # App configuration
    └── capabilities/
        └── default.json        # HTTP permissions
```

***

## 🌍 Web Platform (Next.js)

### Technology Stack
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS + shadcn/ui
- **Deployment**: Vercel Edge Network
- **Analytics**: Vercel Analytics + Web Vitals

### Key Features
- **SSR/SSG**: Server-side rendering for SEO and performance
- **Edge Functions**: Lightning-fast API routes on Vercel Edge
- **Responsive Design**: Mobile-first, tablet, and desktop layouts
- **SEO Optimized**: Meta tags, Open Graph, structured data
- **Image Optimization**: Next.js Image with CDN caching
- **Dark Mode**: System preference detection + manual toggle

### File Structure
```
focusapp-web/
├── app/
│   ├── (routes)/
│   │   ├── page.tsx            # Home page
│   │   ├── tierlist/           # Tier list page
│   │   ├── champions/          # Champion list
│   │   └── build/[champion]/[role]/ # Build detail page
│   ├── api/                    # API routes (proxy)
│   └── layout.tsx              # Root layout
├── components/
│   ├── ui/                     # shadcn components
│   ├── TierList.tsx            # Tier list component
│   ├── BuildView.tsx           # Build display
│   └── ItemCard.tsx            # Item card
├── lib/
│   ├── api.ts                  # API client
│   └── utils.ts                # Helpers
└── public/
    └── assets/                 # Static assets
```

### SEO Features
- Dynamic meta tags per champion/role
- JSON-LD structured data for builds
- Automatic sitemap generation
- Optimized Core Web Vitals (LCP < 2.5s)

***

## ⚙️ Backend API (Rust/Axum)

### Technology Stack
- **Language**: Rust 1.75+
- **Web Framework**: Axum (Tokio async runtime)
- **Database**: PostgreSQL 15+ with SQLx
- **Caching**: In-memory LRU cache
- **Documentation**: Utoipa (Swagger/OpenAPI)

### Key Features
- **High Performance**: ~10x faster than Python FastAPI
- **Type Safety**: Compile-time guarantees with Rust
- **Async I/O**: Tokio for efficient concurrency
- **Rate Limiting**: Automatic Riot API quota management
- **Health Monitoring**: `/health/workers` endpoint for status
- **Swagger UI**: Interactive docs at `/docs`

### File Structure
```
focusapp-api/
├── src/
│   ├── main.rs                 # Entry point + server setup
│   ├── config.rs               # Environment configuration
│   ├── error.rs                # Error types
│   ├── models/                 # Data structures
│   │   ├── build.rs            # Build aggregation models
│   │   ├── champion.rs         # Champion data
│   │   ├── item.rs             # Item + gold efficiency
│   │   ├── riot.rs             # Riot API responses
│   │   └── tierlist.rs         # Tier list models
│   ├── routes/                 # HTTP handlers
│   │   ├── builds.rs           # /api/v1/build/*
│   │   ├── tierlist.rs         # /api/v1/tierlist
│   │   ├── items.rs            # /api/v1/items
│   │   ├── champions.rs        # /api/v1/champions
│   │   ├── stats.rs            # /api/v1/stats/*
│   │   └── health.rs           # /health
│   ├── services/               # Business logic
│   │   ├── riot_api.rs         # Riot API client
│   │   ├── data_dragon.rs      # DDragon client
│   │   └── analyzer.rs         # Build aggregation
│   ├── scheduler/              # Background workers
│   │   ├── build_worker.rs     # Build collection
│   │   └── tierlist_worker.rs  # Tier list generation
│   └── db/                     # Database layer
│       ├── mod.rs              # Connection pool
│       └── repository.rs       # CRUD operations
└── Cargo.toml
```

### API Endpoints

#### Health & Monitoring
```
GET  /                          # API info
GET  /health                    # Health check
GET  /health/workers            # Worker status + DB stats
GET  /docs                      # Swagger UI
```

#### Builds
```
GET  /api/v1/build/{champion}/{role}        # Get optimal build
GET  /api/v1/builds/{champion}              # All builds for champion
GET  /api/v1/builds/{champion}/{role}       # Alias
```

#### Tier Lists
```
GET  /api/v1/tierlist                       # Grouped by tier
GET  /api/v1/tierlist/flat                  # Flat array
Query params: ?role=mid
```

#### Items
```
GET  /api/v1/items                          # All items
GET  /api/v1/items/{item_id}                # Specific item
GET  /api/v1/items/version                  # Data Dragon version
Query params: ?tag=Damage&min_efficiency=100
```

#### Champions
```
GET  /api/v1/champions                      # List all champions
```

#### Statistics
```
GET  /api/v1/stats/worker                   # Worker status
GET  /api/v1/stats/cache                    # Cache stats
GET  /api/v1/stats/quality/{champion}/{role} # Data quality
```

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
        "runes": [{"id": 9111, "name": "Triumph", "count": 150, "winrate": 0.53}]
      }
    ],
    "stat_shards": [
      {"id": 5005, "name": "Attack Speed", "row": "offense"},
      {"id": 5008, "name": "Adaptive Force", "row": "flex"},
      {"id": 5002, "name": "Armor", "row": "defense"}
    ],
    "items": {
      "first": [{"id": 3031, "name": "Infinity Edge", "count": 120, "winrate": 0.55}],
      "boots": {"id": 3006, "name": "Berserker's Greaves", "count": 145}
    },
    "skill_priority": [{"order": ["Q", "W", "E"], "count": 150, "winrate": 0.54}],
    "summoner_spells": [{"spell": "Flash", "count": 150}, {"spell": "Heal", "count": 150}]
  },
  "total_games_analyzed": 1547,
  "weighted_winrate": 0.525,
  "data_quality": {
    "quality_level": "HIGH",
    "confidence": 0.95,
    "games_analyzed": 1547,
    "sample_adequacy": 1547
  },
  "cached": true,
  "cache_age_hours": 2.3
}
```

### Performance Benchmarks

| Metric | Python FastAPI | Rust Axum | Improvement |
|--------|---------------|-----------|-------------|
| **Requests/sec** | ~500 | ~5,000 | 10x faster |
| **Avg Latency** | ~50ms | ~5ms | 10x lower |
| **Memory Usage** | ~200MB | ~50MB | 4x less |
| **CPU Usage** | ~40% | ~8% | 5x less |
| **Cold Start** | ~2s | ~100ms | 20x faster |

***

## 🔄 Data Pipeline

### 1. Match Collection
```
Background Worker (Rust)
  ↓
Fetch Diamond+ ranked games from Riot API
  ↓
Parse: champion, role, runes, items, skills, win/loss
  ↓
Store in PostgreSQL (game_records table)
```

### 2. Build Aggregation
```
Build Worker (every 6 hours)
  ↓
Group games by champion + role
  ↓
Calculate:
  • Most popular runes with win rates
  • Core item builds with purchase frequency
  • Skill max order with success rates
  • Summoner spell combos with win rates
  ↓
Store in PostgreSQL (builds table)
```

### 3. Tier List Generation
```
Tierlist Worker (every 1 hour)
  ↓
Aggregate all champions by role
  ↓
Calculate:
  • Win rate (weighted)
  • Pick rate
  • Ban rate
  ↓
Assign tiers: S+, S, A, B, C
  ↓
Store in PostgreSQL (tierlist table)
```

### 4. Client Access
```
Desktop App / Web App
  ↓
HTTP GET /api/v1/build/akali/mid
  ↓
API checks cache (in-memory)
  ↓
If expired: Query PostgreSQL
  ↓
Return JSON with:
  • Build data
  • Data quality metrics
  • Cache age indicator
```

***

## 🎯 Use Cases

### For Players
- **Desktop App**: Daily use before ranked games
- **Web App**: Quick lookups on mobile between games
- **API**: Build custom overlays or Discord bots

### For Analysts
- **Tier Lists**: Track meta shifts across patches
- **Build Evolution**: Analyze how item choices change over time
- **Data Quality**: Access confidence metrics for statistical reliability

### For Developers
- **API Integration**: Embed builds into third-party apps
- **Custom Tools**: Build meta trackers or prediction models
- **Research**: Access raw aggregated data for analysis

***

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

***

## 🙏 Acknowledgments

- **Backend**: [Axum](https://github.com/tokio-rs/axum), [SQLx](https://github.com/launchbadge/sqlx), [Tokio](https://tokio.rs/)
- **Desktop**: [Tauri](https://tauri.app/)
- **Web**: [Next.js](https://nextjs.org/), [Vercel](https://vercel.com/)
- **Data**: [Riot Games API](https://developer.riotgames.com/)
- **Assets**: [DDragon](https://ddragon.leagueoflegends.com/), [CommunityDragon](https://www.communitydragon.org/)
- **Theme**: [Catppuccin](https://github.com/catppuccin/catppuccin)

***

## ⚠️ Disclaimer

FocusApp isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

***

**Made with ❤️ by [Milan Hommet](https://github.com/mhommet)**

*Empowering League players with data-driven insights across all platforms*

***