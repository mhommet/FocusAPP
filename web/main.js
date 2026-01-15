/**
 * FOCUS - Frontend JavaScript
 * League of Legends Companion App
 *
 * Uses custom API for builds and tier lists data.
 * Built with vanilla JavaScript for optimal performance.
 *
 * @author Milan Hommet
 * @license MIT
 */

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/** @type {Array<Object>} All champions data */
let allChampions = [];

/** @type {Object|null} Full tier list response with metadata */
let tierListData = null;

/** @type {Array<Object>} All items data */
let allItems = [];

/** @type {Array<Object>} Filtered champions based on search/filters */
let filteredChampions = [];

/** @type {{column: string, direction: string}} Current sort configuration */
let currentSort = { column: "rank", direction: "asc" };

/** @type {string} Currently active tab */
let currentTab = "tierlist";

/** @type {string} Currently selected role filter */
let currentRoleFilter = "all";

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

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the application.
 * Fetches app version and loads initial tier list data.
 * @returns {Promise<void>}
 */
async function init() {
  const version = await eel.get_app_version()();
  document.getElementById("version").innerText = version;
  refreshTierList();
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
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `${tabName}-tab`);
  });

  // Load data if needed
  if (tabName === "items" && allItems.length === 0) {
    refreshItems();
  }
  if (tabName === "builds" && !championListLoaded) {
    loadChampionList();
  }
}

/**
 * Refresh data for the currently active tab.
 * @returns {void}
 */
function refreshCurrentTab() {
  if (currentTab === "tierlist") {
    refreshTierList();
  } else if (currentTab === "items") {
    refreshItems();
  } else if (currentTab === "builds") {
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
  document.querySelectorAll(".role-filter-btn-small").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.role === role);
  });

  currentRoleFilter = role;
  currentPage = 1;

  // Fetch tier list with role filter
  await refreshTierList(role === "all" ? null : role);
}

/**
 * Fetch and display the tier list from the API.
 * Shows Diamond+ aggregated champion rankings.
 * @param {string|null} role - Optional role filter
 * @returns {Promise<void>}
 */
async function refreshTierList(role = null) {
  // Show loading spinner
  const tbody = document.querySelector("#tier-list-table tbody");
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
  const lastUpdateEl = document.getElementById("tierlist-last-update");
  if (lastUpdateEl) lastUpdateEl.innerHTML = "";

  // Fetch tier list (API automatically aggregates Diamond+ data)
  // Pass role parameter if specified
  const data = await eel.get_champion_tier_list(role)();

  // Data format: {success, champions, tier_list, last_update, counts, total_champions}
  if (data && data.success && data.champions && data.champions.length > 0) {
    tierListData = data;
    allChampions = data.champions; // Use flat list for table

    // Display last update time with readable format
    if (lastUpdateEl && data.last_update) {
      const updateDate = new Date(data.last_update);
      const options = {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      const formattedDate = updateDate.toLocaleDateString("fr-FR", options);
      lastUpdateEl.innerHTML = `<i class="fas fa-clock"></i> Tier list updated ${formattedDate}`;
      lastUpdateEl.title = `Aggregated Diamond+ data (Diamond, Master, Grandmaster, Challenger)`;
    }

    applyFilters();
  } else {
    const errorMsg = data?.error || "Failed to load tier list";
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
  const searchText = document
    .getElementById("search-input")
    .value.toLowerCase();

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

    if (currentSort.column === "winrate") {
      // Handle both string "52.5%" and number formats
      valA =
        typeof valA === "string"
          ? parseFloat(valA.replace("%", ""))
          : valA || 0;
      valB =
        typeof valB === "string"
          ? parseFloat(valB.replace("%", ""))
          : valB || 0;
    }
    if (currentSort.column === "pickrate") {
      valA =
        typeof valA === "string"
          ? parseFloat(valA.replace("%", ""))
          : valA || 0;
      valB =
        typeof valB === "string"
          ? parseFloat(valB.replace("%", ""))
          : valB || 0;
    }
    if (currentSort.column === "games") {
      valA = parseInt(valA) || 0;
      valB = parseInt(valB) || 0;
    }
    if (currentSort.column === "rank") {
      valA = parseInt(valA) || 999;
      valB = parseInt(valB) || 999;
    }
    if (currentSort.column === "tier") {
      const tierOrder = { "S+": 6, S: 5, A: 4, B: 3, C: 2, D: 1 };
      valA = tierOrder[valA] || 0;
      valB = tierOrder[valB] || 0;
    }

    if (valA < valB) return currentSort.direction === "asc" ? -1 : 1;
    if (valA > valB) return currentSort.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Paginate
  const totalPages = Math.ceil(filteredChampions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageData = filteredChampions.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  updateTable(pageData);
  updatePagination(totalPages);
}

/**
 * Sort the tier list table by a specific column.
 * @param {string} column - Column name to sort by
 * @returns {void}
 */
function sortTable(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    currentSort.column = column;
    // Default to descending for stats columns
    currentSort.direction = ["winrate", "pickrate", "tier", "games"].includes(
      column
    )
      ? "desc"
      : "asc";
  }
  currentPage = 1;
  applyFilters();
}

/**
 * Update the tier list table with champion data.
 * @param {Array<Object>} champions - Array of champion objects to display
 * @returns {void}
 */
function updateTable(champions) {
  const tbody = document.querySelector("#tier-list-table tbody");
  if (!tbody) return;

  if (champions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="loading-cell">No champions found</td></tr>';
    return;
  }

  tbody.innerHTML = champions
    .map(
      (champ) => {
        const roleIcon = getRoleIcon(champ.role);
        const roleDisplay = roleIcon
          ? `<span class="role-cell"><img src="${roleIcon}" alt="${champ.role}" class="role-icon-small" onerror="this.style.display='none'"> ${champ.role}</span>`
          : champ.role;
        return `
        <tr>
            <td>#${champ.rank}</td>
            <td><strong>${champ.name}</strong></td>
            <td>${roleDisplay}</td>
            <td class="${getTierClass(champ.tier)}">${champ.tier}</td>
            <td>${champ.winrate}</td>
            <td>${champ.pickrate || "-"}</td>
            <td>${champ.games ? champ.games.toLocaleString() : "-"}</td>
        </tr>
    `;
      }
    )
    .join("");
}

function getTierClass(tier) {
  if (tier === "S+") return "tier-s-plus";
  if (tier === "S") return "tier-s";
  if (tier === "A") return "tier-a";
  if (tier === "B") return "tier-b";
  if (tier === "C") return "tier-c";
  if (tier === "D") return "tier-d";
  return "";
}

/**
 * Get the icon URL for a given role.
 * @param {string} role - Role name (top, jungle, mid, adc, support)
 * @returns {string} URL of the role icon
 */
function getRoleIcon(role) {
  const roleIcons = {
    top: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png",
    jungle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png",
    mid: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png",
    middle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png",
    adc: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png",
    bottom: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png",
    support: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png",
    utility: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png"
  };
  return roleIcons[role?.toLowerCase()] || "";
}

function updatePagination(totalPages) {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = `<span class="pagination-info">${filteredChampions.length} champions</span>`;
    return;
  }

  let html = `
        <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${
    currentPage === 1 ? "disabled" : ""
  }>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    html += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += `<span class="pagination-info">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${
      i === currentPage ? "active" : ""
    }" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1)
      html += `<span class="pagination-info">...</span>`;
    html += `<button class="pagination-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  html += `
        <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${
    currentPage === totalPages ? "disabled" : ""
  }>
            <i class="fas fa-chevron-right"></i>
        </button>
        <span class="pagination-info">${
          filteredChampions.length
        } champions</span>
        <select class="pagination-select" onchange="changeItemsPerPage(this.value)">
            <option value="25" ${
              itemsPerPage === 25 ? "selected" : ""
            }>25 / page</option>
            <option value="50" ${
              itemsPerPage === 50 ? "selected" : ""
            }>50 / page</option>
            <option value="100" ${
              itemsPerPage === 100 ? "selected" : ""
            }>100 / page</option>
        </select>
    `;

  pagination.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  applyFilters(false);
  const table = document.getElementById("tier-list-table");
  if (table) table.scrollIntoView({ behavior: "smooth", block: "start" });
}

function changeItemsPerPage(value) {
  itemsPerPage = parseInt(value);
  currentPage = 1;
  applyFilters(false);
}

// Note: triggerScrapeWithElo removed - API now automatically aggregates Diamond+ data

// =============================================================================
// ITEMS
// =============================================================================

async function refreshItems() {
  const grid = document.getElementById("items-grid");
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
  document.getElementById("items-pagination").innerHTML = "";

  const data = await eel.get_items_data()();

  if (data && data.length > 0) {
    allItems = data;
    filterItems();
  } else {
    if (grid)
      grid.innerHTML = '<div class="loading-cell">Failed to load items</div>';
  }
}

function filterItems(resetPage = true) {
  if (resetPage) itemsPage = 1;

  const category = document.getElementById("item-category").value;
  const statType = document.getElementById("item-stat").value;
  const searchText = document.getElementById("item-search").value.toLowerCase();

  filteredItems = allItems.filter((item) => {
    const matchCategory = category === "all" || item.category === category;
    const matchStat = statType === "all" || item.stat_type === statType;
    const matchSearch = item.name.toLowerCase().includes(searchText);
    return matchCategory && matchStat && matchSearch;
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPageGrid);
  const startIndex = (itemsPage - 1) * itemsPerPageGrid;
  const pageData = filteredItems.slice(
    startIndex,
    startIndex + itemsPerPageGrid
  );

  updateItemsGrid(pageData);
  updateItemsPagination(totalPages);
}

function updateItemsGrid(items) {
  const grid = document.getElementById("items-grid");
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = '<div class="loading-cell">No items found</div>';
    return;
  }

  grid.innerHTML = items
    .map((item) => {
      let efficiencyClass = "efficiency-low";
      if (item.efficiency >= 100) efficiencyClass = "efficiency-high";
      else if (item.efficiency >= 80) efficiencyClass = "efficiency-medium";

      return `
            <div class="item-card">
                <img src="${item.image}" alt="${
        item.name
      }" class="item-icon" onerror="this.style.display='none'">
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-gold"><i class="fas fa-coins"></i> ${
                      item.gold
                    } gold</div>
                    <div class="item-stats">${
                      item.stats || "Passive effects"
                    }</div>
                    <span class="item-efficiency ${efficiencyClass}">${
        item.efficiency
      }% efficient</span>
                </div>
            </div>
        `;
    })
    .join("");
}

function updateItemsPagination(totalPages) {
  const pagination = document.getElementById("items-pagination");
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = `<span class="pagination-info">${filteredItems.length} items</span>`;
    return;
  }

  let html = `
        <button class="pagination-btn" onclick="goToItemsPage(${
          itemsPage - 1
        })" ${itemsPage === 1 ? "disabled" : ""}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

  const startPage = Math.max(1, itemsPage - 2);
  const endPage = Math.min(totalPages, itemsPage + 2);

  if (startPage > 1) {
    html += `<button class="pagination-btn" onclick="goToItemsPage(1)">1</button>`;
    if (startPage > 2) html += `<span class="pagination-info">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${
      i === itemsPage ? "active" : ""
    }" onclick="goToItemsPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1)
      html += `<span class="pagination-info">...</span>`;
    html += `<button class="pagination-btn" onclick="goToItemsPage(${totalPages})">${totalPages}</button>`;
  }

  html += `
        <button class="pagination-btn" onclick="goToItemsPage(${
          itemsPage + 1
        })" ${itemsPage === totalPages ? "disabled" : ""}>
            <i class="fas fa-chevron-right"></i>
        </button>
        <span class="pagination-info">${filteredItems.length} items</span>
    `;

  pagination.innerHTML = html;
}

function goToItemsPage(page) {
  itemsPage = page;
  filterItems(false);
  const grid = document.getElementById("items-grid");
  if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =============================================================================
// BUILDS
// =============================================================================

/**
 * Load champion list for the build selector dropdown.
 * @returns {Promise<void>}
 */
async function loadChampionList() {
  const select = document.getElementById("champion-select");
  if (!select) return;
  select.innerHTML = '<option value="">Loading...</option>';

  const champions = await eel.get_champion_list()();

  if (champions && champions.length > 0) {
    select.innerHTML = '<option value="">-- Select Champion --</option>';
    champions.forEach((champ) => {
      select.innerHTML += `<option value="${champ.name}" data-id="${champ.id}" data-image="${champ.image}">${champ.name}</option>`;
    });
    championListLoaded = true;
  } else {
    select.innerHTML = '<option value="">Failed to load</option>';
  }
}

// =============================================================================
// BUILD LOADING - API automatically aggregates Diamond+ data
// =============================================================================

/**
 * Load and display champion build from the API.
 * Uses Diamond+ aggregated data for optimal statistics.
 * @returns {Promise<void>}
 */
async function loadChampionBuild() {
  const championName = document.getElementById("champion-select").value;
  const lane = document.getElementById("role-select").value;
  const container = document.getElementById("build-container");
  const refreshBtn = document.getElementById("build-refresh-btn");
  const cacheInfo = document.getElementById("build-cache-info");

  if (!championName) {
    container.innerHTML = `
            <div class="build-placeholder">
                <i class="fas fa-hammer"></i>
                <p>Select a champion to view their build</p>
            </div>
        `;
    if (cacheInfo) cacheInfo.innerHTML = "";
    return;
  }

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

  // Fetch build from API (automatically uses Diamond+ aggregated data)
  const build = await eel.get_ugg_build(championName, lane)();

  if (build && build.success) {
    currentBuild = build;
    renderBuild(build);
    updateCacheIndicator(build);
  } else {
    const errorMsg = build?.error || "Unknown error";
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
    if (cacheInfo) cacheInfo.innerHTML = "";
  }
}

/**
 * Force refresh the build data, bypassing cache.
 * @returns {Promise<void>}
 */
async function forceRefreshBuild() {
  const championName = document.getElementById("champion-select").value;
  const lane = document.getElementById("role-select").value;
  const container = document.getElementById("build-container");
  const refreshBtn = document.getElementById("build-refresh-btn");
  const cacheInfo = document.getElementById("build-cache-info");

  if (!championName) {
    return;
  }

  // Disable refresh button during loading
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Actualisation...';
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
  const build = await eel.get_ugg_build(championName, lane, true)();

  // Re-enable refresh button
  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
  }

  if (build && build.success) {
    currentBuild = build;
    renderBuild(build);
    updateCacheIndicator(build);
    // Show success feedback
    showToast("Data refreshed successfully!", "success");
  } else {
    const errorMsg = build?.error || "Unknown error";
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
    if (cacheInfo) cacheInfo.innerHTML = "";
  }
}

/**
 * Update cache indicator with color coding
 * Green: <6h, Orange: 6-24h, Red: >24h
 */
function updateCacheIndicator(build) {
  const cacheInfo = document.getElementById("build-cache-info");
  if (!cacheInfo) return;

  if (
    build.cached &&
    build.cache_age_hours !== null &&
    build.cache_age_hours !== undefined
  ) {
    const hours = build.cache_age_hours;
    let colorClass = "cache-fresh"; // Green
    let icon = "fa-check-circle";

    if (hours >= 24) {
      colorClass = "cache-old"; // Red
      icon = "fa-exclamation-triangle";
    } else if (hours >= 6) {
      colorClass = "cache-medium"; // Orange
      icon = "fa-clock";
    }

    const timeStr =
      hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)}h`;

    cacheInfo.innerHTML = `<span class="cache-badge ${colorClass}"><i class="fas ${icon}"></i> Updated ${timeStr} ago</span>`;
    cacheInfo.title = "Click Refresh to update data";
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
function showToast(message, type = "info") {
  // Remove existing toast if any
  const existingToast = document.querySelector(".toast-notification");
  if (existingToast) existingToast.remove();

  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `<i class="fas fa-${
    type === "success" ? "check-circle" : "info-circle"
  }"></i> ${message}`;
  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Render the champion build in the UI.
 * Displays runes, items, skills, and summoner spells.
 * @param {Object} build - Build data from API
 * @param {string} build.champion - Champion name
 * @param {Object} build.runes - Rune configuration
 * @param {Object} build.items - Item build
 * @param {Object} build.skills - Skill order
 * @param {Array} build.summoners - Summoner spells
 * @param {number} [build.winrate] - Win rate percentage
 * @param {number} [build.games] - Number of games analyzed
 * @returns {void}
 */
function renderBuild(build) {
  const container = document.getElementById("build-container");
  const laneSelect = document.getElementById("role-select");
  const laneDisplay = laneSelect
    ? laneSelect.selectedOptions[0].text
    : build.role;

  // Winrate badge with color coding (green >52%, red <48%)
  let winrateBadge = "";
  if (build.winrate !== null && build.winrate !== undefined) {
    const wr = parseFloat(build.winrate);
    let wrClass = "winrate-medium";
    if (wr >= 52) wrClass = "winrate-high";
    else if (wr < 48) wrClass = "winrate-low";
    winrateBadge = `<span class="stat-badge ${wrClass}"><i class="fas fa-chart-line"></i> ${wr.toFixed(
      1
    )}% WR</span>`;
  }

  // Games badge
  let gamesBadge = "";
  const gamesCount = build.games || 0;
  if (gamesCount > 0) {
    const gamesStr =
      gamesCount >= 1000
        ? `${(gamesCount / 1000).toFixed(1)}k`
        : gamesCount.toString();
    gamesBadge = `<span class="stat-badge games-badge"><i class="fas fa-gamepad"></i> Based on ${gamesStr} games</span>`;
  }

  // Low data warning (< 10 games)
  let lowDataWarning = "";
  if (gamesCount > 0 && gamesCount < 10) {
    lowDataWarning = `
            <div class="low-data-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Build based on limited data (${gamesCount} games). Statistics may be unreliable.</span>
                <button class="warning-refresh-btn" onclick="forceRefreshBuild()">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>
        `;
  }

  // === RUNES SECTION ===
  let runesHtml = "";
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
          onerror="this.onerror=null; this.src='${r.icon.replace(
            /\/[^\/]+\/([^\/]+)\.png$/,
            "/$1.png"
          )}';">`
      )
      .join("");

    // Secondary tree runes (2 runes)
    const secondaryRunesHtml = (build.runes.secondary || [])
      .map(
        (r) =>
          `<img src="${r.icon}" alt="${r.name}" title="${r.name}" class="rune-icon small">`
      )
      .join("");

    // Stat Shards (3 shards)
    const shardsHtml = (build.runes.shards || [])
      .map(
        (s) =>
          `<img src="${s.icon}" alt="${s.name}" title="${s.name}" class="rune-shard">`
      )
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
                    <img src="${
                      build.runes.keystone_icon
                    }" alt="Keystone" title="${keystoneName}" class="rune-icon keystone" onerror="this.style.display='none'">
                </div>
                <div class="runes-list primary-runes">${primaryRunesHtml}</div>
            </div>
            <div class="rune-divider"></div>
            <div class="rune-tree secondary">
                <div class="rune-tree-header">
                    <span class="rune-tree-name">SECONDARY</span>
                </div>
                <div class="runes-list secondary-runes">${secondaryRunesHtml}</div>
                ${
                  shardsHtml
                    ? `
                    <div class="shards-section">
                        <span class="shards-label">STAT SHARDS</span>
                        <div class="rune-shards" style="flex-direction: column;">${shardsHtml}</div>
                    </div>
                `
                    : ""
                }
            </div>
        </div>
    </div>
`;
  }

  // === SUMMONER SPELLS (Compact) ===
  let summonersHtml = "";
  if (build.summoners && build.summoners.length > 0) {
    const spellsHtml = build.summoners
      .map(
        (s) =>
          `<div class="summoner-spell">
            <img src="${s.icon}" alt="${s.name}" title="${s.name}" class="summoner-icon-small" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/14.1.1/img/spell/SummonerFlash.png'">
        </div>`
      )
      .join("");

    summonersHtml = `
        <div class="build-section summoner-section">
            <h3><i class="fas fa-magic"></i> Summoners</h3>
            <div class="summoners-compact">${spellsHtml}</div>
        </div>
    `;
  }

  // === ITEMS ===
  let itemsHtml = "";
  if (build.items) {
    // Starting items
    let startingHtml = "";
    if (build.items.starting && build.items.starting.length > 0) {
      const startItems = build.items.starting
        .map(
          (i) =>
            `<img src="${i.icon}" alt="${i.name || "Starting Item"}" title="${
              i.name || "Starting Item"
            }" class="build-item small" onerror="this.style.display='none'">`
        )
        .join("");
      startingHtml = `
            <div class="items-group starting">
                <div class="items-row-label"><i class="fas fa-play"></i> STARTING</div>
                <div class="items-row">${startItems}</div>
            </div>
        `;
    }

    // Boots (separate section)
    let bootsHtml = "";
    if (build.items.boots) {
      const bootIcon = build.items.boots.icon || "";
      const bootName = build.items.boots.name || "Boots";
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

    // Core items (WITHOUT boots and without duplicates from full_build)
    let coreHtml = "";
    if (build.items.core && build.items.core.length > 0) {
      const bootsId = build.items.boots
        ? build.items.boots.id || build.items.boots
        : null;
      const coreItems = build.items.core
        .filter((item) => {
          const itemId = item.id || item;
          return itemId !== bootsId;
        })
        .map(
          (i) =>
            `<img src="${i.icon}" alt="${i.name || "Core Item"}" title="${
              i.name || "Core Item"
            }" class="build-item" onerror="this.style.display='none'">`
        )
        .join("");

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
    let recommendedHtml = "";
    const coreIds = (build.items.core || []).map((i) => i.id || i);
    const startingIds = (build.items.starting || []).map((i) => i.id || i);
    const bootsId = build.items.boots
      ? build.items.boots.id || build.items.boots
      : null;

    // Combine full_build and situational, removing duplicates and already-shown items
    const seenIds = new Set();
    const allRecommended = [
      ...(build.items.full_build || []),
      ...(build.items.situational || []),
    ].filter((item) => {
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
            `<img src="${i.icon}" alt="${i.name || "Item"}" title="${
              i.name || "Item"
            }" class="build-item" onerror="this.style.display='none'">`
        )
        .join("");

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
  let skillsHtml = "";
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
        ${lowDataWarning}
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
}

// =============================================================================
// START APP
// =============================================================================

// Make functions global for inline onclick handlers
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

// Wait for Eel to be ready
document.addEventListener("DOMContentLoaded", () => {
  init();
});
