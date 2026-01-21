/**
 * Items Service - DDragon Fetch with Gold Efficiency
 * ===================================================
 *
 * Fetches items directly from DDragon and calculates gold efficiency.
 * Gold values are copied from the old Python app (Patch 16.1 values).
 *
 * @author Milan Hommet
 * @license MIT
 */

// Use Tauri's global HTTP plugin API (available via window.__TAURI__)
const getTauriFetch = () => {
    if (window.__TAURI__ && window.__TAURI__.http) {
        return window.__TAURI__.http.fetch;
    }
    // Fallback to native fetch (for development/testing)
    return fetch;
};

const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";

// Cache for DDragon version
let cachedVersion = null;

/**
 * GOLD VALUES - Copied from old Python app (Patch 16.1)
 * These are the gold values per stat point used to calculate efficiency
 */
const GOLD_VALUES = {
    "FlatPhysicalDamageMod": 35,          // 1 AD = 35g
    "FlatMagicDamageMod": 21.75,          // 1 AP = 21.75g
    "FlatArmorMod": 20,                   // 1 Armor = 20g
    "FlatSpellBlockMod": 18,              // 1 MR = 18g
    "FlatHPPoolMod": 2.67,                // 1 HP = 2.67g
    "FlatMPPoolMod": 1.4,                 // 1 Mana = 1.4g
    "PercentAttackSpeedMod": 2500,        // 100% AS = 2500g (so 1% = 25g)
    "FlatCritChanceMod": 4000,            // 100% Crit = 4000g (so 1% = 40g)
    "FlatMovementSpeedMod": 12,           // 1 MS = 12g
    "PercentMovementSpeedMod": 3950,      // 100% MS% = 3950g
    "FlatHPRegenMod": 36,                 // 1 HP/5 = 36g
    "FlatMPRegenMod": 50,                 // 1 Mana/5 = 50g
    "PercentLifeStealMod": 2750           // 100% LS = 2750g (so 1% = 27.5g)
};

/**
 * Get the latest DDragon version
 * @returns {Promise<string>} DDragon version string
 */
async function getDDragonVersion() {
    if (cachedVersion) {
        return cachedVersion;
    }

    try {
        const tauriFetch = getTauriFetch();
        const response = await tauriFetch(`${DDRAGON_BASE_URL}/api/versions.json`, {
            method: 'GET',
            timeout: { secs: 10, nanos: 0 }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const versions = await response.json();
        if (versions && versions.length > 0) {
            cachedVersion = versions[0];
            console.log(`[Items] DDragon version: ${cachedVersion}`);
            return cachedVersion;
        }
    } catch (error) {
        console.warn('[Items] Failed to fetch DDragon version, using fallback:', error);
    }

    // Fallback version
    cachedVersion = "14.10.1";
    return cachedVersion;
}

/**
 * Calculate the gold efficiency of an item
 * @param {Object} itemStats - Stats object from DDragon item.json
 * @param {number} itemPrice - Total gold cost of the item
 * @returns {number|null} Gold efficiency percentage, or null if cannot be calculated
 */
function calculateGoldEfficiency(itemStats, itemPrice) {
    if (!itemStats || itemPrice <= 0) {
        return null;
    }

    let totalStatValue = 0;

    for (const [statKey, statValue] of Object.entries(itemStats)) {
        if (GOLD_VALUES[statKey] && statValue !== 0) {
            totalStatValue += statValue * GOLD_VALUES[statKey];
        }
    }

    // Items without calculable stats (wards, pure passives, etc.)
    if (totalStatValue === 0) {
        return null;
    }

    const efficiency = (totalStatValue / itemPrice) * 100;
    return Math.round(efficiency * 10) / 10; // Round to 1 decimal
}

/**
 * Get stat value in gold for a specific stat
 * @param {string} statKey - The stat key from DDragon
 * @param {number} statValue - The stat value
 * @returns {number} Gold value of the stat
 */
function getStatGoldValue(statKey, statValue) {
    if (GOLD_VALUES[statKey] && statValue !== 0) {
        return statValue * GOLD_VALUES[statKey];
    }
    return 0;
}

/**
 * Fetch all items from DDragon with gold efficiency calculated
 * @returns {Promise<Object>} Result object with success, items array, and version
 */
async function fetchAllItems() {
    const version = await getDDragonVersion();
    const url = `${DDRAGON_BASE_URL}/cdn/${version}/data/en_US/item.json`;

    try {
        const tauriFetch = getTauriFetch();
        const response = await tauriFetch(url, {
            method: 'GET',
            timeout: { secs: 15, nanos: 0 }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const items = [];

        for (const [itemId, itemData] of Object.entries(data.data)) {
            // Skip non-purchasable items
            if (itemData.gold && itemData.gold.purchasable === false) {
                continue;
            }

            // Skip items without price
            if (!itemData.gold || !itemData.gold.total || itemData.gold.total <= 0) {
                continue;
            }

            // Skip certain special items (ornn items, jungle items transforms, etc.)
            const tags = itemData.tags || [];
            if (tags.includes('Trinket') && itemData.gold.total === 0) {
                continue;
            }

            const goldEfficiency = calculateGoldEfficiency(
                itemData.stats || {},
                itemData.gold.total
            );

            // Determine category based on price
            let category = 'basic';
            if (itemData.gold.total >= 2500) {
                category = 'legendary';
            } else if (itemData.gold.total >= 1000) {
                category = 'epic';
            }

            // Detect stat types for filtering
            const statTypes = [];
            const statMapping = {
                'FlatPhysicalDamageMod': 'ad',
                'FlatMagicDamageMod': 'ap',
                'FlatHPPoolMod': 'health',
                'FlatArmorMod': 'armor',
                'FlatSpellBlockMod': 'mr',
                'PercentAttackSpeedMod': 'as',
                'FlatCritChanceMod': 'crit',
                'FlatMPPoolMod': 'mana'
            };

            for (const [ddragonKey, filterValue] of Object.entries(statMapping)) {
                if (itemData.stats && itemData.stats[ddragonKey] && itemData.stats[ddragonKey] !== 0) {
                    if (!statTypes.includes(filterValue)) {
                        statTypes.push(filterValue);
                    }
                }
            }

            items.push({
                id: parseInt(itemId),
                name: itemData.name,
                description: itemData.plaintext || itemData.description || "",
                price: itemData.gold.total,
                gold: itemData.gold.total,
                stats: itemData.stats || {},
                raw_stats: itemData.stats || {},
                goldEfficiency: goldEfficiency,
                efficiency: goldEfficiency,
                image: `${DDRAGON_BASE_URL}/cdn/${version}/img/item/${itemData.image.full}`,
                tags: itemData.tags || [],
                category: category,
                stat_type: statTypes[0] || null,
                stat_types: statTypes,
                into: itemData.into || [],
                from: itemData.from || []
            });
        }

        console.log(`[Items] Successfully loaded ${items.length} items from DDragon`);
        return { success: true, items: items, version: version };

    } catch (error) {
        console.error('[Items] Fetch error:', error);
        return { success: false, error: error.message, items: [], version: version };
    }
}

/**
 * Get a single item by ID from DDragon
 * @param {number} itemId - The item ID
 * @returns {Promise<Object|null>} Item data or null if not found
 */
async function getItemById(itemId) {
    const result = await fetchAllItems();
    if (!result.success) {
        return null;
    }
    return result.items.find(item => item.id === parseInt(itemId)) || null;
}

/**
 * Get item image URL
 * @param {number} itemId - The item ID
 * @param {string} version - DDragon version (optional, will fetch if not provided)
 * @returns {string} Image URL
 */
function getItemImageUrl(itemId, version = null) {
    const v = version || cachedVersion || "14.10.1";
    return `${DDRAGON_BASE_URL}/cdn/${v}/img/item/${itemId}.png`;
}

/**
 * Filter items by various criteria
 * @param {Array} items - Array of items to filter
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered items
 */
function filterItems(items, filters = {}) {
    return items.filter(item => {
        // Category filter
        if (filters.category && filters.category !== 'all') {
            if (item.category !== filters.category) return false;
        }

        // Stat type filter
        if (filters.statType && filters.statType !== 'all') {
            if (!item.stat_types || !item.stat_types.includes(filters.statType)) {
                return false;
            }
        }

        // Price range filter
        if (filters.priceRange && filters.priceRange !== 'all') {
            const gold = item.gold || 0;
            switch (filters.priceRange) {
                case '0-1000':
                    if (gold >= 1000) return false;
                    break;
                case '1000-2000':
                    if (gold < 1000 || gold >= 2000) return false;
                    break;
                case '2000-3000':
                    if (gold < 2000 || gold >= 3000) return false;
                    break;
                case '3000+':
                    if (gold < 3000) return false;
                    break;
            }
        }

        // Efficiency filter
        if (filters.efficiency && filters.efficiency !== 'all') {
            const eff = item.efficiency;
            if (eff === null || eff === undefined) return false;
            switch (filters.efficiency) {
                case 'high':
                    if (eff < 100) return false;
                    break;
                case 'medium':
                    if (eff < 90 || eff >= 100) return false;
                    break;
                case 'low':
                    if (eff >= 90) return false;
                    break;
            }
        }

        // Search text filter
        if (filters.searchText) {
            const search = filters.searchText.toLowerCase();
            if (!item.name.toLowerCase().includes(search)) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Sort items by a given criteria
 * @param {Array} items - Array of items to sort
 * @param {string} sortBy - Sort criteria ('name', 'gold', 'efficiency')
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array} Sorted items
 */
function sortItems(items, sortBy = 'name', direction = 'asc') {
    const sorted = [...items].sort((a, b) => {
        let valA, valB;

        switch (sortBy) {
            case 'name':
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
                break;
            case 'gold':
            case 'price':
                valA = a.gold || 0;
                valB = b.gold || 0;
                break;
            case 'efficiency':
                valA = a.efficiency || 0;
                valB = b.efficiency || 0;
                break;
            default:
                valA = a[sortBy] || 0;
                valB = b[sortBy] || 0;
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    return sorted;
}

export {
    fetchAllItems,
    getItemById,
    getItemImageUrl,
    calculateGoldEfficiency,
    getStatGoldValue,
    filterItems,
    sortItems,
    getDDragonVersion,
    GOLD_VALUES,
    DDRAGON_BASE_URL
};
