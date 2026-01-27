/**
 * FocusApp - API Client for Rust Axum Backend
 * ============================================
 *
 * Centralized HTTP client for communicating with the external
 * Rust Axum API running on api.hommet.ch.
 *
 * Uses Tauri HTTP plugin for HTTP requests.
 *
 * @author Milan Hommet
 * @license MIT
 */

// Use Tauri's global HTTP plugin API
const { fetch } = window.__TAURI__.http;

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL = "https://api.hommet.ch/api/v1";
const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";
const DEFAULT_TIMEOUT = 30; // seconds
const RETRY_COUNT = 3;

// API Key for authenticated endpoints
const API_KEY = "focusapp_prod_2026_x7k9p2m4q8v1n5r3";

// Cache for DDragon version
let cachedDDragonVersion = "14.10.1";

// =============================================================================
// GENERIC API WRAPPER
// =============================================================================

/**
 * Generic API call wrapper with retry logic and error handling.
 *
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Fetch options
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} On API error after all retries
 */
async function apiCall(endpoint, options = {}, retries = RETRY_COUNT) {
  const url = `${API_BASE_URL}${endpoint}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        timeout: { secs: options.timeout || DEFAULT_TIMEOUT, nanos: 0 },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Key": API_KEY,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new Error("API Key invalid - check configuration");
        }
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.warn(
        `[API] Attempt ${attempt + 1}/${retries} failed for ${endpoint}:`,
        error.message,
      );

      if (attempt === retries - 1) {
        console.error(
          `[API] Failed ${endpoint} after ${retries} attempts:`,
          error,
        );
        throw error;
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Fetch data from DDragon API.
 *
 * @param {string} endpoint - DDragon endpoint
 * @returns {Promise<Object>} Parsed JSON response
 */
async function ddragonCall(endpoint) {
  const url = `${DDRAGON_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      timeout: { secs: 10, nanos: 0 },
    });

    if (!response.ok) {
      throw new Error(`DDragon Error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[DDragon] Failed to fetch ${endpoint}:`, error);
    throw error;
  }
}

// =============================================================================
// DDRAGON UTILITIES
// =============================================================================

/**
 * Get the current DDragon (patch) version.
 * Fetches from DDragon API and caches the result.
 *
 * @returns {Promise<string>} DDragon version string
 */
export async function getDDragonVersion() {
  try {
    const versions = await ddragonCall("/api/versions.json");
    if (versions && versions.length > 0) {
      cachedDDragonVersion = versions[0];
    }
    return cachedDDragonVersion;
  } catch (error) {
    console.warn("[DDragon] Using cached version:", cachedDDragonVersion);
    return cachedDDragonVersion;
  }
}

/**
 * Get champion list from DDragon.
 *
 * @returns {Promise<Array>} List of champion objects
 */
export async function getChampionList() {
  try {
    const version = await getDDragonVersion();
    const data = await ddragonCall(`/cdn/${version}/data/en_US/champion.json`);

    const champions = Object.values(data.data).map((champ) => ({
      id: champ.id,
      key: champ.key,
      name: champ.name,
      image: `${DDRAGON_BASE_URL}/cdn/${version}/img/champion/${champ.image.full}`,
    }));

    // Sort alphabetically
    champions.sort((a, b) => a.name.localeCompare(b.name));

    return champions;
  } catch (error) {
    console.error("[DDragon] Failed to fetch champion list:", error);
    return [];
  }
}

// =============================================================================
// TIERLIST API
// =============================================================================

/**
 * Fetch tier list from API.
 * The API aggregates Diamond+ data (Diamond, Master, Grandmaster, Challenger).
 *
 * @param {string|null} role - Optional role filter ('top', 'jungle', 'mid', 'adc', 'support')
 * @returns {Promise<Object>} Tier list data
 */
export async function getTierlist(role = null) {
  const params = role ? `?role=${role.toLowerCase()}` : "";

  try {
    const data = await apiCall(`/tierlist${params}`);
    return formatTierlistResponse(data, role);
  } catch (error) {
    console.error("[API] Tierlist error:", error);
    return {
      success: false,
      error: error.message,
      tier_list: { S: [], A: [], B: [], C: [], D: [] },
      counts: { S: 0, A: 0, B: 0, C: 0, D: 0 },
      total_champions: 0,
      last_update: null,
      champions: [],
    };
  }
}

/**
 * Format tier list response for frontend display.
 *
 * @param {Object} data - Raw API response
 * @param {string|null} filteredRole - Applied role filter
 * @returns {Object} Formatted tier list
 */
function formatTierlistResponse(data, filteredRole = null) {
  const tierList = data.tier_list || {};
  const formattedTiers = {};
  const flatList = [];
  let rankCounter = 1;

  for (const tier of ["S", "A", "B", "C", "D"]) {
    const tierChampions = tierList[tier] || [];
    formattedTiers[tier] = [];

    for (const champ of tierChampions) {
      const championName = champ.champion || "Unknown";
      const roles = champ.roles || [];

      // Format winrate and pickrate
      const winrate = champ.winrate;
      const winrateStr =
        winrate !== null && winrate !== undefined
          ? `${winrate.toFixed(1)}%`
          : "-";

      const pickrate = champ.pickrate;
      const pickrateStr =
        pickrate !== null && pickrate !== undefined
          ? `${pickrate.toFixed(1)}%`
          : "-";

      // Determine display role
      let displayRole;
      if (filteredRole) {
        displayRole =
          filteredRole.charAt(0).toUpperCase() + filteredRole.slice(1);
      } else if (champ.role) {
        displayRole = champ.role.charAt(0).toUpperCase() + champ.role.slice(1);
      } else if (roles.length > 0) {
        displayRole = roles
          .map((r) => r.charAt(0).toUpperCase() + r.slice(1))
          .join(", ");
      } else {
        displayRole = "Flex";
      }

      const formattedEntry = {
        champion: championName,
        name: championName.charAt(0).toUpperCase() + championName.slice(1),
        tier: tier,
        winrate: winrate,
        winrate_str: winrateStr,
        pickrate: pickrate,
        pickrate_str: pickrateStr,
        games_analyzed: champ.games_analyzed || 0,
        roles: roles,
        roles_str: displayRole,
        performance_score: champ.performance_score || 0,
        image: `${DDRAGON_BASE_URL}/cdn/${cachedDDragonVersion}/img/champion/${championName}.png`,
      };

      formattedTiers[tier].push(formattedEntry);

      // Add to flat list for table display
      // Store raw numeric values - formatWinrate/formatPickrate in main.js will format them
      flatList.push({
        rank: String(rankCounter),
        name: formattedEntry.name,
        role: displayRole,
        tier: tier,
        winrate: winrate,     // Raw decimal (0.533 = 53.3%)
        pickrate: pickrate,   // Raw decimal (0.015 = 1.5%)
        games: champ.games_analyzed || 0,
      });
      rankCounter++;
    }
  }

  return {
    success: true,
    rank: data.rank || "MASTER",
    tier_list: formattedTiers,
    counts: data.counts || { S: 0, A: 0, B: 0, C: 0, D: 0 },
    total_champions: data.total_champions || 0,
    last_update: data.last_update,
    champions: flatList,
  };
}

// =============================================================================
// BUILD API
// =============================================================================

/**
 * Fetch champion build from API.
 * The API aggregates Diamond+ data for best statistics.
 *
 * @param {string} championName - Champion name (e.g., "Jinx", "Lee Sin")
 * @param {string} role - Role ("top", "jungle", "mid", "adc", "support")
 * @param {boolean} forceRefresh - Force cache refresh
 * @returns {Promise<Object>} Build data
 */
export async function getChampionBuild(
  championName,
  role = "default",
  forceRefresh = false,
) {
  // Normalize champion name for URL (lowercase, no spaces/special chars)
  const champNormalized = championName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/'/g, "")
    .replace(/\./g, "");

  const roleNormalized = role.toLowerCase();
  const params = forceRefresh ? "?force_refresh=true" : "";

  try {
    const data = await apiCall(
      `/build/${champNormalized}/${roleNormalized}${params}`,
    );
    return formatBuildResponse(data, championName, role);
  } catch (error) {
    console.error("[API] Build error:", error);
    return makeErrorResponse(error.message, championName, role);
  }
}

/**
 * Format build response for frontend display.
 * Transforms API response format to what the frontend renderBuild() expects.
 *
 * API format: build.runes = [
 *   { name: "Precision", path: 8000, keystones: [{id, count, winrate}], runes: [{id, count, winrate}] },
 *   { name: "Inspiration", path: 8300, runes: [{id, count, winrate}] }
 * ]
 *
 * @param {Object} data - Raw API response
 * @param {string} champion - Champion name
 * @param {string} role - Role
 * @returns {Object} Formatted build data
 */
function formatBuildResponse(data, champion, role) {
  const buildData = data.build || {};
  const version = cachedDDragonVersion;

  // === RUNES ===
  const runesArray = buildData.runes || [];

  // Find primary tree (has keystones)
  const primaryTree = runesArray.find(
    (t) => t.keystones && t.keystones.length > 0,
  );
  // Find secondary tree (has runes but no keystones, different path from primary)
  const secondaryTree = runesArray.find(
    (t) =>
      t.runes &&
      t.runes.length > 0 &&
      (!t.keystones || t.keystones.length === 0) &&
      t.path !== primaryTree?.path,
  );

  // Get keystone (highest count from primary tree)
  let keystoneId = null;
  let keystoneName = "Keystone";
  if (primaryTree && primaryTree.keystones) {
    const bestKeystone = primaryTree.keystones.reduce(
      (best, curr) => (curr.count > (best?.count || 0) ? curr : best),
      null,
    );
    if (bestKeystone) {
      keystoneId = bestKeystone.id;
      keystoneName = getRuneName(bestKeystone.id);
    }
  }
  const keystoneIcon = keystoneId ? getRuneImageUrl(keystoneId) : null;

  // Primary tree runes (from primary tree's runes array if exists, pick top 3 by count)
  // These are the minor runes from the primary tree (rows 2-4)
  const primaryRunes = [];
  if (primaryTree && primaryTree.runes.length >= 3) {
    // Ordre visuel = ordre API : row1 (idx1), row2 (idx2), row3 (idx3)
    // Pas de tri par count ! Garde l'ordre backend (le plus populaire par row)
    const apiOrderRunes = primaryTree.runes.slice(0, 3); // Déjà top3 par row du backend
    for (const rune of apiOrderRunes) {
      primaryRunes.push({
        id: rune.id,
        name: getRuneName(rune.id),
        icon: getRuneImageUrl(rune.id),
        count: rune.count,
        winrate: rune.winrate,
      });
    }
  }

  // Secondary tree runes (pick top 2 by count)
  const secondaryRunes = [];
  if (secondaryTree && secondaryTree.runes) {
    const sortedSecondary = [...secondaryTree.runes]
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);
    for (const rune of sortedSecondary) {
      secondaryRunes.push({
        id: rune.id,
        name: getRuneName(rune.id),
        icon: getRuneImageUrl(rune.id),
      });
    }
  }

  // Shards - handle both old format (buildData.shards) and new format (buildData.stat_shards)
  const shards = [];

  // New API format: stat_shards array with {id, name, row, count, winrate}
  const statShardsArray = buildData.stat_shards || [];
  if (statShardsArray.length > 0) {
    // Process new format - order by row: offense, flex, defense
    for (const row of ["offense", "flex", "defense"]) {
      const shard = statShardsArray.find((s) => s.row === row);
      if (shard) {
        shards.push({
          id: shard.id,
          name: shard.name || getRuneName(shard.id),
          icon: getStatShardImageUrl(shard.id),
          row: shard.row,
          winrate: shard.winrate,
        });
      }
    }
  } else {
    // Fallback to old format: shards object with {offense: id, flex: id, defense: id}
    const shardsData = buildData.shards || {};
    for (const shardKey of ["offense", "flex", "defense"]) {
      const shardId = shardsData[shardKey];
      if (shardId) {
        shards.push({
          id: shardId,
          name: getRuneName(shardId),
          icon: getStatShardImageUrl(shardId),
          row: shardKey,
        });
      }
    }
  }

  // === ITEMS ===
  // API format: build.items = [{ slot: "first", items: [{ id, name, count, winrate }] }, ...]
  const itemsArray = buildData.items || [];

  // BUG FIX: Proper item ID classifications for filtering
  // Valid starting items (gold_cost < 500 OR traditional starters)
  const validStarterIds = [
    // Doran's items
    1055, // Doran's Blade
    1054, // Doran's Shield
    1056, // Doran's Ring
    1082, // Dark Seal
    1083, // Cull
    // Potions
    2003, // Health Potion
    2031, // Refillable Potion
    2033, // Corrupting Potion
    2055, // Control Ward
    // Support items
    3850, 3851, 3853, // Spellthief's line
    3854, 3855, 3857, // Relic Shield line
    3858, 3859, 3860, // Spectral Sickle line
    3862, 3863, 3864, // Steel Shoulderguards line
    // Long Sword / Amplifying Tome for some builds
    1036, // Long Sword (350g)
    1037, // Pickaxe - NOT a starter, removing
    1052, // Amplifying Tome (400g)
    // Boots (basic)
    1001, // Boots (300g)
    // Tear
    3070, // Tear of the Goddess (400g)
  ];

  const bootIds = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158, 3013]; // Added Sorcerer's Boots variant

  // Full items (expensive, NOT starters) - these should NEVER be in starting items
  const fullItemMinGold = 2000; // Items above this are definitely not starters

  // Helper to get best item from a slot
  const getBestItemFromSlot = (slotName) => {
    const slot = itemsArray.find((s) => s.slot === slotName);
    if (slot && slot.items && slot.items.length > 0) {
      // Get item with highest count
      return slot.items.reduce(
        (best, curr) => (curr.count > (best?.count || 0) ? curr : best),
        null,
      );
    }
    return null;
  };

  // Helper to format item
  const formatItem = (item) => {
    if (!item) return null;
    return {
      id: item.id,
      name: item.name || `Item ${item.id}`,
      icon: getItemImageUrl(item.id, version),
    };
  };

  // BUG FIX: Starting items - ONLY show valid low-cost starting items (boots/potions/Doran's)
  // Filter out full items like Guardian Angel that incorrectly appear in "first" slot
  const startingItems = [];
  const firstSlot = itemsArray.find((s) => s.slot === "first");
  if (firstSlot && firstSlot.items && firstSlot.items.length > 0) {
    // Filter to only valid starting items (in validStarterIds list OR gold < 500)
    const validStartingItems = firstSlot.items.filter((item) => {
      const itemId = parseInt(item.id);
      // Accept if it's in our known starter list
      if (validStarterIds.includes(itemId)) return true;
      // Accept basic boots
      if (itemId === 1001) return true;
      // Reject everything else (full items like Guardian Angel should NOT be starters)
      return false;
    });

    // Sort by count desc, then winrate desc as tiebreaker
    const sortedStartingItems = [...validStartingItems].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (b.winrate || 0) - (a.winrate || 0);
    });

    // Take top 2 valid starting items
    for (const item of sortedStartingItems.slice(0, 2)) {
      startingItems.push(formatItem(item));
    }
  }

  // Core items (first 3 completed items from slots, excluding boots and starting items)
  const coreItems = [];
  const startingItemIds = new Set(startingItems.map((i) => i.id));

  for (const slotName of ["first", "second", "third"]) {
    const bestItem = getBestItemFromSlot(slotName);
    if (
      bestItem &&
      !bootIds.includes(bestItem.id) &&
      !startingItemIds.has(bestItem.id)
    ) {
      coreItems.push(formatItem(bestItem));
    }
  }

  // Boots (find boots from any slot)
  let boots = null;
  for (const slot of itemsArray) {
    if (slot.items) {
      const bootItem = slot.items.find((i) => bootIds.includes(i.id));
      if (bootItem && (!boots || bootItem.count > boots.count)) {
        boots = formatItem(bootItem);
      }
    }
  }

  // Full build (items from slots 4-6)
  const fullBuildItems = [];
  for (const slotName of ["fourth", "fifth", "sixth"]) {
    const bestItem = getBestItemFromSlot(slotName);
    if (bestItem && !bootIds.includes(bestItem.id)) {
      fullBuildItems.push(formatItem(bestItem));
    }
  }

  // Situational items (other popular items not in core/starting)
  const situationalItems = [];
  const usedIds = new Set(
    [
      ...startingItems.map((i) => i?.id),
      ...coreItems.map((i) => i?.id),
      ...fullBuildItems.map((i) => i?.id),
      boots?.id,
    ].filter(Boolean),
  );

  for (const slot of itemsArray) {
    if (slot.items) {
      for (const item of slot.items.slice(0, 3)) {
        if (
          !usedIds.has(item.id) &&
          !bootIds.includes(item.id) &&
          !validStarterIds.includes(item.id)
        ) {
          situationalItems.push(formatItem(item));
          usedIds.add(item.id);
          if (situationalItems.length >= 4) break;
        }
      }
    }
    if (situationalItems.length >= 4) break;
  }

  // === SKILLS ===
  const skillOrderArray = buildData.skill_order || [];
  // If skill_order is empty, leave it empty
  const skillOrder = skillOrderArray.length > 0 ? skillOrderArray : [];

  // === SUMMONER SPELLS ===
  // API format: build.summoner_spells = [{ spell: "Flash", count: 18 }, ...]
  const summonerSpellsArray = buildData.summoner_spells || [];
  const summoners = [];

  // Sort by count and take top 2
  const sortedSpells = [...summonerSpellsArray]
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  for (const spell of sortedSpells) {
    const spellId = getSpellIdFromName(spell.spell);
    summoners.push({
      id: spellId,
      name: spell.spell,
      icon: getSpellImageUrl(spellId, version),
    });
  }

  // === STATS ===
  const winrate = data.weighted_winrate ? data.weighted_winrate * 100 : null;
  const games = data.total_games_analyzed || 0;

  // === CACHE INFO ===
  const cached = data.cached || false;
  const cacheAgeHours = data.cache_age_hours;

  return {
    success: true,
    error: null,
    champion:
      (data.champion || champion).charAt(0).toUpperCase() +
      (data.champion || champion).slice(1),
    champion_id: null,
    role: data.role || role,
    rank: data.rank || "DIAMOND+",
    source: "api.hommet.ch",
    runes: {
      keystone: keystoneId,
      keystone_icon: keystoneIcon,
      keystone_name: keystoneName,
      primary: primaryRunes,
      secondary: secondaryRunes,
      shards: shards,
    },
    items: {
      starting: startingItems.filter(Boolean),
      core: coreItems.filter(Boolean),
      boots: boots,
      full_build: fullBuildItems.filter(Boolean),
      situational: situationalItems.filter(Boolean),
    },
    skills: { order: skillOrder },
    summoners: summoners,
    winrate: winrate,
    games: games,
    cached: cached,
    cache_age_hours: cacheAgeHours,
  };
}

/**
 * Get spell ID from spell name.
 */
function getSpellIdFromName(spellName) {
  const spellNameToId = {
    Cleanse: 1,
    Exhaust: 3,
    Flash: 4,
    Ghost: 6,
    Heal: 7,
    Smite: 11,
    Teleport: 12,
    Clarity: 13,
    Ignite: 14,
    Barrier: 21,
    Mark: 32,
  };
  return spellNameToId[spellName] || 4; // Default to Flash
}

/**
 * Create a standardized error response.
 */
function makeErrorResponse(errorMsg, champion, role) {
  return {
    success: false,
    error: errorMsg,
    champion: champion,
    role: role,
    runes: {
      keystone_icon: null,
      primary: [],
      secondary: [],
      shards: [],
    },
    items: { starting: [], core: [], boots: null },
    skills: { order: [], priority: "" },
    summoners: [],
    winrate: null,
    pickrate: null,
    games: null,
    cached: false,
    cache_age_hours: null,
  };
}

// =============================================================================
// ITEMS API
// =============================================================================

/**
 * Fetch all items from API with DDragon fallback.
 *
 * @param {boolean} refresh - Force cache refresh
 * @returns {Promise<Array>} List of item objects
 */
export async function getItemsData(refresh = false) {
  const params = refresh ? "?refresh=true" : "";

  const data = await apiCall(`/items${params}`);

  // API returns { items: [...], version: "15.x.x", total: N }
  if (!data || !Array.isArray(data.items)) {
    console.error("[API] Items: unexpected format", data);
    return { items: [], version: cachedDDragonVersion };
  }

  // Update cached version from API
  if (data.version) {
    cachedDDragonVersion = data.version;
  }

  console.log(`[API] Loaded ${data.items.length} items (v${data.version})`);
  return { items: data.items, version: data.version || cachedDDragonVersion };
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Check if the backend API is running.
 *
 * @returns {Promise<boolean>} True if healthy
 */
export async function checkHealth() {
  try {
    const response = await fetch("https://api.hommet.ch/health", {
      method: "GET",
      timeout: { secs: 5, nanos: 0 },
    });
    return response.ok;
  } catch (error) {
    console.error("[API] Health check failed:", error);
    return false;
  }
}

/**
 * Verify backend connection with retries.
 *
 * @returns {Promise<boolean>} True if connected
 */
export async function verifyBackendConnection() {
  let retries = 3;

  while (retries > 0) {
    const isHealthy = await checkHealth();
    if (isHealthy) {
      console.log("[API] Backend connected successfully");
      return true;
    }

    console.warn(
      `[API] Backend not responding, retrying... (${retries} attempts left)`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    retries--;
  }

  console.error("[API] Failed to connect to backend API");
  return false;
}

// =============================================================================
// IMAGE URL GENERATORS
// =============================================================================

const DDRAGON_PERK_BASE = "https://ddragon.leagueoflegends.com/cdn/img/";

// Rune paths mapping
const RUNE_PATHS = {
  // Precision Tree
  8000: "perk-images/Styles/7201_Precision.png",
  8005: "perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png",
  8008: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png",
  8021: "perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png",
  8010: "perk-images/Styles/Precision/Conqueror/Conqueror.png",
  8009: "perk-images/Styles/Precision/PresenceOfMind/PresenceOfMind.png",
  9101: "perk-images/Styles/Precision/AbsorbLife/AbsorbLife.png",
  9111: "perk-images/Styles/Precision/Triumph.png",
  9104: "perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png",
  9105: "perk-images/Styles/Precision/LegendHaste/LegendHaste.png",
  9103: "perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png",
  8014: "perk-images/Styles/Precision/CoupDeGrace/CoupDeGrace.png",
  8017: "perk-images/Styles/Precision/CutDown/CutDown.png",
  8299: "https://wiki.leagueoflegends.com/en-us/images/Last_Stand_rune.png",

  // Domination Tree
  8100: "perk-images/Styles/7200_Domination.png",
  8112: "perk-images/Styles/Domination/Electrocute/Electrocute.png",
  8124: "perk-images/Styles/Domination/Predator/Predator.png",
  8128: "perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png",
  9923: "perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png",
  8126: "perk-images/Styles/Domination/CheapShot/CheapShot.png",
  8139: "perk-images/Styles/Domination/TasteOfBlood/GreenTerror_TasteOfBlood.png",
  8143: "perk-images/Styles/Domination/SuddenImpact/SuddenImpact.png",
  8137: "perk-images/Styles/Domination/EyeballCollection/EyeballCollection.png",
  8140: "perk-images/Styles/Domination/GrislyMementos/GrislyMementos.png",
  8141: "perk-images/Styles/Domination/GhostPoro/GhostPoro.png",
  8135: "perk-images/Styles/Domination/TreasureHunter/TreasureHunter.png",
  8105: "perk-images/Styles/Domination/RelentlessHunter/RelentlessHunter.png",
  8106: "perk-images/Styles/Domination/UltimateHunter/UltimateHunter.png",

  // Sorcery Tree
  8200: "perk-images/Styles/7202_Sorcery.png",
  8214: "perk-images/Styles/Sorcery/SummonAery/SummonAery.png",
  8229: "perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png",
  8230: "perk-images/Styles/Sorcery/PhaseRush/PhaseRush.png",
  8224: "perk-images/Styles/Sorcery/NullifyingOrb/Pokeshield.png",
  8226: "perk-images/Styles/Sorcery/ManaflowBand/ManaflowBand.png",
  8275: "perk-images/Styles/Sorcery/NimbusCloak/6361.png",
  8210: "perk-images/Styles/Sorcery/Transcendence/Transcendence.png",
  8234: "perk-images/Styles/Sorcery/Celerity/CelerityTemp.png",
  8233: "perk-images/Styles/Sorcery/AbsoluteFocus/AbsoluteFocus.png",
  8237: "perk-images/Styles/Sorcery/Scorch/Scorch.png",
  8232: "perk-images/Styles/Sorcery/Waterwalking/Waterwalking.png",
  8236: "perk-images/Styles/Sorcery/GatheringStorm/GatheringStorm.png",

  // Resolve Tree
  8400: "perk-images/Styles/7204_Resolve.png",
  8437: "perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png",
  8439: "perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png",
  8465: "perk-images/Styles/Resolve/Guardian/Guardian.png",
  8446: "perk-images/Styles/Resolve/Demolish/Demolish.png",
  8463: "perk-images/Styles/Resolve/FontOfLife/FontOfLife.png",
  8401: "https://wiki.leagueoflegends.com/en-us/images/Shield_Bash_rune.png",
  8429: "perk-images/Styles/Resolve/Conditioning/Conditioning.png",
  8444: "perk-images/Styles/Resolve/SecondWind/SecondWind.png",
  8473: "perk-images/Styles/Resolve/BonePlating/BonePlating.png",
  8451: "perk-images/Styles/Resolve/Overgrowth/Overgrowth.png",
  8453: "perk-images/Styles/Resolve/Revitalize/Revitalize.png",
  8242: "perk-images/Styles/Resolve/Unflinching/Unflinching.png",

  // Inspiration Tree
  8300: "perk-images/Styles/7203_Inspiration.png",
  8351: "perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png",
  8360: "perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png",
  8369: "perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png",
  8306: "perk-images/Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png",
  8304: "perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png",
  8321: "https://wiki.leagueoflegends.com/en-us/images/Cash_Back_rune.png",
  8313: "https://wiki.leagueoflegends.com/en-us/images/Triple_Tonic_rune.png?42e4d",
  8352: "perk-images/Styles/Inspiration/TimeWarpTonic/TimeWarpTonic.png",
  8345: "perk-images/Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png",
  8347: "perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png",
  8410: "https://wiki.leagueoflegends.com/en-us/images/Approach_Velocity_rune.png",
  8316: "perk-images/Styles/Inspiration/JackOfAllTrades/JackOfAllTrades.png",

  // Stat Shards
  5008: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
  5005: "perk-images/StatMods/StatModsAttackSpeedIcon.png",
  5007: "perk-images/StatMods/StatModsCDRScalingIcon.png",
  5001: "perk-images/StatMods/StatModsHealthScalingIcon.png",
  5002: "perk-images/StatMods/StatModsArmorIcon.png",
  5003: "perk-images/StatMods/StatModsMagicResIcon.png",
  5010: "perk-images/StatMods/StatModsMovementSpeedIcon.png",
  5011: "perk-images/StatMods/StatModsHealthPlusIcon.png",
};

// Rune names mapping
const RUNE_NAMES = {
  // Precision
  8000: "Precision",
  8005: "Press the Attack",
  8008: "Lethal Tempo",
  8021: "Fleet Footwork",
  8010: "Conqueror",
  8009: "Presence of Mind",
  9101: "Absorb Life",
  9111: "Triumph",
  9104: "Legend: Alacrity",
  9105: "Legend: Haste",
  9103: "Legend: Bloodline",
  8014: "Coup de Grace",
  8017: "Cut Down",
  8299: "Last Stand",

  // Domination
  8100: "Domination",
  8112: "Electrocute",
  8124: "Predator",
  8128: "Dark Harvest",
  9923: "Hail of Blades",
  8126: "Cheap Shot",
  8139: "Taste of Blood",
  8143: "Sudden Impact",
  8137: "Sixth Sense",
  8140: "Grisly Mementos",
  8141: "Deep Ward",
  8135: "Treasure Hunter",
  8105: "Relentless Hunter",
  8106: "Ultimate Hunter",

  // Sorcery
  8200: "Sorcery",
  8214: "Summon Aery",
  8229: "Arcane Comet",
  8230: "Phase Rush",
  8224: "Axiom Arcanist",
  8226: "Manaflow Band",
  8275: "Nimbus Cloak",
  8210: "Transcendence",
  8234: "Celerity",
  8233: "Absolute Focus",
  8237: "Scorch",
  8232: "Waterwalking",
  8236: "Gathering Storm",

  // Resolve
  8400: "Resolve",
  8437: "Grasp of the Undying",
  8439: "Aftershock",
  8465: "Guardian",
  8446: "Demolish",
  8463: "Font of Life",
  8401: "Shield Bash",
  8429: "Conditioning",
  8444: "Second Wind",
  8473: "Bone Plating",
  8451: "Overgrowth",
  8453: "Revitalize",
  8242: "Unflinching",

  // Inspiration
  8300: "Inspiration",
  8351: "Glacial Augment",
  8360: "Unsealed Spellbook",
  8369: "First Strike",
  8306: "Hextech Flashtraption",
  8304: "Magical Footwear",
  8321: "Cash Back",
  8313: "Triple Tonic",
  8352: "Time Warp Tonic",
  8345: "Biscuit Delivery",
  8347: "Cosmic Insight",
  8410: "Approach Velocity",
  8316: "Jack of All Trades",

  // Stats
  5008: "Adaptive Force",
  5005: "Attack Speed",
  5007: "Ability Haste",
  5001: "Health Scaling",
  5002: "Armor",
  5003: "Magic Resist",
  5010: "Move Speed",
  5011: "Health",
};

// Spell names and files
const SPELL_NAMES = {
  1: "Cleanse",
  3: "Exhaust",
  4: "Flash",
  6: "Ghost",
  7: "Heal",
  11: "Smite",
  12: "Teleport",
  13: "Clarity",
  14: "Ignite",
  21: "Barrier",
  32: "Mark",
};

const SPELL_FILES = {
  1: "SummonerBoost",
  3: "SummonerExhaust",
  4: "SummonerFlash",
  6: "SummonerHaste",
  7: "SummonerHeal",
  11: "SummonerSmite",
  12: "SummonerTeleport",
  13: "SummonerMana",
  14: "SummonerDot",
  21: "SummonerBarrier",
  32: "SummonerSnowball",
};

/**
 * Get rune image URL.
 */
function getRuneImageUrl(runeId) {
  runeId = parseInt(runeId);
  if (RUNE_PATHS[runeId]) {
    const path = RUNE_PATHS[runeId];
    // Si c'est déjà une URL complète, la retourner directement
    if (path.startsWith("http")) {
      return path;
    }
    return `${DDRAGON_PERK_BASE}${path}`;
  }
  // Fallback
  return `${DDRAGON_PERK_BASE}perk-images/Styles/Precision/Conqueror/Conqueror.png`;
}

/**
 * Get stat shard image URL from CommunityDragon.
 * Format: https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/{id}.png
 */
function getStatShardImageUrl(shardId) {
  const CDRAGON_STATMODS_BASE =
    "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/";
  const id = parseInt(shardId);

  // Stat shard IDs mapping to file names (CommunityDragon uses different naming)
  const SHARD_FILES = {
    5005: "statmodsattackspeedicon",
    5008: "statmodsadaptiveforceicon",
    5007: "statmodscdrscalingicon",
    5002: "statmodsarmoricon",
    5003: "statmodsmagicresicon",
    5001: "statmodshealthscalingicon",
    5010: "statmodsmovementspeedicon",
    5011: "statmodshealthplusicon",
  };

  const fileName = SHARD_FILES[id];
  if (fileName) {
    return `${CDRAGON_STATMODS_BASE}${fileName}.png`;
  }

  // Fallback - try direct ID
  return `${CDRAGON_STATMODS_BASE}${id}.png`;
}

/**
 * Get rune display name.
 */
function getRuneName(runeId) {
  return RUNE_NAMES[parseInt(runeId)] || `Rune ${runeId}`;
}

/**
 * Get item image URL.
 */
function getItemImageUrl(itemId, version) {
  return `${DDRAGON_BASE_URL}/cdn/${version}/img/item/${itemId}.png`;
}

/**
 * Get summoner spell image URL.
 */
function getSpellImageUrl(spellId, version) {
  const spellName = SPELL_FILES[parseInt(spellId)] || `Summoner${spellId}`;
  return `${DDRAGON_BASE_URL}/cdn/${version}/img/spell/${spellName}.png`;
}

/**
 * Get summoner spell display name.
 */
function getSpellName(spellId) {
  return SPELL_NAMES[parseInt(spellId)] || `Spell ${spellId}`;
}

// =============================================================================
// EXPORT APP VERSION
// =============================================================================

/**
 * Get application version.
 */
export function getAppVersion() {
  return "1.5.0";
}
