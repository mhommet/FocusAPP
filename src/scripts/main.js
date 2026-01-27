/**
 * FOCUS - Frontend JavaScript (Tauri Version)
 * League of Legends Companion App
 *
 * Migrated from Python EEL to Tauri 2.0 with HTTP fetch.
 * Uses the Rust Axum API backend on localhost:8000.
 *
 * @author Milan Hommet
 * @license MIT
 */

import {
    getAppVersion,
    getDDragonVersion,
    getTierlist,
    getChampionBuild,
    getItemsData,
    getChampionList,
    verifyBackendConnection,
    checkHealth
} from './api.js';

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/** @type {Array<Object>} All champions data */
let allChampions = [];

/** @type {Object|null} Full tier list response with metadata */
let tierListData = null;

/** @type {Array<Object>} All items data */
let allItems = [];

/** @type {string} DDragon version for item images */
let itemsVersion = "14.10.1";

/** @type {Array<Object>} Filtered champions based on search/filters */
let filteredChampions = [];

/** @type {{column: string, direction: string}} Current sort configuration */
let currentSort = { column: 'rank', direction: 'asc' };

/** @type {string} Currently active tab */
let currentTab = 'tierlist';

/** @type {string} Currently selected role filter */
let currentRoleFilter = 'all';

// Pagination state
/** @type {number} Current page number for tier list */
let currentPage = 1;

/** @type {number} Items per page for tier list */
let itemsPerPage = 25;

// Items pagination state
/** @type {Array<Object>} Filtered items based on search/filters */
let filteredItems = [];

/** @type {number} Current page for items grid */
let itemsPage = 1;

/** @type {number} Items per page for items grid */
let itemsPerPageGrid = 24;

// Builds state
/** @type {boolean} Whether champion list has been loaded */
let championListLoaded = false;

/** @type {Object|null} Currently displayed build */
let currentBuild = null;

/** @type {Array<Object>} All champions for build selector (separate from tierlist) */
let buildChampions = [];

/** @type {Array<Object>} Filtered champions for build selector grid */
let filteredChampionsBuild = [];

/** @type {string|null} Currently selected champion ID */
let selectedChampion = null;

/** @type {string|null} Currently selected champion name */
let selectedChampionName = null;

/** @type {boolean} Whether backend is connected */
let backendConnected = false;

/** @type {number} Build request ID counter - used to ignore stale responses */
let buildRequestId = 0;

// =============================================================================
// AUTO-IMPORT STATE
// =============================================================================

/** @type {boolean} Whether auto-import is enabled */
let autoImportEnabled = false;

/** @type {number|null} Interval ID for Live Client Data polling */
let autoImportPollInterval = null;

/** @type {string|null} Last detected champion ID to prevent duplicate imports */
let lastAutoImportedChampion = null;

/** @type {boolean} Whether we're currently in champion select */
let inChampionSelect = false;

// =============================================================================
// GLOBAL SEARCH STATE
// =============================================================================

/** @type {Array<Object>} Cached champions list for global search */
let globalSearchChampions = [];

/** @type {number|null} Debounce timer for global search */
let globalSearchDebounce = null;

/** @type {number} Highlighted index for keyboard navigation */
let globalSearchHighlightIndex = -1;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the application.
 * Verifies backend connection and loads initial data.
 * @returns {Promise<void>}
 */
async function init() {
    // Set app version
    const version = getAppVersion();
    document.getElementById('version').innerText = version;

    // Verify backend connection
    backendConnected = await verifyBackendConnection();

    if (!backendConnected) {
        showBackendError();
        return;
    }

    hideBackendError();

    // Load champions for global search (in background)
    loadGlobalSearchChampions();

    refreshTierList();
}

/**
 * Show backend error banner.
 */
function showBackendError() {
    const banner = document.getElementById('backend-status');
    if (banner) {
        banner.style.display = 'flex';
    }
}

/**
 * Hide backend error banner.
 */
function hideBackendError() {
    const banner = document.getElementById('backend-status');
    if (banner) {
        banner.style.display = 'none';
    }
}

/**
 * Retry backend connection.
 */
async function retryBackendConnection() {
    backendConnected = await verifyBackendConnection();

    if (backendConnected) {
        hideBackendError();
        refreshCurrentTab();
    } else {
        showToast('Failed to connect to backend API', 'error');
    }
}

// =============================================================================
// TAB NAVIGATION
// =============================================================================

/**
 * Switch between application tabs (tierlist, items, builds).
 * @param {string} tabName - Name of the tab to switch to
 * @returns {void}
 */
function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach((content) => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    // Load data if needed
    if (tabName === 'items' && allItems.length === 0) {
        refreshItems();
    }
    if (tabName === 'builds' && !championListLoaded) {
        loadChampionGrid();
    }
    if (tabName === 'changelog') {
        initChangelog();
    }
}

/**
 * Refresh data for the currently active tab.
 * @returns {void}
 */
function refreshCurrentTab() {
    if (currentTab === 'tierlist') {
        refreshTierList();
    } else if (currentTab === 'items') {
        refreshItems();
    } else if (currentTab === 'builds') {
        loadChampionBuild();
    }
}

// =============================================================================
// TIER LIST
// =============================================================================

/**
 * Filter tier list by role.
 * Updates the active button state and fetches data from API.
 * @param {string} role - Role to filter by ('all', 'top', 'jungle', 'mid', 'adc', 'support')
 * @returns {Promise<void>}
 */
async function filterByRole(role) {
    // Update active button state
    document.querySelectorAll('.role-filter-btn-small').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });

    currentRoleFilter = role;
    currentPage = 1;

    // Fetch tier list with role filter
    await refreshTierList(role === 'all' ? null : role);
}

/**
 * Fetch and display the tier list from the API.
 * Shows Diamond+ aggregated champion rankings.
 * @param {string|null} role - Optional role filter
 * @returns {Promise<void>}
 */
async function refreshTierList(role = null) {
    // Show loading spinner
    const tbody = document.querySelector('#tier-list-table tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="tierlist-loading">
                    <div class="tierlist-loading-content">
                        <div class="spinner-ring"></div>
                        <div class="loading-text">Loading Tier List...</div>
                        <div class="loading-subtext">Fetching latest meta data...</div>
                    </div>
                </td>
            </tr>
        `;
    }

    // Clear last update display
    const lastUpdateEl = document.getElementById('tierlist-last-update');
    if (lastUpdateEl) lastUpdateEl.innerHTML = '';

    // Fetch tier list from API
    const data = await getTierlist(role);

    // Data format: {success, champions, tier_list, last_update, counts, total_champions}
    if (data && data.success && data.champions && data.champions.length > 0) {
        tierListData = data;
        allChampions = data.champions; // Use flat list for table

        // Display last update time with readable format
        if (lastUpdateEl && data.last_update) {
            const updateDate = new Date(data.last_update);
            const options = {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            const formattedDate = updateDate.toLocaleDateString('fr-FR', options);
            lastUpdateEl.innerHTML = `<i class="fas fa-clock"></i> Tier list updated ${formattedDate}`;
            lastUpdateEl.title = `Aggregated Diamond+ data (Diamond, Master, Grandmaster, Challenger)`;
        }

        applyFilters();
    } else {
        const errorMsg = data?.error || 'Failed to load tier list';
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-cell">${errorMsg}. Try refreshing.</td>
                </tr>
            `;
        }
    }
}

/**
 * Apply filters and sorting to the tier list.
 * @param {boolean} [resetPage=true] - Whether to reset to page 1
 * @returns {void}
 */
function applyFilters(resetPage = true) {
    const searchText = document.getElementById('search-input').value.toLowerCase();

    if (resetPage) currentPage = 1;

    // Filter by search text only (role filtering is done via API)
    filteredChampions = allChampions.filter((champ) => {
        const matchSearch = champ.name.toLowerCase().includes(searchText);
        return matchSearch;
    });

    // Sort
    filteredChampions.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        if (currentSort.column === 'winrate') {
            // Handle both string "52.5%" and number formats
            valA = typeof valA === 'string' ? parseFloat(valA.replace('%', '')) : valA || 0;
            valB = typeof valB === 'string' ? parseFloat(valB.replace('%', '')) : valB || 0;
        }
        if (currentSort.column === 'pickrate') {
            valA = typeof valA === 'string' ? parseFloat(valA.replace('%', '')) : valA || 0;
            valB = typeof valB === 'string' ? parseFloat(valB.replace('%', '')) : valB || 0;
        }
        if (currentSort.column === 'games') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        }
        if (currentSort.column === 'rank') {
            valA = parseInt(valA) || 999;
            valB = parseInt(valB) || 999;
        }
        if (currentSort.column === 'tier') {
            const tierOrder = { 'S+': 6, S: 5, A: 4, B: 3, C: 2, D: 1 };
            valA = tierOrder[valA] || 0;
            valB = tierOrder[valB] || 0;
        }

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Paginate
    const totalPages = Math.ceil(filteredChampions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageData = filteredChampions.slice(startIndex, startIndex + itemsPerPage);

    updateTable(pageData);
    updatePagination(totalPages);
    updateSortIndicators();
}

/**
 * Sort the tier list table by a specific column.
 * @param {string} column - Column name to sort by
 * @returns {void}
 */
function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        // Default to descending for stats columns
        currentSort.direction = ['winrate', 'pickrate', 'tier', 'games'].includes(column) ? 'desc' : 'asc';
    }
    currentPage = 1;
    applyFilters();
    updateSortIndicators();
}

/**
 * Update sort indicators on table headers.
 */
function updateSortIndicators() {
    const headers = document.querySelectorAll('#tier-list-table th[data-sort]');
    headers.forEach(th => {
        const column = th.dataset.sort;
        const icon = th.querySelector('i');
        if (icon) {
            if (column === currentSort.column) {
                icon.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
                th.classList.add('sorted');
            } else {
                icon.className = 'fas fa-sort';
                th.classList.remove('sorted');
            }
        }
    });
}

/**
 * Update the tier list table with champion data.
 * @param {Array<Object>} champions - Array of champion objects to display
 * @returns {void}
 */
function updateTable(champions) {
    const tbody = document.querySelector('#tier-list-table tbody');
    if (!tbody) return;

    if (champions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No champions found</td></tr>';
        return;
    }

    tbody.innerHTML = champions
        .map((champ) => {
            const roleIcon = getRoleIcon(champ.role);
            const roleDisplay = roleIcon
                ? `<span class="role-cell"><img src="${roleIcon}" alt="${champ.role}" class="role-icon-small" onerror="this.style.display='none'"> ${champ.role}</span>`
                : champ.role;
            // Normalize role for build navigation
            const normalizedRole = normalizeRoleForBuild(champ.role);
            return `
        <tr class="champion-row clickable" data-champion="${champ.name}" data-role="${normalizedRole}" title="Click to view ${champ.name} build">
            <td>#${champ.rank}</td>
            <td><strong>${champ.name}</strong></td>
            <td>${roleDisplay}</td>
            <td class="${getTierClass(champ.tier)}">${champ.tier}</td>
            <td>${formatWinrate(champ.winrate)}</td>
            <td>${formatPickrate(champ.pickrate)}</td>
            <td>${champ.games ? champ.games.toLocaleString() : '-'}</td>
        </tr>
    `;
        })
        .join('');

    // Add click handlers for navigation to builds
    tbody.querySelectorAll('.champion-row').forEach(row => {
        row.addEventListener('click', () => {
            const championName = row.dataset.champion;
            const role = row.dataset.role;
            navigateToBuildForChampion(championName, role);
        });
    });
}

function getTierClass(tier) {
    if (tier === 'S+') return 'tier-s-plus';
    if (tier === 'S') return 'tier-s';
    if (tier === 'A') return 'tier-a';
    if (tier === 'B') return 'tier-b';
    if (tier === 'C') return 'tier-c';
    if (tier === 'D') return 'tier-d';
    return '';
}

/**
 * Format winrate for display.
 * Backend sends decimal (0.533 = 53.3%) or 1 = 100%
 * @param {number|string} winrate - Winrate value
 * @returns {string} Formatted winrate with %
 */
function formatWinrate(winrate) {
    if (winrate === null || winrate === undefined || winrate === '-') return '-';
    let value = typeof winrate === 'string' ? parseFloat(winrate.replace('%', '')) : winrate;

    // Backend sends decimal: 0.533 = 53.3%, 1 = 100%
    // Multiply by 100 to get percentage
    const percent = value * 100;

    // Format with 2 decimals
    if (percent >= 99.995) {
        return '100%';
    } else if (percent < 1) {
        return '<1%';
    } else {
        return percent.toFixed(2) + '%';
    }
}

/**
 * Format pickrate for display.
 * Backend sends decimal (0.015 = 1.5%)
 * @param {number|string} pickrate - Pickrate value
 * @returns {string} Formatted pickrate with %
 */
function formatPickrate(pickrate) {
    if (pickrate === null || pickrate === undefined || pickrate === '-') return '-';
    let value = typeof pickrate === 'string' ? parseFloat(pickrate.replace('%', '')) : pickrate;

    // Backend sends decimal: 0.015 = 1.5%
    // Multiply by 100 to get percentage
    const percent = value * 100;

    // Format with appropriate precision
    if (percent < 1) {
        return '<1%';
    } else if (percent < 10) {
        return percent.toFixed(2) + '%';
    } else {
        return percent.toFixed(1) + '%';
    }
}

/**
 * Get the icon URL for a given role.
 * @param {string} role - Role name (top, jungle, mid, adc, support)
 * @returns {string} URL of the role icon
 */
function getRoleIcon(role) {
    const roleIcons = {
        top: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png',
        jungle: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png',
        mid: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
        middle: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
        adc: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
        bottom: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
        support: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png',
        utility: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png'
    };
    return roleIcons[role?.toLowerCase()] || '';
}

function updatePagination(totalPages) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = `<span class="pagination-info">${filteredChampions.length} champions</span>`;
        return;
    }

    let html = `
        <button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
        html += `<button class="pagination-btn" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="pagination-info">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="pagination-info">...</span>`;
        html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
        <button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
        <span class="pagination-info">${filteredChampions.length} champions</span>
        <select class="pagination-select" data-action="items-per-page">
            <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25 / page</option>
            <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50 / page</option>
            <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100 / page</option>
        </select>
    `;

    pagination.innerHTML = html;

    // Attach event listeners for pagination buttons (using event delegation pattern)
    pagination.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page) && !btn.disabled) {
                goToPage(page);
            }
        });
    });

    // Attach event listener for items per page select
    const perPageSelect = pagination.querySelector('.pagination-select[data-action="items-per-page"]');
    if (perPageSelect) {
        perPageSelect.addEventListener('change', (e) => {
            changeItemsPerPage(e.target.value);
        });
    }
}

function goToPage(page) {
    currentPage = page;
    applyFilters(false);
    const table = document.getElementById('tier-list-table');
    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function changeItemsPerPage(value) {
    itemsPerPage = parseInt(value);
    currentPage = 1;
    applyFilters(false);
}

// =============================================================================
// ITEMS
// =============================================================================

async function refreshItems() {
    const grid = document.getElementById('items-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="tierlist-loading" style="grid-column: 1/-1;">
                <div class="tierlist-loading-content">
                    <div class="spinner-ring"></div>
                    <div class="loading-text">Loading Items...</div>
                </div>
            </div>
        `;
    }
    document.getElementById('items-pagination').innerHTML = '';

    // Load patch version
    try {
        const patchVersion = await getDDragonVersion();
        const patchBadge = document.getElementById('items-patch-version');
        if (patchBadge) {
            patchBadge.textContent = `Patch ${patchVersion}`;
        }
    } catch (e) {
        console.error('Failed to load patch version:', e);
    }

    const data = await getItemsData();

    if (data && data.items && data.items.length > 0) {
        allItems = data.items;
        itemsVersion = data.version || itemsVersion;
        filterItems();
    } else {
        if (grid) grid.innerHTML = '<div class="loading-cell">Failed to load items</div>';
    }
}

function filterItems(resetPage = true) {
    if (resetPage) itemsPage = 1;

    const category = document.getElementById('item-category').value;
    const statType = document.getElementById('item-stat').value;
    const priceRange = document.getElementById('item-price').value;
    const efficiencyFilter = document.getElementById('item-efficiency').value;
    const searchText = document.getElementById('item-search').value.toLowerCase();

    filteredItems = allItems.filter((item) => {
        // Category filter (basic/epic/legendary) - derive from gold_cost
        let itemCategory = 'basic';
        const goldCost = item.gold_cost || 0;
        if (goldCost >= 2500) itemCategory = 'legendary';
        else if (goldCost >= 1000) itemCategory = 'epic';
        const matchCategory = category === 'all' || itemCategory === category;

        // Stat filter - check tags from API
        const matchStat = statType === 'all' || (item.tags && item.tags.some(tag => {
            const tagLower = tag.toLowerCase();
            if (statType === 'ad') return tagLower === 'damage';
            if (statType === 'ap') return tagLower === 'spellblock' || tagLower === 'magicpenetration';
            if (statType === 'health') return tagLower === 'health';
            if (statType === 'armor') return tagLower === 'armor';
            if (statType === 'mr') return tagLower === 'spellblock';
            if (statType === 'as') return tagLower === 'attackspeed';
            if (statType === 'crit') return tagLower === 'criticalstrike';
            return false;
        }));

        const matchSearch = item.name.toLowerCase().includes(searchText);

        // Price filter - use gold_cost from API
        let matchPrice = true;
        if (priceRange !== 'all') {
            switch (priceRange) {
                case '0-1000':
                    matchPrice = goldCost < 1000;
                    break;
                case '1000-2000':
                    matchPrice = goldCost >= 1000 && goldCost < 2000;
                    break;
                case '2000-3000':
                    matchPrice = goldCost >= 2000 && goldCost < 3000;
                    break;
                case '3000+':
                    matchPrice = goldCost >= 3000;
                    break;
            }
        }

        // Efficiency filter - use gold_efficiency from API directly
        let matchEfficiency = true;
        if (efficiencyFilter !== 'all') {
            const eff = item.gold_efficiency;
            if (eff === null || eff === undefined) {
                matchEfficiency = false;
            } else {
                switch (efficiencyFilter) {
                    case 'high':
                        matchEfficiency = eff >= 100;
                        break;
                    case 'medium':
                        matchEfficiency = eff >= 95 && eff < 100;
                        break;
                    case 'low':
                        matchEfficiency = eff < 95;
                        break;
                }
            }
        }

        return matchCategory && matchStat && matchSearch && matchPrice && matchEfficiency;
    });

    const totalPages = Math.ceil(filteredItems.length / itemsPerPageGrid);
    const startIndex = (itemsPage - 1) * itemsPerPageGrid;
    const pageData = filteredItems.slice(startIndex, startIndex + itemsPerPageGrid);

    updateItemsGrid(pageData);
    updateItemsPagination(totalPages);
}

// Helper function to format raw stats for display
function formatRawStats(rawStats) {
    if (!rawStats || Object.keys(rawStats).length === 0) {
        return '';
    }

    const statNames = {
        FlatPhysicalDamageMod: { name: 'AD', icon: '⚔️' },
        FlatMagicDamageMod: { name: 'AP', icon: '✨' },
        FlatArmorMod: { name: 'Armor', icon: '🛡️' },
        FlatSpellBlockMod: { name: 'MR', icon: '🔮' },
        FlatHPPoolMod: { name: 'HP', icon: '❤️' },
        FlatMPPoolMod: { name: 'Mana', icon: '💧' },
        PercentAttackSpeedMod: { name: 'AS', icon: '⚡', isPercent: true },
        FlatCritChanceMod: { name: 'Crit', icon: '💥', isPercent: true },
        FlatMovementSpeedMod: { name: 'MS', icon: '👟' },
        PercentMovementSpeedMod: { name: 'MS', icon: '👟', isPercent: true },
        FlatHPRegenMod: { name: 'HP Regen', icon: '💚' },
        FlatMPRegenMod: { name: 'Mana Regen', icon: '💙' },
        PercentLifeStealMod: { name: 'Lifesteal', icon: '🩸', isPercent: true }
    };

    const formatted = [];
    for (const [key, value] of Object.entries(rawStats)) {
        if (value === 0) continue;
        const stat = statNames[key];
        if (stat) {
            let displayValue = stat.isPercent ? `${Math.round(value * 100)}%` : `+${Math.round(value)}`;
            formatted.push(`<span class="stat-tag">${stat.icon} ${displayValue} ${stat.name}</span>`);
        }
    }

    return formatted.join(' ');
}

function updateItemsGrid(items) {
    const grid = document.getElementById('items-grid');
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = '<div class="loading-cell">No items found</div>';
        return;
    }

    grid.innerHTML = items
        .map((item) => {
            // Use gold_efficiency directly from API (e.g., 104.22 for Bastionbreaker)
            const efficiencyValue = item.gold_efficiency;

            // Handle null efficiency (items without calculable stats)
            let efficiencyClass = 'efficiency-na';
            let efficiencyText = 'N/A';

            if (efficiencyValue !== null && efficiencyValue !== undefined) {
                // Format with 1 decimal place (104.22 → "104.2%")
                efficiencyText = `${parseFloat(efficiencyValue).toFixed(1)}%`;
                if (efficiencyValue >= 100) {
                    efficiencyClass = 'efficiency-high';
                } else if (efficiencyValue >= 95) {
                    efficiencyClass = 'efficiency-medium';
                } else {
                    efficiencyClass = 'efficiency-low';
                }
            }

            // Format stats from API
            const statsDisplay = item.stats ? formatRawStats(item.stats) : 'Passive effects';

            // Generate image URL from item ID using API version
            const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${itemsVersion}/img/item/${item.id}.png`;

            return `
            <div class="item-card">
                <img src="${imageUrl}" alt="${item.name}" class="item-icon" onerror="this.style.display='none'">
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-gold"><i class="fas fa-coins"></i> ${item.gold_cost} gold</div>
                    <div class="item-stats">${statsDisplay || 'Passive effects'}</div>
                    <span class="item-efficiency ${efficiencyClass}">${efficiencyText} efficient</span>
                </div>
            </div>
        `;
        })
        .join('');
}

function updateItemsPagination(totalPages) {
    const pagination = document.getElementById('items-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = `<span class="pagination-info">${filteredItems.length} items</span>`;
        return;
    }

    let html = `
        <button class="pagination-btn" data-items-page="${itemsPage - 1}" ${itemsPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    const startPage = Math.max(1, itemsPage - 2);
    const endPage = Math.min(totalPages, itemsPage + 2);

    if (startPage > 1) {
        html += `<button class="pagination-btn" data-items-page="1">1</button>`;
        if (startPage > 2) html += `<span class="pagination-info">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === itemsPage ? 'active' : ''}" data-items-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="pagination-info">...</span>`;
        html += `<button class="pagination-btn" data-items-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
        <button class="pagination-btn" data-items-page="${itemsPage + 1}" ${itemsPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
        <span class="pagination-info">${filteredItems.length} items</span>
    `;

    pagination.innerHTML = html;

    // Attach event listeners for items pagination buttons
    pagination.querySelectorAll('.pagination-btn[data-items-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.itemsPage);
            if (!isNaN(page) && !btn.disabled) {
                goToItemsPage(page);
            }
        });
    });
}

function goToItemsPage(page) {
    itemsPage = page;
    filterItems(false);
    const grid = document.getElementById('items-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =============================================================================
// BUILDS
// =============================================================================

/**
 * Load champion grid for the build selector.
 * Replaces the old dropdown with a searchable icon grid.
 * @returns {Promise<void>}
 */
async function loadChampionGrid() {
    const searchInput = document.getElementById('champion-search');
    const grid = document.getElementById('champion-grid');

    if (!searchInput || !grid) return;

    // Show loading state
    grid.innerHTML = '<div class="search-empty"><i class="fas fa-spinner fa-spin"></i>Loading champions...</div>';
    grid.classList.add('visible');

    // Load champions list (separate from tierlist data)
    if (buildChampions.length === 0) {
        const champions = await getChampionList();
        if (champions && champions.length > 0) {
            buildChampions = champions;
        }
    }

    if (buildChampions.length === 0) {
        grid.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-triangle"></i>Failed to load champions</div>';
        return;
    }

    filteredChampionsBuild = [...buildChampions];
    updateChampionGrid();
    championListLoaded = true;

    // Hide grid initially
    grid.classList.remove('visible');
}

/**
 * Update the champion grid with filtered results.
 * @returns {void}
 */
function updateChampionGrid() {
    const grid = document.getElementById('champion-grid');
    if (!grid) return;

    if (filteredChampionsBuild.length === 0) {
        grid.innerHTML = '<div class="search-empty"><i class="fas fa-search"></i>Aucun champion trouve</div>';
        return;
    }

    grid.innerHTML = filteredChampionsBuild.map(champ => `
        <button class="champ-btn ${selectedChampion === champ.id ? 'active' : ''}"
                data-id="${champ.id}"
                data-name="${champ.name}"
                title="${champ.name}">
            <img src="${champ.image}" alt="${champ.name}"
                 onerror="this.src='https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Aatrox.png'">
            <div class="champ-name">${champ.name}</div>
        </button>
    `).join('');

    // Add click handlers to all champion buttons
    grid.querySelectorAll('.champ-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const champId = btn.dataset.id;
            const champName = btn.dataset.name;
            selectChampion(champId, champName);
        });
    });
}

/**
 * Select a champion from the grid and load their build.
 * @param {string} champId - Champion ID
 * @param {string} champName - Champion name
 * @returns {Promise<void>}
 */
async function selectChampion(champId, champName) {
    selectedChampion = champId;
    selectedChampionName = champName;

    // Update UI
    const searchInput = document.getElementById('champion-search');
    const grid = document.getElementById('champion-grid');

    if (searchInput) {
        searchInput.value = champName;
        // Update clear button visibility
        const wrapper = searchInput.closest('.search-input-wrapper');
        if (wrapper) {
            wrapper.classList.add('has-value');
        }
    }

    // Update active state
    document.querySelectorAll('.champ-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === champId);
    });

    // Hide the grid
    if (grid) {
        grid.classList.remove('visible');
    }

    // Load the build
    await loadChampionBuild(champName);
}

// Legacy function name for compatibility
async function loadChampionList() {
    await loadChampionGrid();
}

// =============================================================================
// BUILD LOADING - API automatically aggregates Diamond+ data
// =============================================================================

/**
 * Load and display champion build from the API.
 * Uses Diamond+ aggregated data for optimal statistics.
 * Uses request ID to ignore stale responses when user changes selection quickly.
 * @param {string|null} champNameOverride - Optional champion name to use instead of input value
 * @returns {Promise<void>}
 */
async function loadChampionBuild(champNameOverride = null) {
    const searchInput = document.getElementById('champion-search');
    const championName = champNameOverride || searchInput?.value || selectedChampionName;
    const lane = document.getElementById('role-select').value;
    const container = document.getElementById('build-container');
    const cacheInfo = document.getElementById('build-cache-info');

    if (!championName) {
        container.innerHTML = `
            <div class="build-placeholder">
                <i class="fas fa-hammer"></i>
                <p>Select a champion to view their build</p>
            </div>
        `;
        if (cacheInfo) cacheInfo.innerHTML = '';
        const qualityIndicator = document.getElementById('build-quality-indicator');
        if (qualityIndicator) qualityIndicator.innerHTML = '';
        return;
    }

    // Increment request ID to track this specific request
    const thisRequestId = ++buildRequestId;
    console.log(`[Build] Request #${thisRequestId}: ${championName} ${lane}`);

    // Show loading spinner with champion name
    container.innerHTML = `
        <div class="build-loading-spinner">
            <div class="spinner-container">
                <div class="spinner-ring-outer"></div>
                <div class="spinner-ring-inner"></div>
                <i class="fas fa-bolt spinner-icon"></i>
            </div>
            <div class="loading-champion">${championName}</div>
            <div class="loading-text">Loading build...</div>
            <div class="loading-progress">
                <div class="loading-progress-bar"></div>
            </div>
        </div>
    `;

    // Fetch build from API
    const build = await getChampionBuild(championName, lane);

    // Check if this request is still the latest one
    if (thisRequestId !== buildRequestId) {
        console.log(`[Build] Request #${thisRequestId} ignored (stale - current is #${buildRequestId})`);
        return; // Ignore stale response
    }

    if (build && build.success) {
        currentBuild = build;
        renderBuild(build);
        updateCacheIndicator(build);
        updateQualityIndicator(build);
        console.log(`[Build] Request #${thisRequestId} completed: ${championName} ${lane}`);
    } else {
        const errorMsg = build?.error || 'Unknown error';
        container.innerHTML = `
            <div class="build-error">
                <i class="fas fa-exclamation-circle"></i>
                <div class="error-title">Failed to load</div>
                <div class="error-message">${errorMsg}</div>
                <button class="retry-btn" onclick="loadChampionBuild()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
        if (cacheInfo) cacheInfo.innerHTML = '';
        const qualityIndicator = document.getElementById('build-quality-indicator');
        if (qualityIndicator) qualityIndicator.innerHTML = '';
    }
}

/**
 * Force refresh the build data, bypassing cache.
 * @returns {Promise<void>}
 */
async function forceRefreshBuild() {
    const searchInput = document.getElementById('champion-search');
    const championName = searchInput?.value || selectedChampionName;
    const lane = document.getElementById('role-select').value;
    const container = document.getElementById('build-container');
    const refreshBtn = document.getElementById('build-refresh-btn');
    const cacheInfo = document.getElementById('build-cache-info');

    if (!championName) {
        return;
    }

    // Increment request ID to track this specific request
    const thisRequestId = ++buildRequestId;
    console.log(`[Build] Force refresh #${thisRequestId}: ${championName} ${lane}`);

    // Disable refresh button during loading
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualisation...';
    }

    // Show loading spinner
    container.innerHTML = `
        <div class="build-loading-spinner">
            <div class="spinner-container">
                <div class="spinner-ring-outer"></div>
                <div class="spinner-ring-inner"></div>
                <i class="fas fa-bolt spinner-icon"></i>
            </div>
            <div class="loading-champion">${championName}</div>
            <div class="loading-text">Refreshing data...</div>
            <div class="loading-progress">
                <div class="loading-progress-bar"></div>
            </div>
        </div>
    `;

    // Force refresh from API (bypass cache)
    const build = await getChampionBuild(championName, lane, true);

    // Re-enable refresh button
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    }

    // Check if this request is still the latest one
    if (thisRequestId !== buildRequestId) {
        console.log(`[Build] Force refresh #${thisRequestId} ignored (stale)`);
        return;
    }

    if (build && build.success) {
        currentBuild = build;
        renderBuild(build);
        updateCacheIndicator(build);
        updateQualityIndicator(build);
        // Show success feedback
        showToast('Data refreshed successfully!', 'success');
        console.log(`[Build] Force refresh #${thisRequestId} completed`);
    } else {
        const errorMsg = build?.error || 'Unknown error';
        container.innerHTML = `
            <div class="build-error">
                <i class="fas fa-exclamation-circle"></i>
                <div class="error-title">Refresh failed</div>
                <div class="error-message">${errorMsg}</div>
                <button class="retry-btn" onclick="forceRefreshBuild()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
        if (cacheInfo) cacheInfo.innerHTML = '';
        const qualityIndicator = document.getElementById('build-quality-indicator');
        if (qualityIndicator) qualityIndicator.innerHTML = '';
    }
}

/**
 * Update data quality indicator based on games count.
 * High: >100 games, Medium: 10-100 games, Low: <10 games
 */
function updateQualityIndicator(build) {
    const indicator = document.getElementById('build-quality-indicator');
    if (!indicator) return;

    const gamesCount = build.games || 0;

    if (gamesCount === 0) {
        indicator.innerHTML = '';
        indicator.className = 'quality-indicator';
        return;
    }

    let qualityClass, icon, text;

    if (gamesCount >= 100) {
        qualityClass = 'quality-high';
        icon = 'fa-check-circle';
        text = 'High quality';
    } else if (gamesCount >= 10) {
        qualityClass = 'quality-medium';
        icon = 'fa-info-circle';
        text = 'Medium quality';
    } else {
        qualityClass = 'quality-low';
        icon = 'fa-exclamation-triangle';
        text = 'Low data';
    }

    const gamesStr = gamesCount >= 1000 ? `${(gamesCount / 1000).toFixed(1)}k` : gamesCount.toString();
    indicator.innerHTML = `<i class="fas ${icon}"></i> ${text} (${gamesStr} games)`;
    indicator.className = `quality-indicator ${qualityClass}`;
    indicator.title = `Build statistics based on ${gamesCount} games from Diamond+ ranks`;
}

/**
 * Update cache indicator with color coding
 * Green: <6h, Orange: 6-24h, Red: >24h
 */
function updateCacheIndicator(build) {
    const cacheInfo = document.getElementById('build-cache-info');
    if (!cacheInfo) return;

    if (build.cached && build.cache_age_hours !== null && build.cache_age_hours !== undefined) {
        const hours = build.cache_age_hours;
        let colorClass = 'cache-fresh'; // Green
        let icon = 'fa-check-circle';

        if (hours >= 24) {
            colorClass = 'cache-old'; // Red
            icon = 'fa-exclamation-triangle';
        } else if (hours >= 6) {
            colorClass = 'cache-medium'; // Orange
            icon = 'fa-clock';
        }

        const timeStr = hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)}h`;

        cacheInfo.innerHTML = `<span class="cache-badge ${colorClass}"><i class="fas ${icon}"></i> Updated ${timeStr} ago</span>`;
        cacheInfo.title = 'Click Refresh to update data';
    } else {
        cacheInfo.innerHTML = `<span class="cache-badge cache-fresh"><i class="fas fa-bolt"></i> Fresh data</span>`;
    }
}

/**
 * Show a toast notification message.
 * @param {string} message - Message to display
 * @param {string} [type='info'] - Notification type ('info', 'success', 'error')
 * @returns {void}
 */
function showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const iconMap = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${iconMap[type] || 'info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);

    // Auto remove after 3 seconds (slightly longer for info toasts)
    const duration = type === 'info' ? 2000 : 3000;
    setTimeout(() => toast.remove(), duration);
}

// =============================================================================
// LEAGUE CLIENT IMPORT FUNCTIONALITY
// =============================================================================

/**
 * Import the current build into the League of Legends client.
 *
 * ## Third-Party Application Compliance
 *
 * This function is designed to comply with Riot Games' third-party application policy:
 * - It is ONLY triggered by explicit user action (clicking the "Import Build" button)
 * - It makes a SINGLE request per user action (no loops, no spam, no automation)
 * - It only uses the official League Client local API endpoints
 * - It does NOT send any keyboard or mouse inputs to the game
 * - The same configurations can be set manually in the client
 *
 * The purpose is to help players configure their rune pages and item sets faster,
 * NOT to provide any unfair competitive advantage. All data imported is publicly
 * available and can be configured manually.
 *
 * Reference: https://support-leagueoflegends.riotgames.com/hc/en-us/articles/225266848-Third-Party-Applications
 *
 * @returns {Promise<void>}
 */
async function importBuildToClient() {
    console.log('[Import] Button clicked, currentBuild:', currentBuild);

    // Validate that we have a build to import
    if (!currentBuild) {
        showToast('No build selected. Please select a champion first.', 'error');
        return;
    }

    // Get the import button and show loading state
    const importBtn = document.getElementById('import-build-btn');
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    }

    try {
        // Check if Tauri invoke is available
        if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
            console.error('[Import] Tauri API not available');
            throw new Error('Tauri API not available. Are you running in the Tauri app?');
        }

        console.log('[Import] Tauri API available, building payload...');

        // Build the full payload for FocusApi /lol/import-payload
        const payload = buildImportPayload(currentBuild);

        console.log('[Import] Payload built:', JSON.stringify(payload, null, 2));

        // Call the Tauri command (single request, no loops)
        console.log('[Import] Calling Tauri command import_build_to_client...');
        const result = await window.__TAURI__.core.invoke('import_build_to_client', {
            payload: payload
        });

        console.log('[Import] Result:', result);

        // Show appropriate feedback based on result
        if (result.success) {
            let message = 'Build imported successfully!';
            if (result.runes_imported && result.items_imported) {
                message = 'Runes and items imported!';
            } else if (result.runes_imported) {
                message = 'Rune page imported!';
            } else if (result.items_imported) {
                message = 'Item set imported!';
            }
            showToast(message, 'success');
        } else {
            showToast(result.message || 'Import failed', 'error');
        }

    } catch (error) {
        console.error('[Import] Error caught:', error);
        console.error('[Import] Error type:', typeof error);
        console.error('[Import] Error keys:', error ? Object.keys(error) : 'null');

        // Handle specific error codes from the Tauri command
        let errorMessage = 'Failed to import build';

        // Tauri errors come as objects with code and message
        if (typeof error === 'object' && error !== null) {
            if (error.code === 'CLIENT_NOT_RUNNING') {
                errorMessage = 'League Client not running. Start the client first!';
            } else if (error.code === 'API_ERROR' || error.code === 'HTTP_ERROR') {
                errorMessage = error.message || 'API error';
            } else if (error.code === 'PARSE_ERROR') {
                errorMessage = 'Invalid response from server';
            } else if (error.message) {
                errorMessage = error.message;
            } else {
                errorMessage = JSON.stringify(error);
            }
        } else if (typeof error === 'string') {
            errorMessage = error;
        }

        console.error('[Import] Showing error toast:', errorMessage);
        showToast(errorMessage, 'error');
    } finally {
        // Restore button state
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = '<i class="fas fa-download"></i> Import to LoL';
        }
    }
}

/**
 * Build the import payload from the current build data.
 * Transforms the frontend build structure into the FocusApi request format.
 *
 * @param {Object} build - The current build data
 * @returns {Object} The payload for FocusApi /lol/import-payload
 */
function buildImportPayload(build) {
    // Get role from build, UI selector, or default to 'mid' (most common fallback)
    let role = build.role || document.getElementById('role-select')?.value || 'default';

    // Normalize role for Practice Tool or when no role is set
    if (role === 'default' || role === '' || !role) {
        // Use the role from the UI if available, otherwise fallback to 'mid'
        role = document.getElementById('role-select')?.value || 'mid';
        console.log('[Import] No role detected, using fallback:', role);
    }

    // Extract rune tree IDs from keystone (primary) and first secondary rune
    // Keystone IDs: 8000 (Precision), 8100 (Domination), 8200 (Sorcery), 8300 (Inspiration), 8400 (Resolve)
    const keystoneId = build.runes?.keystone || 0;
    const primaryTreeId = Math.floor(keystoneId / 100) * 100; // e.g., 8010 -> 8000

    // Get secondary tree from first secondary rune
    const firstSecondaryRune = build.runes?.secondary?.[0];
    const secondaryTreeId = firstSecondaryRune ? Math.floor(firstSecondaryRune.id / 100) * 100 : 8200;

    // Extract primary rune IDs (keystone + 3 primary runes)
    const primaryRuneIds = [
        keystoneId,
        ...(build.runes?.primary || []).map(r => r.id || r)
    ].filter(id => id);

    // Extract secondary rune IDs (2 runes)
    const secondaryRuneIds = (build.runes?.secondary || [])
        .map(r => r.id || r)
        .filter(id => id);

    // Extract stat shards (3 shards)
    const runeShards = (build.runes?.shards || build.stat_shards || [])
        .map(s => s.id || s)
        .filter(id => id);

    // Extract item IDs
    const itemsStarting = (build.items?.starting || [])
        .map(i => parseInt(i.id || i, 10))
        .filter(id => !isNaN(id));

    const itemsCore = (build.items?.core || [])
        .map(i => parseInt(i.id || i, 10))
        .filter(id => !isNaN(id));

    const itemsSituational = [
        ...(build.items?.full_build || []),
        ...(build.items?.situational || [])
    ]
        .map(i => parseInt(i.id || i, 10))
        .filter(id => !isNaN(id));

    const bootsId = build.items?.boots
        ? parseInt(build.items.boots.id || build.items.boots, 10)
        : null;

    // Extract summoner spells
    const summonerSpells = (build.summoners || [])
        .map(s => s.id || s)
        .filter(id => id);

    // Get champion ID from the champion list if available
    const championData = allChampions.find(c =>
        c.name?.toLowerCase() === build.champion?.toLowerCase() ||
        c.id?.toLowerCase() === build.champion?.toLowerCase()
    );
    const championId = championData?.key ? parseInt(championData.key, 10) : 0;

    return {
        boots: bootsId,
        champion_id: championId,
        champion_key: build.champion,
        items_core: itemsCore,
        items_situational: itemsSituational,
        items_starting: itemsStarting,
        patch: build.patch || "current",
        role: role,
        rune_shards: runeShards,
        runes_primary: {
            rune_ids: primaryRuneIds,
            tree_id: primaryTreeId
        },
        runes_secondary: {
            rune_ids: secondaryRuneIds,
            tree_id: secondaryTreeId
        },
        source: "FocusApp",
        summoner_spells: summonerSpells,
        title: `${build.champion} ${role.toUpperCase()}`
    };
}

/**
 * Check if the League Client is currently running.
 * Updates the import button state accordingly.
 *
 * @returns {Promise<boolean>} Whether the client is running
 */
async function checkLeagueClientStatus() {
    try {
        if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
            console.log('[Import] Tauri not available for client check');
            return false;
        }

        const isRunning = await window.__TAURI__.core.invoke('is_league_client_running');
        console.log('[Import] League Client running:', isRunning);
        return isRunning;
    } catch (error) {
        console.warn('[Import] Could not check League Client status:', error);
        return false;
    }
}

/**
 * Update the import button state based on League Client status.
 * Called after rendering a build to enable/disable the button.
 */
async function updateImportButtonState() {
    const importBtn = document.getElementById('import-build-btn');
    if (!importBtn) return;

    const isClientRunning = await checkLeagueClientStatus();

    if (isClientRunning) {
        importBtn.disabled = false;
        importBtn.innerHTML = '<i class="fas fa-download"></i> Import to LoL';
        importBtn.title = 'Import runes and item set to League Client';
        importBtn.classList.remove('btn-disabled');
    } else {
        importBtn.disabled = true;
        importBtn.innerHTML = '<i class="fas fa-plug"></i> LoL Client Offline';
        importBtn.title = 'Start League of Legends client to enable import';
        importBtn.classList.add('btn-disabled');
    }
}

// =============================================================================
// AUTO-IMPORT FUNCTIONALITY
// =============================================================================

/**
 * Toggle auto-import feature on/off.
 * When enabled, monitors Live Client Data for champion picks and auto-imports builds.
 *
 * ## Riot Games Compliance
 * - Uses official Live Client Data API (https://developer.riotgames.com/docs/lol#game-client-api)
 * - Only reads data, no synthetic inputs
 * - User must explicitly enable this feature (opt-in)
 * - Can be disabled at any time
 *
 * @param {boolean} enabled - Whether to enable auto-import
 */
function toggleAutoImport(enabled) {
    autoImportEnabled = enabled;
    console.log(`[AutoImport] ${enabled ? 'Enabled' : 'Disabled'}`);

    // Save preference to localStorage
    localStorage.setItem('focusapp_autoimport', enabled ? 'true' : 'false');

    // Update UI toggle state
    const toggle = document.getElementById('auto-import-toggle');
    if (toggle) {
        toggle.checked = enabled;
    }

    const statusEl = document.getElementById('auto-import-status');
    if (statusEl) {
        statusEl.textContent = enabled ? 'ON' : 'OFF';
        statusEl.className = `auto-import-status ${enabled ? 'status-on' : 'status-off'}`;
    }

    if (enabled) {
        startAutoImportListener();
    } else {
        stopAutoImportListener();
    }
}

/**
 * Start polling Live Client Data for champion select detection.
 * Polls every 2 seconds to detect when user picks a champion.
 */
function startAutoImportListener() {
    if (autoImportPollInterval) {
        clearInterval(autoImportPollInterval);
    }

    console.log('[AutoImport] Starting Live Client Data listener...');

    // Reset state
    lastAutoImportedChampion = null;
    inChampionSelect = false;

    autoImportPollInterval = setInterval(async () => {
        try {
            await checkChampionSelectAndImport();
        } catch (error) {
            // Silently fail - client may not be in game/champ select
            console.debug('[AutoImport] Poll cycle:', error.message);
        }
    }, 2000);
}

/**
 * Stop the auto-import listener.
 */
function stopAutoImportListener() {
    if (autoImportPollInterval) {
        clearInterval(autoImportPollInterval);
        autoImportPollInterval = null;
    }
    lastAutoImportedChampion = null;
    inChampionSelect = false;
    console.log('[AutoImport] Listener stopped');
}

/**
 * Check champion select state and auto-import if a new champion is picked.
 * Uses LCU API to detect champion select phase and picked champion.
 */
async function checkChampionSelectAndImport() {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
        return;
    }

    try {
        // Try to get champion select session from LCU
        const session = await window.__TAURI__.core.invoke('get_champion_select_session_cmd');

        if (!session || !session.localPlayerCellId) {
            // Not in champion select
            if (inChampionSelect) {
                console.log('[AutoImport] Left champion select');
                inChampionSelect = false;
                lastAutoImportedChampion = null;
            }
            return;
        }

        inChampionSelect = true;

        // Find local player's pick
        const myActions = session.actions?.flat()?.filter(
            (a) => a.actorCellId === session.localPlayerCellId && a.type === 'pick'
        ) || [];

        const myPick = myActions.find((a) => a.championId && a.championId > 0 && a.completed);

        if (!myPick) {
            // No champion picked yet
            return;
        }

        const championId = myPick.championId;

        // Check if we already imported for this champion
        if (lastAutoImportedChampion === championId) {
            return;
        }

        console.log(`[AutoImport] Champion picked: ${championId}`);

        // Detect role from assigned position
        let role = 'mid'; // Default fallback
        const myTeam = session.myTeam || [];
        const myCell = myTeam.find((p) => p.cellId === session.localPlayerCellId);
        if (myCell && myCell.assignedPosition) {
            role = normalizeRole(myCell.assignedPosition);
        }

        // Get champion name from ID
        const championName = await getChampionNameFromId(championId);
        if (!championName) {
            console.warn(`[AutoImport] Unknown champion ID: ${championId}`);
            return;
        }

        // Mark as imported to prevent duplicates
        lastAutoImportedChampion = championId;

        // Auto-import the build
        await autoImportBuild(championName, role);

    } catch (error) {
        // Not in champion select or LCU not available
        if (inChampionSelect) {
            inChampionSelect = false;
            lastAutoImportedChampion = null;
        }
    }
}

/**
 * Normalize LCU position to role name.
 * @param {string} position - LCU position (e.g., "UTILITY", "BOTTOM")
 * @returns {string} Normalized role name
 */
function normalizeRole(position) {
    const roleMap = {
        'TOP': 'top',
        'JUNGLE': 'jungle',
        'MIDDLE': 'mid',
        'BOTTOM': 'adc',
        'UTILITY': 'support',
        'FILL': 'mid',
        '': 'mid'
    };
    return roleMap[position?.toUpperCase()] || 'mid';
}

/**
 * Normalize tier list role display to build role selector value.
 * @param {string} role - Role from tier list (e.g., "Top", "Mid", "ADC", "Support")
 * @returns {string} Normalized role for build selector
 */
function normalizeRoleForBuild(role) {
    const roleMap = {
        'top': 'top',
        'jungle': 'jungle',
        'mid': 'mid',
        'middle': 'mid',
        'adc': 'adc',
        'bottom': 'adc',
        'support': 'support',
        'utility': 'support'
    };
    return roleMap[role?.toLowerCase()] || 'mid';
}

/**
 * Navigate to builds tab and load a specific champion's build.
 * Called when clicking a champion row in the tier list.
 * @param {string} championName - Champion name
 * @param {string} role - Role for the build (top, jungle, mid, adc, support)
 */
async function navigateToBuildForChampion(championName, role) {
    console.log(`[Navigation] Loading build for ${championName} (${role})`);

    // Switch to builds tab
    switchTab('builds');

    // Show feedback toast
    showToast(`Loading ${championName} ${role.toUpperCase()} build...`, 'info');

    // Load champion grid if not already loaded
    if (buildChampions.length === 0) {
        await loadChampionGrid();
    }

    // Find champion in build champions list
    const champion = buildChampions.find(c =>
        c.name.toLowerCase() === championName.toLowerCase() ||
        c.id.toLowerCase() === championName.toLowerCase()
    );

    if (champion) {
        // Set role selector
        const roleSelect = document.getElementById('role-select');
        if (roleSelect) {
            roleSelect.value = role;
        }

        // Select champion and load build
        await selectChampion(champion.id, champion.name);
    } else {
        // Fallback: try to load build directly by name
        const roleSelect = document.getElementById('role-select');
        if (roleSelect) {
            roleSelect.value = role;
        }

        const searchInput = document.getElementById('champion-search');
        if (searchInput) {
            searchInput.value = championName;
            // Update clear button visibility
            const wrapper = searchInput.closest('.search-input-wrapper');
            if (wrapper) {
                wrapper.classList.add('has-value');
            }
        }

        selectedChampionName = championName;
        await loadChampionBuild(championName);
    }
}

/**
 * Get champion name from champion ID using cached champion list.
 * @param {number} championId - Champion ID
 * @returns {Promise<string|null>} Champion name or null
 */
async function getChampionNameFromId(championId) {
    // Use buildChampions cache if available
    if (buildChampions.length > 0) {
        const champ = buildChampions.find((c) => parseInt(c.key) === championId);
        if (champ) return champ.id; // Return the normalized ID (e.g., "LeeSin")
    }

    // Fallback: fetch champion list
    const { getChampionList } = await import('./api.js');
    const champions = await getChampionList();
    const champ = champions.find((c) => parseInt(c.key) === championId);
    return champ ? champ.id : null;
}

/**
 * Auto-import a build for a champion.
 * Fetches the build and imports runes + items to the client.
 *
 * @param {string} championName - Champion name (e.g., "Sion", "LeeSin")
 * @param {string} role - Role (e.g., "top", "jungle")
 */
async function autoImportBuild(championName, role) {
    console.log(`[AutoImport] Importing build for ${championName} ${role}...`);

    try {
        // Fetch build from API
        const { getChampionBuild } = await import('./api.js');
        const build = await getChampionBuild(championName, role);

        if (!build || !build.success) {
            console.warn(`[AutoImport] No build found for ${championName} ${role}`);
            showToast(`No build data for ${championName}`, 'warning');
            return;
        }

        // Store as current build for reference
        currentBuild = build;
        selectedChampionName = championName;

        // Build import payload
        const payload = buildImportPayload(build);

        // Import to client
        const result = await window.__TAURI__.core.invoke('import_build_to_client', {
            payload: payload
        });

        if (result.success) {
            const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
            showToast(`✓ ${championName} ${roleDisplay} build imported!`, 'success');
            console.log(`[AutoImport] Success: ${championName} ${role}`);
        } else {
            showToast(`Import failed: ${result.message}`, 'error');
        }

    } catch (error) {
        console.error('[AutoImport] Error:', error);
        showToast(`Auto-import failed: ${error.message}`, 'error');
    }
}

/**
 * Initialize auto-import from saved preference.
 */
function initAutoImport() {
    const saved = localStorage.getItem('focusapp_autoimport');
    const enabled = saved === 'true';

    // Set initial state without triggering listener yet
    autoImportEnabled = enabled;

    // Update toggle UI if it exists
    const toggle = document.getElementById('auto-import-toggle');
    if (toggle) {
        toggle.checked = enabled;
    }

    const statusEl = document.getElementById('auto-import-status');
    if (statusEl) {
        statusEl.textContent = enabled ? 'ON' : 'OFF';
        statusEl.className = `auto-import-status ${enabled ? 'status-on' : 'status-off'}`;
    }

    // Start listener if enabled
    if (enabled) {
        startAutoImportListener();
    }

    console.log(`[AutoImport] Initialized, enabled: ${enabled}`);
}

/**
 * Deduplicate items by ID.
 * Removes duplicate items from an array, keeping only the first occurrence.
 * @param {Array} items - Array of items (may contain duplicates)
 * @returns {Array} Array of unique items
 */
function deduplicateItems(items) {
    if (!items || !Array.isArray(items)) {
        return [];
    }

    const seen = new Set();
    const uniqueItems = [];

    for (const item of items) {
        if (!item) continue;

        const itemId = item.id || item;
        if (seen.has(itemId)) {
            console.log(`[Build] Duplicate item removed: ${item.name || itemId}`);
            continue;
        }

        seen.add(itemId);
        uniqueItems.push(item);
    }

    return uniqueItems;
}

/**
 * Render the champion build in the UI.
 * @param {Object} build - Build data from API
 * @returns {void}
 */
function renderBuild(build) {
    const container = document.getElementById('build-container');
    const laneSelect = document.getElementById('role-select');
    const laneDisplay = laneSelect ? laneSelect.selectedOptions[0].text : build.role;

    // Winrate badge with color coding (green >52%, red <48%)
    let winrateBadge = '';
    if (build.winrate !== null && build.winrate !== undefined) {
        let wr = parseFloat(build.winrate);
        // Backend sends decimal (0.833 = 83.3%), convert to percentage if needed
        if (wr <= 1) wr = wr * 100;
        let wrClass = 'winrate-medium';
        if (wr >= 52) wrClass = 'winrate-high';
        else if (wr < 48) wrClass = 'winrate-low';
        winrateBadge = `<span class="stat-badge ${wrClass}"><i class="fas fa-chart-line"></i> ${wr.toFixed(1)}% WR</span>`;
    }

    // Games badge
    let gamesBadge = '';
    const gamesCount = build.games || 0;
    if (gamesCount > 0) {
        const gamesStr = gamesCount >= 1000 ? `${(gamesCount / 1000).toFixed(1)}k` : gamesCount.toString();
        gamesBadge = `<span class="stat-badge games-badge"><i class="fas fa-gamepad"></i> Based on ${gamesStr} games</span>`;
    }

    // Low data warning removed - now using quality indicator in controls bar

    // === RUNES SECTION ===
    let runesHtml = '';
    if (build.runes) {
      const keystoneName = build.runes.keystone_name || "Keystone";

      // Primary tree runes (3 runes)
      const primaryRunesHtml = (build.runes.primary || [])
        .map(
          (r) =>
            `<img src="${r.icon}"
          alt="${r.name}"
          title="${r.name}"
          class="rune-icon small"
          onerror="this.onerror=null; this.src='${r.icon.replace(/\/[^\/]+\/([^\/]+)\.png$/, "/$1.png")}';">`,
        )
        .join("");

      // Secondary tree runes (2 runes)
      const secondaryRunesHtml = (build.runes.secondary || [])
        .map(
          (r) =>
            `<img src="${r.icon}" alt="${r.name}" title="${r.name}" class="rune-icon small">`,
        )
        .join("");

      // Stat Shards (3 shards) - vertical, small, no border - below secondary runes
      const statShards = build.stat_shards || build.runes?.shards || [];
      const shardsHtml = statShards
        .map((s) => {
          const winrateText = s.winrate
            ? ` - ${(s.winrate * 100).toFixed(1)}% WR`
            : "";
          // Generate icon URL if not provided
          const iconUrl =
            s.icon ||
            `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/${s.id}.png`;

          return `<div class="stat-shard-mini" title="${s.name}${winrateText}">
            <img src="${iconUrl}" alt="${s.name}" onerror="this.style.opacity='0.5'">
        </div>`;
        })
        .join("");

      runesHtml = `
    <div class="build-section runes-section">
        <h3><i class="fas fa-star"></i> Runes</h3>
        <div class="runes-container">
            <div class="rune-tree primary">
                <div class="rune-tree-header">
                    <span class="rune-tree-name">PRIMARY</span>
                </div>
                <div class="keystone-container">
                    <img src="${build.runes.keystone_icon}" alt="Keystone" title="${keystoneName}" class="rune-icon keystone" onerror="this.style.display='none'">
                </div>
                <div class="runes-list primary-runes">${primaryRunesHtml}</div>
            </div>
            <div class="rune-divider"></div>
            <div class="rune-tree secondary">
                <div class="rune-tree-header">
                    <span class="rune-tree-name">SECONDARY</span>
                </div>
                <div class="runes-list secondary-runes">${secondaryRunesHtml}</div>
                ${shardsHtml ? `
                <!-- STAT SHARDS: below secondary, vertical, small, no border -->
                <div class="stat-shards-vertical-container">
                    ${shardsHtml}
                </div>
                ` : ""}
            </div>
        </div>
    </div>
`;
    }

    // === SUMMONER SPELLS (Compact) ===
    let summonersHtml = '';
    if (build.summoners && build.summoners.length > 0) {
        const spellsHtml = build.summoners
            .map(
                (s) =>
                    `<div class="summoner-spell">
            <img src="${s.icon}" alt="${s.name}" title="${s.name}" class="summoner-icon-small" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/14.1.1/img/spell/SummonerFlash.png'">
        </div>`
            )
            .join('');

        summonersHtml = `
        <div class="build-section summoner-section">
            <h3><i class="fas fa-magic"></i> Summoners</h3>
            <div class="summoners-compact">${spellsHtml}</div>
        </div>
    `;
    }

    // === ITEMS ===
    let itemsHtml = '';
    if (build.items) {
        // Starting items (deduplicated)
        let startingHtml = '';
        const uniqueStartingItems = deduplicateItems(build.items.starting || []);
        if (uniqueStartingItems.length > 0) {
            const startItems = uniqueStartingItems
                .map(
                    (i) =>
                        `<img src="${i.icon}" alt="${i.name || 'Starting Item'}" title="${i.name || 'Starting Item'}" class="build-item small" onerror="this.style.display='none'">`
                )
                .join('');
            startingHtml = `
            <div class="items-group starting">
                <div class="items-row-label"><i class="fas fa-play"></i> STARTING</div>
                <div class="items-row">${startItems}</div>
            </div>
        `;
        }

        // Boots (separate section)
        let bootsHtml = '';
        if (build.items.boots) {
            const bootIcon = build.items.boots.icon || '';
            const bootName = build.items.boots.name || 'Boots';
            if (bootIcon) {
                bootsHtml = `
                <div class="items-group boots">
                    <div class="items-row-label"><i class="fas fa-shoe-prints"></i> BOOTS</div>
                    <div class="items-row">
                        <img src="${bootIcon}" alt="${bootName}" title="${bootName}" class="build-item" onerror="this.style.display='none'">
                    </div>
                </div>
            `;
            }
        }

        // Core items (deduplicated, WITHOUT boots)
        let coreHtml = '';
        const uniqueCoreItems = deduplicateItems(build.items.core || []);
        if (uniqueCoreItems.length > 0) {
            const bootsId = build.items.boots ? build.items.boots.id || build.items.boots : null;
            const coreItems = uniqueCoreItems
                .filter((item) => {
                    const itemId = item.id || item;
                    return itemId !== bootsId;
                })
                .map(
                    (i) =>
                        `<img src="${i.icon}" alt="${i.name || 'Core Item'}" title="${i.name || 'Core Item'}" class="build-item" onerror="this.style.display='none'">`
                )
                .join('');

            if (coreItems) {
                coreHtml = `
                <div class="items-group core">
                    <div class="items-row-label"><i class="fas fa-cube"></i> CORE BUILD</div>
                    <div class="items-row">${coreItems}</div>
                </div>
            `;
            }
        }

        // Recommended Items (Full Build + Situational combined, no duplicates)
        let recommendedHtml = '';
        const coreIds = (build.items.core || []).map((i) => i.id || i);
        const startingIds = (build.items.starting || []).map((i) => i.id || i);
        const bootsId = build.items.boots ? build.items.boots.id || build.items.boots : null;

        // Combine full_build and situational, removing duplicates and already-shown items
        const seenIds = new Set();
        const allRecommended = [...(build.items.full_build || []), ...(build.items.situational || [])].filter((item) => {
            const itemId = item.id || item;
            // Skip if already in core, starting, boots, or already seen
            if (coreIds.includes(itemId) || startingIds.includes(itemId) || itemId === bootsId || seenIds.has(itemId)) {
                return false;
            }
            seenIds.add(itemId);
            return true;
        });

        if (allRecommended.length > 0) {
            const recommendedItems = allRecommended
                .map(
                    (i) =>
                        `<img src="${i.icon}" alt="${i.name || 'Item'}" title="${i.name || 'Item'}" class="build-item" onerror="this.style.display='none'">`
                )
                .join('');

            recommendedHtml = `
            <div class="items-group recommended">
                <div class="items-row-label"><i class="fas fa-star"></i> RECOMMENDED</div>
                <div class="items-row">${recommendedItems}</div>
            </div>
        `;
        }

        itemsHtml = `
        <div class="build-section items-section">
            <h3><i class="fas fa-shopping-bag"></i> ITEMS</h3>
            <div class="items-build">
                ${startingHtml}
                ${bootsHtml}
                ${coreHtml}
                ${recommendedHtml}
            </div>
        </div>
    `;
    }

    // === SKILL ORDER ===
    let skillsHtml = '';
    if (build.skills && build.skills.order && build.skills.order.length > 0) {
        const skillOrder = build.skills.order
            .map((s) => `<span class="skill-key ${s.toLowerCase()}">${s}</span>`)
            .join('<i class="fas fa-chevron-right skill-arrow"></i>');

        skillsHtml = `
            <div class="build-section">
                <h3><i class="fas fa-sort-amount-up"></i> Skill Priority</h3>
                <div class="skill-max-order">${skillOrder}</div>
            </div>
        `;
    }

    // === RENDER ===
    container.innerHTML = `
        <div class="build-header">
            <div class="build-champion-info">
                <h2>${build.champion}</h2>
                <div class="build-meta">
                    <span class="role-badge"><i class="fas fa-map-marker-alt"></i> ${laneDisplay}</span>
                    ${winrateBadge}
                    ${gamesBadge}
                </div>
                <div class="data-source-badge">
                    <i class="fas fa-diamond"></i>
                    Diamond+ Data
                </div>
            </div>
            <!-- Import to LoL button - Requires explicit user click (compliance with Riot ToS) -->
            <div class="build-actions">
                <button id="import-build-btn" class="btn btn-import" onclick="importBuildToClient()" title="Import runes and item set to League Client">
                    <i class="fas fa-download"></i> Import to LoL
                </button>
                <div class="auto-import-container">
                    <label class="auto-import-label" title="Automatically import builds when you pick a champion in champ select">
                        <input type="checkbox" id="auto-import-toggle" onchange="toggleAutoImport(this.checked)">
                        <span class="toggle-slider"></span>
                        <span class="toggle-text">Auto-import</span>
                    </label>
                    <span id="auto-import-status" class="auto-import-status status-off">OFF</span>
                </div>
            </div>
        </div>

        <div class="build-sections">
            ${runesHtml}
            <div class="build-column-group">
                ${summonersHtml}
                ${skillsHtml}
            </div>
            ${itemsHtml}
        </div>
    `;

    // Update import button state based on League Client status
    updateImportButtonState();

    // BUG FIX: Restore auto-import toggle state after re-rendering
    // The toggle gets recreated in innerHTML, so we must restore its checked state
    initAutoImport();
}

// =============================================================================
// GLOBAL CHAMPION SEARCH
// =============================================================================

/**
 * Load champions for global search (uses localStorage cache).
 * @returns {Promise<void>}
 */
async function loadGlobalSearchChampions() {
    // Try localStorage cache first
    const cached = localStorage.getItem('focusapp_champions');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            // Check if cache is less than 24 hours old
            if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                globalSearchChampions = parsed.data;
                console.log(`[GlobalSearch] Loaded ${globalSearchChampions.length} champions from cache`);
                return;
            }
        } catch (e) {
            console.warn('[GlobalSearch] Cache parse error:', e);
        }
    }

    // Fetch fresh data
    const champions = await getChampionList();
    if (champions && champions.length > 0) {
        globalSearchChampions = champions;
        // Cache with timestamp
        localStorage.setItem('focusapp_champions', JSON.stringify({
            data: champions,
            timestamp: Date.now()
        }));
        console.log(`[GlobalSearch] Cached ${champions.length} champions`);
    }
}

/**
 * Perform global champion search with debounce.
 * Shows champion + role combinations based on tierlist data.
 * @param {string} query - Search query
 */
function globalSearch(query) {
    const dropdown = document.getElementById('global-search-results');
    if (!dropdown) return;

    // Clear previous debounce
    if (globalSearchDebounce) {
        clearTimeout(globalSearchDebounce);
    }

    // Hide if query too short
    if (query.length < 2) {
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
        globalSearchHighlightIndex = -1;
        return;
    }

    // Debounce 200ms
    globalSearchDebounce = setTimeout(() => {
        const queryLower = query.toLowerCase();

        // Find matching champions from DDragon list
        const matchingChampions = globalSearchChampions.filter(c =>
            c.name.toLowerCase().includes(queryLower) ||
            c.id.toLowerCase().includes(queryLower)
        ).slice(0, 6);

        // Build results with available roles from tierlist data
        const results = [];

        for (const champ of matchingChampions) {
            // Find this champion's roles from tierlist (allChampions contains role info)
            const tierlistEntries = allChampions.filter(tc =>
                tc.name.toLowerCase() === champ.name.toLowerCase()
            );

            // Get unique roles from all tierlist entries
            const roles = new Set();

            tierlistEntries.forEach(entry => {
                if (entry.role) {
                    // Parse role string (could be "Top", "Top, Mid", "Mid", etc.)
                    entry.role.split(',').forEach(r => {
                        let normalized = r.trim().toLowerCase();
                        // Normalize role names
                        if (normalized === 'middle') normalized = 'mid';
                        if (normalized === 'bottom') normalized = 'adc';
                        if (normalized === 'utility') normalized = 'support';
                        if (normalized && normalized !== 'flex') {
                            roles.add(normalized);
                        }
                    });
                }
            });

            // ALWAYS check flex picks mapping to add additional roles
            // Because tierlist "all" only shows primary role
            const flexRoles = getDefaultRolesForChampion(champ.name);
            flexRoles.forEach(r => roles.add(r));

            // If still no roles, default to mid
            if (roles.size === 0) {
                roles.add('mid');
            }

            // Add entry for each role
            roles.forEach(role => {
                results.push({
                    ...champ,
                    role: role,
                    roleDisplay: capitalizeRole(role)
                });
            });
        }

        // Sort results: group by champion name, then by role order
        const roleOrder = { 'top': 0, 'jungle': 1, 'mid': 2, 'adc': 3, 'support': 4 };
        results.sort((a, b) => {
            if (a.name !== b.name) return a.name.localeCompare(b.name);
            return (roleOrder[a.role] || 5) - (roleOrder[b.role] || 5);
        });

        renderGlobalSearchResults(results.slice(0, 10));
    }, 200);
}

/**
 * Capitalize role name for display.
 * @param {string} role - Role name
 * @returns {string} Capitalized role
 */
function capitalizeRole(role) {
    const roleMap = {
        'top': 'Top',
        'jungle': 'Jungle',
        'mid': 'Mid',
        'middle': 'Mid',
        'adc': 'ADC',
        'bottom': 'ADC',
        'support': 'Support',
        'utility': 'Support'
    };
    return roleMap[role.toLowerCase()] || role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Get default roles for a champion (common flex picks).
 * Used when champion is not found in current tierlist data.
 * @param {string} champName - Champion name
 * @returns {Array<string>} Array of role names
 */
function getDefaultRolesForChampion(champName) {
    // Common flex picks mapping
    const flexPicks = {
        'akali': ['mid', 'top'],
        'yone': ['mid', 'top'],
        'yasuo': ['mid', 'top', 'adc'],
        'sylas': ['mid', 'top', 'jungle'],
        'pantheon': ['mid', 'top', 'support'],
        'sett': ['top', 'mid', 'support'],
        'gragas': ['top', 'jungle', 'mid'],
        'karma': ['support', 'mid', 'top'],
        'lulu': ['support', 'mid'],
        'seraphine': ['support', 'mid', 'adc'],
        'swain': ['support', 'mid', 'adc'],
        'brand': ['support', 'mid'],
        'zyra': ['support', 'mid'],
        'xerath': ['support', 'mid'],
        'velkoz': ['support', 'mid'],
        'morgana': ['support', 'mid', 'jungle'],
        'neeko': ['mid', 'support', 'top'],
        'kennen': ['top', 'mid', 'adc'],
        'jayce': ['top', 'mid'],
        'gangplank': ['top', 'mid'],
        'quinn': ['top', 'mid', 'adc'],
        'vayne': ['adc', 'top'],
        'lucian': ['adc', 'mid'],
        'tristana': ['adc', 'mid'],
        'corki': ['mid', 'adc'],
        'ezreal': ['adc', 'mid'],
        'kaisa': ['adc', 'mid'],
        'viego': ['jungle', 'mid', 'top'],
        'lee sin': ['jungle', 'mid', 'top'],
        'leesin': ['jungle', 'mid', 'top'],
        'nidalee': ['jungle', 'mid'],
        'taliyah': ['jungle', 'mid'],
        'graves': ['jungle', 'top'],
        'kindred': ['jungle', 'adc'],
        'pyke': ['support', 'mid'],
        'senna': ['support', 'adc'],
        'heimerdinger': ['mid', 'top', 'support'],
        'zilean': ['support', 'mid'],
        'aurora': ['mid', 'top'],
        'ambessa': ['top', 'jungle'],
        'hwei': ['mid', 'support'],
        'smolder': ['adc', 'mid'],
        'naafiri': ['mid', 'jungle'],
        'milio': ['support'],
    };

    const normalized = champName.toLowerCase().replace(/['\s.]/g, '');
    return flexPicks[normalized] || ['mid']; // Default to mid if unknown
}

/**
 * Render global search results dropdown with roles.
 * @param {Array<Object>} matches - Matching champions with role info
 */
function renderGlobalSearchResults(matches) {
    const dropdown = document.getElementById('global-search-results');
    if (!dropdown) return;

    globalSearchHighlightIndex = -1;

    if (matches.length === 0) {
        dropdown.innerHTML = `
            <div class="global-search-empty">
                <i class="fas fa-search"></i>
                No champions found
            </div>
        `;
        dropdown.classList.add('visible');
        return;
    }

    const roleIcons = {
        'top': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png',
        'jungle': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png',
        'mid': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
        'middle': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
        'adc': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
        'bottom': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
        'support': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png',
        'utility': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png'
    };

    dropdown.innerHTML = matches.map((champ, index) => {
        const roleIcon = roleIcons[champ.role] || roleIcons['top'];
        const roleForApi = normalizeRoleForBuild(champ.roleDisplay);

        return `
            <div class="global-search-result" data-id="${champ.id}" data-name="${champ.name}" data-role="${roleForApi}" data-index="${index}">
                <img src="${champ.image}" alt="${champ.name}" class="global-search-champ-icon" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Aatrox.png'">
                <div class="global-search-result-info">
                    <div class="global-search-result-name">${champ.name}</div>
                    <div class="global-search-result-role">
                        <img src="${roleIcon}" alt="${champ.roleDisplay}" class="global-search-role-icon">
                        <span>${champ.roleDisplay}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    dropdown.classList.add('visible');

    // Add click handlers
    dropdown.querySelectorAll('.global-search-result').forEach(item => {
        item.addEventListener('click', () => {
            selectChampionFromGlobalSearch(item.dataset.id, item.dataset.name, item.dataset.role);
        });
    });
}

/**
 * Select champion from global search and navigate to builds.
 * @param {string} champId - Champion ID
 * @param {string} champName - Champion name
 * @param {string} role - Selected role (top, jungle, mid, adc, support)
 */
function selectChampionFromGlobalSearch(champId, champName, role = 'top') {
    const searchInput = document.getElementById('global-search');
    const dropdown = document.getElementById('global-search-results');

    // Clear search
    if (searchInput) searchInput.value = '';
    if (dropdown) {
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
    }
    globalSearchHighlightIndex = -1;

    // Switch to builds tab
    switchTab('builds');

    // Update the builds tab champion search
    const buildSearch = document.getElementById('champion-search');
    if (buildSearch) {
        buildSearch.value = champName;
        const wrapper = buildSearch.closest('.search-input-wrapper');
        if (wrapper) wrapper.classList.add('has-value');
    }

    // Set the role selector to match
    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
        roleSelect.value = role;
    }

    // Set the selected champion and load build
    selectedChampion = champId;
    selectedChampionName = champName;

    // Update champion grid selection
    document.querySelectorAll('.champ-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === champId);
    });

    // Hide champion grid
    const grid = document.getElementById('champion-grid');
    if (grid) grid.classList.remove('visible');

    // Load the build with the selected role
    loadChampionBuild(champName);

    console.log(`[GlobalSearch] Selected ${champName} ${role} -> Builds tab`);
}

/**
 * Handle keyboard navigation in global search.
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleGlobalSearchKeyboard(e) {
    const dropdown = document.getElementById('global-search-results');
    if (!dropdown || !dropdown.classList.contains('visible')) return;

    const items = dropdown.querySelectorAll('.global-search-result');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        globalSearchHighlightIndex = Math.min(globalSearchHighlightIndex + 1, items.length - 1);
        updateGlobalSearchHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        globalSearchHighlightIndex = Math.max(globalSearchHighlightIndex - 1, 0);
        updateGlobalSearchHighlight(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (globalSearchHighlightIndex >= 0 && items[globalSearchHighlightIndex]) {
            const item = items[globalSearchHighlightIndex];
            selectChampionFromGlobalSearch(item.dataset.id, item.dataset.name, item.dataset.role);
        } else if (items.length > 0) {
            // Select first result
            const firstItem = items[0];
            selectChampionFromGlobalSearch(firstItem.dataset.id, firstItem.dataset.name, firstItem.dataset.role);
        }
    } else if (e.key === 'Escape') {
        dropdown.classList.remove('visible');
        document.getElementById('global-search')?.blur();
        globalSearchHighlightIndex = -1;
    }
}

/**
 * Update highlight state for keyboard navigation.
 * @param {NodeList} items - Search result items
 */
function updateGlobalSearchHighlight(items) {
    items.forEach((item, index) => {
        item.classList.toggle('highlighted', index === globalSearchHighlightIndex);
    });

    // Scroll into view
    if (globalSearchHighlightIndex >= 0 && items[globalSearchHighlightIndex]) {
        items[globalSearchHighlightIndex].scrollIntoView({ block: 'nearest' });
    }
}

// =============================================================================
// CHANGELOG MANAGER - GitHub Releases & Commits
// =============================================================================

/**
 * ChangelogManager - Fetches and displays GitHub releases and commits.
 */
class ChangelogManager {
    constructor(repo = 'mhommet/FocusAPP') {
        this.repo = repo;
        this.releasesUrl = `https://api.github.com/repos/${repo}/releases?per_page=10`;
        this.loaded = false;
    }

    /**
     * Fetch using Tauri HTTP plugin (required for external URLs in built app).
     */
    async tauriFetch(url) {
        // Use Tauri's HTTP plugin if available (for built app)
        if (window.__TAURI__?.http?.fetch) {
            const response = await window.__TAURI__.http.fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'FocusApp/1.4.0'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            // Tauri v2 HTTP plugin uses same API as native fetch
            return await response.json();
        }
        // Fallback to native fetch (for dev mode / browser)
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    }

    /**
     * Fetch changelog data from GitHub API.
     */
    async fetchChangelog() {
        const container = document.getElementById('changelog-list');
        if (!container) return;

        // Show loading
        container.innerHTML = `
            <div class="changelog-loading">
                <div class="spinner-ring"></div>
                <span>Loading changelog...</span>
            </div>
        `;

        try {
            const releases = await this.tauriFetch(this.releasesUrl);
            this.renderChangelog(releases || []);
            this.loaded = true;
        } catch (error) {
            console.error('[Changelog] Fetch failed:', error);
            this.renderFallback();
        }
    }

    /**
     * Render changelog with releases only (no commits).
     */
    renderChangelog(releases) {
        const container = document.getElementById('changelog-list');
        if (!container) return;

        let html = '';

        if (releases && releases.length > 0) {
            releases.forEach((release) => {
                const date = new Date(release.published_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });

                // Format release notes - convert markdown to HTML
                let notes = release.body || '';
                if (notes) {
                    // Normalize line endings
                    notes = notes.replace(/\r\n/g, '\n');
                    // Remove # headers (title already shown)
                    notes = notes.replace(/^# .+$/gm, '');
                    // Convert ## headers to styled divs
                    notes = notes.replace(/^## (.+)$/gm, '<div class="release-subtitle">$1</div>');
                    // Convert ### headers to bold
                    notes = notes.replace(/^### (.+)$/gm, '<div class="release-section">$1</div>');
                    // Convert horizontal rules
                    notes = notes.replace(/^---+$/gm, '<hr>');
                    // Convert **bold**
                    notes = notes.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                    // Convert `code`
                    notes = notes.replace(/`([^`]+)`/g, '<code>$1</code>');
                    // Convert > blockquotes
                    notes = notes.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
                    // Convert markdown links
                    notes = notes.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
                    // Convert bare URLs to links
                    notes = notes.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
                    // Convert bullet lists (* or -)
                    notes = notes.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
                    // Convert numbered lists (1. 2. etc.)
                    notes = notes.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
                    // Wrap consecutive <li> in <ul>
                    notes = notes.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
                    // Convert double line breaks
                    notes = notes.replace(/\n\n+/g, '<br><br>');
                    // Convert single line breaks
                    notes = notes.replace(/\n/g, '<br>');
                    // Clean up extra breaks around block elements
                    notes = notes.replace(/<br>(<div|<ul|<hr|<blockquote)/g, '$1');
                    notes = notes.replace(/(<\/div>|<\/ul>|<hr>|<\/blockquote>)<br>/g, '$1');
                    notes = notes.replace(/<br><br><br>+/g, '<br><br>');
                }

                html += `
                    <div class="release-item">
                        <div class="release-header">
                            <span class="release-tag">${this.escapeHtml(release.tag_name)}</span>
                            <span class="release-date"><i class="fas fa-calendar"></i> ${date}</span>
                        </div>
                        <h4 class="release-title">${this.escapeHtml(release.name || release.tag_name)}</h4>
                        <div class="release-notes">${notes || '<em>No release notes</em>'}</div>
                        <a href="${release.html_url}" target="_blank" rel="noopener" class="release-link">
                            <i class="fab fa-github"></i> View on GitHub <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                `;
            });
        } else {
            html = `
                <div class="changelog-empty">
                    <i class="fas fa-scroll"></i>
                    <p>No releases available yet</p>
                </div>
            `;
        }

        container.innerHTML = html;
        console.log('[Changelog] HTML set, container children:', container.children.length);
    }

    /**
     * Render fallback content when API fails.
     */
    renderFallback() {
        const container = document.getElementById('changelog-list');
        if (!container) return;

        container.innerHTML = `
            <div class="changelog-section-title"><i class="fas fa-tag"></i> Latest Version</div>
            <div class="release-item">
                <div class="release-header">
                    <span class="release-tag">v1.4.0</span>
                    <span class="release-date"><i class="fas fa-calendar"></i> 27 Janvier 2026</span>
                </div>
                <h4 class="release-title">CSS Modular + Global Search + API Key</h4>
                <div class="release-notes">
- 9 fichiers CSS modulaires (Catppuccin Mocha)
- Global search champions avec roles
- API Key authentication
- Pagination fix pour Vite prod
- Triple Tonic rune fix
                </div>
            </div>
            <div class="changelog-error">
                <i class="fas fa-wifi"></i>
                <p>Unable to fetch live data from GitHub</p>
            </div>
        `;
    }

    /**
     * Escape HTML to prevent XSS.
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global changelog instance
let changelogManager = null;

/**
 * Initialize changelog manager.
 */
function initChangelog() {
    if (!changelogManager) {
        changelogManager = new ChangelogManager();
    }
    if (!changelogManager.loaded) {
        changelogManager.fetchChangelog();
    }
}

/**
 * Refresh changelog data.
 */
function refreshChangelog() {
    if (changelogManager) {
        changelogManager.fetchChangelog();
    }
}

// =============================================================================
// GLOBAL EXPORTS (pour compatibilité onclick inline)
// =============================================================================

// Export functions to window for inline onclick handlers
window.switchTab = switchTab;
window.refreshCurrentTab = refreshCurrentTab;
window.refreshTierList = refreshTierList;
window.filterByRole = filterByRole;
window.refreshItems = refreshItems;
window.loadChampionBuild = loadChampionBuild;
window.forceRefreshBuild = forceRefreshBuild;
window.sortTable = sortTable;
window.changeItemsPerPage = changeItemsPerPage;
window.goToPage = goToPage;
window.goToItemsPage = goToItemsPage;
window.applyFilters = applyFilters;
window.filterItems = filterItems;
window.retryBackendConnection = retryBackendConnection;
window.importBuildToClient = importBuildToClient;
window.updateImportButtonState = updateImportButtonState;
window.toggleAutoImport = toggleAutoImport;
window.initAutoImport = initAutoImport;
window.selectChampion = selectChampion;
window.loadChampionGrid = loadChampionGrid;
window.updateChampionGrid = updateChampionGrid;
window.updateSortIndicators = updateSortIndicators;
window.navigateToBuildForChampion = navigateToBuildForChampion;
window.normalizeRoleForBuild = normalizeRoleForBuild;
window.globalSearch = globalSearch;
window.selectChampionFromGlobalSearch = selectChampionFromGlobalSearch;
window.loadGlobalSearchChampions = loadGlobalSearchChampions;
window.initChangelog = initChangelog;
window.refreshChangelog = refreshChangelog;

// =============================================================================
// EVENT LISTENERS (Alternative aux onclick inline)
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 FocusApp loaded - Attaching event listeners');

    // Initialize app
    init();

    // Initialize auto-import feature (respects saved user preference)
    initAutoImport();

    // Periodically check League Client status to update import button
    // Check every 5 seconds to keep button state accurate
    setInterval(() => {
        const importBtn = document.getElementById('import-build-btn');
        if (importBtn) {
            updateImportButtonState();
        }
    }, 5000);

    // ✅ REFRESH BUTTON
    const refreshBtn = document.querySelector('.btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshCurrentTab);
        console.log('✅ Refresh button attached');
    }

    // ✅ TAB BUTTONS
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            console.log(`📑 Tab clicked: ${tab}`);
            switchTab(tab);
        });
    });
    console.log(`✅ ${tabButtons.length} tab buttons attached`);

    // ✅ ROLE FILTER BUTTONS
    const roleButtons = document.querySelectorAll('.role-filter-btn-small');
    roleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.dataset.role;
            console.log(`🎯 Role clicked: ${role}`);
            filterByRole(role);
        });
    });
    console.log(`✅ ${roleButtons.length} role buttons attached`);

    // ✅ SEARCH INPUT (tierlist)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keyup', applyFilters);
        console.log('✅ Search input attached');
    }

    // ✅ TABLE HEADERS (sorting)
    const tableHeaders = document.querySelectorAll('#tier-list-table th[data-sort]');
    tableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            console.log(`📊 Sorting by: ${column}`);
            sortTable(column);
        });
    });
    console.log(`✅ ${tableHeaders.length} table headers attached`);

    // ✅ CHAMPION SEARCH (builds tab - new grid system)
    const championSearch = document.getElementById('champion-search');
    const championGrid = document.getElementById('champion-grid');
    if (championSearch && championGrid) {
        // Live search filtering
        championSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();

            // Use buildChampions (separate from tierlist data)
            if (query.length === 0) {
                filteredChampionsBuild = [...buildChampions];
            } else {
                filteredChampionsBuild = buildChampions.filter(c =>
                    c.name.toLowerCase().includes(query) ||
                    c.id.toLowerCase().includes(query)
                );
            }

            updateChampionGrid();

            // Show grid when typing
            if (buildChampions.length > 0) {
                championGrid.classList.add('visible');
            }
        });

        // Show grid on focus (load champions if needed)
        championSearch.addEventListener('focus', async () => {
            if (buildChampions.length === 0 && !championListLoaded) {
                await loadChampionGrid();
            }
            if (buildChampions.length > 0) {
                filteredChampionsBuild = [...buildChampions];
                updateChampionGrid();
                championGrid.classList.add('visible');
            }
        });

        // Hide grid when clicking outside
        document.addEventListener('click', (e) => {
            const container = document.querySelector('.champion-search-container');
            if (container && !container.contains(e.target)) {
                championGrid.classList.remove('visible');
            }
        });

        // Keyboard navigation for champion grid
        let highlightedIndex = -1;

        function updateHighlight(newIndex) {
            const buttons = championGrid.querySelectorAll('.champ-btn');
            if (buttons.length === 0) return;

            // Remove previous highlight
            buttons.forEach(btn => btn.classList.remove('keyboard-highlight'));

            // Clamp index
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= buttons.length) newIndex = buttons.length - 1;

            highlightedIndex = newIndex;
            const highlightedBtn = buttons[highlightedIndex];
            if (highlightedBtn) {
                highlightedBtn.classList.add('keyboard-highlight');
                highlightedBtn.scrollIntoView({ block: 'nearest' });
            }
        }

        championSearch.addEventListener('keydown', (e) => {
            const buttons = championGrid.querySelectorAll('.champ-btn');
            const gridVisible = championGrid.classList.contains('visible');
            const cols = Math.floor(championGrid.offsetWidth / 58) || 6; // Approximate columns

            if (e.key === 'ArrowDown' && gridVisible) {
                e.preventDefault();
                updateHighlight(highlightedIndex + cols);
            } else if (e.key === 'ArrowUp' && gridVisible) {
                e.preventDefault();
                updateHighlight(highlightedIndex - cols);
            } else if (e.key === 'ArrowRight' && gridVisible) {
                e.preventDefault();
                updateHighlight(highlightedIndex + 1);
            } else if (e.key === 'ArrowLeft' && gridVisible) {
                e.preventDefault();
                updateHighlight(highlightedIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlightedIndex >= 0 && buttons[highlightedIndex]) {
                    const btn = buttons[highlightedIndex];
                    selectChampion(btn.dataset.id, btn.dataset.name);
                } else if (filteredChampionsBuild.length > 0) {
                    const firstChamp = filteredChampionsBuild[0];
                    selectChampion(firstChamp.id, firstChamp.name);
                }
                highlightedIndex = -1;
            } else if (e.key === 'Escape') {
                championGrid.classList.remove('visible');
                championSearch.blur();
                highlightedIndex = -1;
            }
        });

        // Reset highlight when input changes
        championSearch.addEventListener('input', () => {
            highlightedIndex = -1;
            // Update clear button visibility
            const wrapper = championSearch.closest('.search-input-wrapper');
            if (wrapper) {
                wrapper.classList.toggle('has-value', championSearch.value.length > 0);
            }
        });

        // Clear button functionality
        const clearBtn = document.getElementById('champion-search-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                championSearch.value = '';
                selectedChampion = null;
                selectedChampionName = null;
                filteredChampionsBuild = [...buildChampions];
                updateChampionGrid();
                championSearch.focus();

                // Update wrapper state
                const wrapper = championSearch.closest('.search-input-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('has-value');
                }

                // Clear build display
                const container = document.getElementById('build-container');
                if (container) {
                    container.innerHTML = `
                        <div class="build-placeholder">
                            <i class="fas fa-hammer"></i>
                            <p>Selectionnez un champion pour voir son build</p>
                        </div>
                    `;
                }

                // Clear cache/quality indicators
                const cacheInfo = document.getElementById('build-cache-info');
                const qualityIndicator = document.getElementById('build-quality-indicator');
                if (cacheInfo) cacheInfo.innerHTML = '';
                if (qualityIndicator) qualityIndicator.innerHTML = '';
            });
        }

        console.log('✅ Champion search grid attached');
    }

    // ✅ ROLE SELECT (builds tab)
    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
        roleSelect.addEventListener('change', () => {
            // Only reload if a champion is selected
            if (selectedChampionName) {
                loadChampionBuild(selectedChampionName);
            }
        });
        console.log('✅ Role select attached');
    }

    // ✅ BUILD REFRESH BUTTON
    const buildRefreshBtn = document.getElementById('build-refresh-btn');
    if (buildRefreshBtn) {
        buildRefreshBtn.addEventListener('click', forceRefreshBuild);
        console.log('✅ Build refresh button attached');
    }

    // ✅ ITEM SEARCH (items tab)
    const itemSearch = document.getElementById('item-search');
    if (itemSearch) {
        itemSearch.addEventListener('keyup', filterItems);
        console.log('✅ Item search attached');
    }

    // ✅ ITEM FILTERS (items tab)
    const itemFilters = ['item-stat', 'item-category', 'item-price', 'item-efficiency'];
    itemFilters.forEach(id => {
        const filter = document.getElementById(id);
        if (filter) {
            filter.addEventListener('change', filterItems);
        }
    });
    console.log('✅ Item filters attached');

    // ✅ BACKEND RETRY BUTTON
    const retryBtn = document.querySelector('.retry-btn-small');
    if (retryBtn) {
        retryBtn.addEventListener('click', retryBackendConnection);
        console.log('✅ Retry button attached');
    }

    // ✅ CHANGELOG REFRESH BUTTON
    const refreshChangelogBtn = document.getElementById('refresh-changelog');
    if (refreshChangelogBtn) {
        refreshChangelogBtn.addEventListener('click', refreshChangelog);
        console.log('✅ Changelog refresh button attached');
    }

    // ✅ GLOBAL SEARCH (Header)
    const globalSearchInput = document.getElementById('global-search');
    const globalSearchDropdown = document.getElementById('global-search-results');
    if (globalSearchInput) {
        // Live search on input
        globalSearchInput.addEventListener('input', (e) => {
            globalSearch(e.target.value);
        });

        // Keyboard navigation
        globalSearchInput.addEventListener('keydown', handleGlobalSearchKeyboard);

        // Show dropdown on focus if there's text
        globalSearchInput.addEventListener('focus', () => {
            if (globalSearchInput.value.length >= 2) {
                globalSearch(globalSearchInput.value);
            }
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const container = document.querySelector('.global-search-wrapper');
            if (container && !container.contains(e.target) && globalSearchDropdown) {
                globalSearchDropdown.classList.remove('visible');
                globalSearchHighlightIndex = -1;
            }
        });

        console.log('✅ Global search attached');
    }

    // Fix: Prevent auto-select on search inputs
    document.querySelectorAll('.search-input-inline, #search-input').forEach(input => {
        input.addEventListener('focus', (e) => {
            setTimeout(() => {
                const len = e.target.value.length;
                e.target.setSelectionRange(len, len);
            }, 0);
        });
    });

    console.log('✅ All event listeners attached successfully');
});

