"""
API Client - Abstraction Layer for Custom League of Legends API
================================================================

This module provides a client for interacting with the custom LoL API.

Endpoints:
- Build: GET https://api.hommet.ch/api/v1/build/{champion}/{role}?force_refresh={bool}
- Tierlist: GET https://api.hommet.ch/api/v1/tierlist

Response format (Build):
{
  "champion": "aatrox",
  "role": "top",
  "rank": "MASTER",
  "build": {
    "items": {"core": [...], "boots": int, "starting": [...], "full_build": [...], "situational": []},
    "runes": {
      "primary": {"path": str, "keystone": int, "slots": [...], "path_id": int},
      "secondary": {"path": str, "slots": [...], "path_id": int},
      "shards": {"offense": int, "flex": int, "defense": int}
    },
    "skill_order": {"priority": "Q>E>W"},
    "summoner_spells": {"spell1": {...}, "spell2": {...}, "ids": [...]},
    "stats": {"winrate": float, "games_analyzed": int}
  }
}

Author: Milan Hommet
License: MIT
"""

import requests
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from enum import Enum

# Configure logging
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

API_BASE_URL = "https://api.hommet.ch/api/v1"
DEFAULT_TIMEOUT = 30  # seconds
RETRY_COUNT = 3
DDRAGON_VERSION = "14.10.1"  # Updated dynamically at runtime

# =============================================================================
# IMAGE URL GENERATORS (DDragon / CommunityDragon)
# =============================================================================

# DDragon base URL for rune images (no version needed)
DDRAGON_PERK_BASE = "https://ddragon.leagueoflegends.com/cdn/img/"

# Rune paths mapping - using DDragon format
RUNE_PATHS = {
    # Precision Tree (8000)
    8000: "perk-images/Styles/7201_Precision.png",
    8005: "perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png",
    8008: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png",
    8021: "perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png",
    8010: "perk-images/Styles/Precision/Conqueror/Conqueror.png",
    9101: "perk-images/Styles/Precision/Triumph.png",
    9111: "perk-images/Styles/Precision/Triumph.png",
    8009: "perk-images/Styles/Precision/Overheal.png",
    8014: "perk-images/Styles/Precision/CoupDeGrace/CoupDeGrace.png",
    9104: "perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png",
    9105: "perk-images/Styles/Precision/LegendTenacity/LegendTenacity.png",
    9103: "perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png",
    8017: "perk-images/Styles/Precision/CutDown/CutDown.png",
    8299: "https://wiki.leagueoflegends.com/en-us/images/Last_Stand_rune.png",
    # Domination Tree (8100)
    8100: "perk-images/Styles/7200_Domination.png",
    8112: "perk-images/Styles/Domination/Electrocute/Electrocute.png",
    8124: "perk-images/Styles/Domination/Predator/Predator.png",
    8128: "perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png",
    9923: "perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png",
    8126: "perk-images/Styles/Domination/CheapShot/CheapShot.png",
    8139: "perk-images/Styles/Domination/TasteOfBlood/GreenTerror_TasteOfBlood.png",
    8143: "perk-images/Styles/Domination/SuddenImpact/SuddenImpact.png",
    8136: "perk-images/Styles/Domination/ZombieWard/ZombieWard.png",
    8120: "perk-images/Styles/Domination/GhostPoro/GhostPoro.png",
    8138: "perk-images/Styles/Domination/EyeballCollection/EyeballCollection.png",
    8135: "perk-images/Styles/Domination/TreasureHunter/TreasureHunter.png",
    8134: "perk-images/Styles/Domination/IngeniousHunter/IngeniousHunter.png",
    8105: "perk-images/Styles/Domination/RelentlessHunter/RelentlessHunter.png",
    8106: "perk-images/Styles/Domination/UltimateHunter/UltimateHunter.png",
    # Sorcery Tree (8200)
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
    # Resolve Tree (8400)
    8400: "perk-images/Styles/7204_Resolve.png",
    8437: "perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png",
    8439: "perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png",
    8465: "perk-images/Styles/Resolve/Guardian/Guardian.png",
    8446: "perk-images/Styles/Resolve/Demolish/Demolish.png",
    8463: "perk-images/Styles/Resolve/FontOfLife/FontOfLife.png",
    8401: "perk-images/Styles/Resolve/MirrorShell/MirrorShell.png",
    8429: "perk-images/Styles/Resolve/Conditioning/Conditioning.png",
    8444: "perk-images/Styles/Resolve/SecondWind/SecondWind.png",
    8473: "perk-images/Styles/Resolve/BonePlating/BonePlating.png",
    8451: "perk-images/Styles/Resolve/Overgrowth/Overgrowth.png",
    8453: "perk-images/Styles/Resolve/Revitalize/Revitalize.png",
    8242: "perk-images/Styles/Resolve/Unflinching/Unflinching.png",
    # Inspiration Tree (8300)
    8300: "perk-images/Styles/7203_Inspiration.png",
    8351: "perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png",
    8360: "perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png",
    8369: "perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png",
    8306: "perk-images/Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png",
    8313: "perk-images/Styles/Inspiration/PerfectTiming/PerfectTiming.png",
    8321: "perk-images/Styles/Inspiration/FuturesMarket/FuturesMarket.png",
    8316: "perk-images/Styles/Inspiration/MinionDematerializer/MinionDematerializer.png",
    8345: "perk-images/Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png",
    8410: "perk-images/Styles/Inspiration/ApproachVelocity/ApproachVelocity.png",
    8352: "perk-images/Styles/Inspiration/TimeWarpTonic/TimeWarpTonic.png",
    8304: "perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png",
    8347: "perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png",
    # Stat Shards
    5008: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
    5005: "perk-images/StatMods/StatModsAttackSpeedIcon.png",
    5007: "perk-images/StatMods/StatModsCDRScalingIcon.png",
    5001: "perk-images/StatMods/StatModsHealthScalingIcon.png",
    5002: "perk-images/StatMods/StatModsArmorIcon.png",
    5003: "perk-images/StatMods/StatModsMagicResIcon.png",
    5010: "perk-images/StatMods/StatModsMovementSpeedIcon.png",
    5011: "perk-images/StatMods/StatModsHealthPlusIcon.png",
}

# Rune display names mapping
RUNE_NAMES = {
    8000: "Precision",
    8005: "Press the Attack",
    8008: "Lethal Tempo",
    8021: "Fleet Footwork",
    8010: "Conqueror",
    9101: "Triumph",
    9111: "Triumph",
    8009: "Overheal",
    8014: "Coup de Grace",
    9104: "Legend: Alacrity",
    9105: "Legend: Tenacity",
    9103: "Legend: Bloodline",
    8017: "Cut Down",
    8299: "Last Stand",
    8100: "Domination",
    8112: "Electrocute",
    8124: "Predator",
    8128: "Dark Harvest",
    9923: "Hail of Blades",
    8126: "Cheap Shot",
    8139: "Taste of Blood",
    8143: "Sudden Impact",
    8136: "Zombie Ward",
    8120: "Ghost Poro",
    8138: "Eyeball Collection",
    8135: "Treasure Hunter",
    8134: "Ingenious Hunter",
    8105: "Relentless Hunter",
    8106: "Ultimate Hunter",
    8137: "Sixth Sense",
    8200: "Sorcery",
    8214: "Summon Aery",
    8229: "Arcane Comet",
    8230: "Phase Rush",
    8224: "Nullifying Orb",
    8226: "Manaflow Band",
    8275: "Nimbus Cloak",
    8210: "Transcendence",
    8234: "Celerity",
    8233: "Absolute Focus",
    8237: "Scorch",
    8232: "Waterwalking",
    8236: "Gathering Storm",
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
    8300: "Inspiration",
    8351: "Glacial Augment",
    8360: "Unsealed Spellbook",
    8369: "First Strike",
    8306: "Hextech Flashtraption",
    8304: "Magical Footwear",
    8313: "Perfect Timing",
    8321: "Future's Market",
    8316: "Minion Dematerializer",
    8345: "Biscuit Delivery",
    8347: "Cosmic Insight",
    8410: "Approach Velocity",
    8352: "Time Warp Tonic",
    5008: "Adaptive Force",
    5005: "Attack Speed",
    5007: "Ability Haste",
    5001: "Health Scaling",
    5002: "Armor",
    5003: "Magic Resist",
    5010: "Move Speed",
    5011: "Health",
}

# Summoner spell display names
SPELL_NAMES = {
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
}

# Summoner spell file names for DDragon URLs
SPELL_FILES = {
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
}


def get_item_image_url(item_id: int) -> str:
    """
    Generate DDragon URL for item image.

    Args:
        item_id: The item ID

    Returns:
        str: Full URL to the item image
    """
    return f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VERSION}/img/item/{item_id}.png"


def get_rune_image_url(rune_id: int) -> str:
    """
    Generate DDragon URL for rune image.

    Args:
        rune_id: The rune/perk ID

    Returns:
        str: Full URL to the rune image
    """
    rune_id = int(rune_id)

    # Special cases for runes missing from standard CDN
    if rune_id == 8299:
        return "https://wiki.leagueoflegends.com/en-us/images/Last_Stand_rune.png"
    if rune_id == 8137:
        return "https://wiki.leagueoflegends.com/en-us/images/Sixth_Sense_rune.png?633dd"
    if rune_id == 8141:
        return "https://wiki.leagueoflegends.com/en-us/images/Deep_Ward_rune.png?adf57"
    if rune_id == 8140:
        return "https://wiki.leagueoflegends.com/en-us/images/Grisly_Mementos_rune.png?e5c55"

    if rune_id in RUNE_PATHS:
        return f"{DDRAGON_PERK_BASE}{RUNE_PATHS[rune_id]}"

    # Fallback to a default rune icon
    return f"{DDRAGON_PERK_BASE}perk-images/styles/precision/conqueror/conqueror.png"


def get_rune_name(rune_id: int) -> str:
    """
    Get rune display name.

    Args:
        rune_id: The rune/perk ID

    Returns:
        str: Human-readable rune name
    """
    return RUNE_NAMES.get(int(rune_id), f"Rune {rune_id}")


def get_spell_image_url(spell_id: int) -> str:
    """
    Generate DDragon URL for summoner spell image.

    Args:
        spell_id: The summoner spell ID

    Returns:
        str: Full URL to the spell image
    """
    spell_name = SPELL_FILES.get(int(spell_id), f"Summoner{spell_id}")
    return f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VERSION}/img/spell/{spell_name}.png"


def get_spell_name(spell_id: int) -> str:
    """
    Get summoner spell display name.

    Args:
        spell_id: The summoner spell ID

    Returns:
        str: Human-readable spell name
    """
    return SPELL_NAMES.get(int(spell_id), f"Spell {spell_id}")


def update_ddragon_version() -> None:
    """
    Fetch and update latest DDragon version from Riot's API.

    This function updates the global DDRAGON_VERSION variable.
    """
    global DDRAGON_VERSION
    try:
        versions = requests.get(
            "https://ddragon.leagueoflegends.com/api/versions.json", timeout=5
        ).json()
        DDRAGON_VERSION = versions[0]
        logger.info(f"DDragon version: {DDRAGON_VERSION}")
    except Exception as e:
        logger.error(f"Failed to fetch DDragon version: {e}")


# Initialize DDragon version on module load - wrapped for safety
try:
    update_ddragon_version()
except Exception as e:
    logger.warning(f"Failed to update DDragon version at startup: {e}")


class Rank(Enum):
    """Available ranks for API requests."""

    CHALLENGER = "challenger"
    GRANDMASTER = "grandmaster"
    MASTER = "master"
    DIAMOND = "diamond"
    EMERALD = "emerald"
    PLATINUM = "platinum"
    GOLD = "gold"
    SILVER = "silver"
    BRONZE = "bronze"
    IRON = "iron"
    PLATINUM_PLUS = "platinum_plus"
    DIAMOND_PLUS = "diamond_plus"
    MASTER_PLUS = "master_plus"
    OVERALL = "overall"


class Role(Enum):
    """Available champion roles."""

    TOP = "top"
    JUNGLE = "jungle"
    MID = "mid"
    ADC = "adc"
    SUPPORT = "support"
    DEFAULT = "default"


# =============================================================================
# EXCEPTIONS
# =============================================================================


class APIError(Exception):
    """Base exception for API errors."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class APITimeoutError(APIError):
    """Raised when API request times out."""
    pass


class APINotFoundError(APIError):
    """Raised when resource is not found (404)."""
    pass


class APIServerError(APIError):
    """Raised on server error (5xx)."""
    pass


# =============================================================================
# RESPONSE MODELS
# =============================================================================


@dataclass
class RuneData:
    """Data model for a rune."""

    id: int
    name: str
    icon: str


@dataclass
class ItemData:
    """Data model for an item."""

    id: int
    icon: str
    name: Optional[str] = None


@dataclass
class SummonerSpellData:
    """Data model for a summoner spell."""

    id: int
    name: str
    icon: str


@dataclass
class BuildResponse:
    """Complete champion build response."""

    success: bool
    champion: str
    champion_id: Optional[int]
    role: str
    source: str
    runes: dict
    items: dict
    skills: dict
    summoners: list
    winrate: Optional[float]
    pickrate: Optional[float]
    games: Optional[int]
    error: Optional[str] = None


@dataclass
class TierlistEntry:
    """Tier list entry for a champion."""

    rank: str
    name: str
    role: str
    tier: str
    winrate: str


# =============================================================================
# API CLIENT
# =============================================================================


class LeagueAPIClient:
    """
    Client for the custom League of Legends API.

    Handles HTTP requests, errors, timeouts, and response parsing.
    """

    def __init__(self, base_url: str = API_BASE_URL, timeout: int = DEFAULT_TIMEOUT):
        """
        Initialize the API client.

        Args:
            base_url: Base URL of the API
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "FocusAPP/1.0",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )

    def _make_request(
        self, method: str, endpoint: str, params: Optional[dict] = None
    ) -> dict:
        """
        Execute an HTTP request with error handling and retries.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (without base URL)
            params: Request parameters

        Returns:
            dict: Parsed JSON response

        Raises:
            APIError: On any API error
        """
        url = f"{self.base_url}{endpoint}"

        for attempt in range(RETRY_COUNT):
            try:
                response = self.session.request(
                    method=method, url=url, params=params, timeout=self.timeout
                )

                # Handle HTTP errors
                if response.status_code == 404:
                    raise APINotFoundError(
                        f"Resource not found: {endpoint}", status_code=404
                    )
                elif response.status_code >= 500:
                    raise APIServerError(
                        f"Server error: {response.status_code}",
                        status_code=response.status_code,
                    )
                elif response.status_code >= 400:
                    raise APIError(
                        f"Client error: {response.status_code} - {response.text}",
                        status_code=response.status_code,
                    )

                # Parse JSON response
                return response.json()

            except requests.exceptions.Timeout:
                if attempt == RETRY_COUNT - 1:
                    raise APITimeoutError(f"Request timed out after {self.timeout}s")
                continue

            except requests.exceptions.ConnectionError as e:
                if attempt == RETRY_COUNT - 1:
                    raise APIError(f"Connection error: {str(e)}")
                continue

            except requests.exceptions.JSONDecodeError as e:
                raise APIError(f"Invalid JSON response: {str(e)}")

        raise APIError("Max retries exceeded")

    # =========================================================================
    # BUILD ENDPOINT
    # =========================================================================

    def get_build(
        self, champion: str, role: str = "default", force_refresh: bool = False
    ) -> dict:
        """
        Fetch champion build data.

        The API aggregates Diamond+ data (Diamond, Master, Grandmaster, Challenger)
        for best statistics.

        Args:
            champion: Champion name (e.g., "Jinx", "Lee Sin")
            role: Champion role ("top", "jungle", "mid", "adc", "support", "default")
            force_refresh: Force cache refresh on API side

        Returns:
            dict: Complete build with runes, items, skills, summoners

        Raises:
            APIError: On any API error
        """
        # Normalize champion name for URL
        champion_url = (
            champion.lower().replace(" ", "").replace("'", "").replace(".", "")
        )

        endpoint = f"/build/{champion_url}/{role.lower()}"
        params = {}
        if force_refresh:
            params["force_refresh"] = "true"

        try:
            data = self._make_request("GET", endpoint, params)
            return self._format_build_response(data, champion, role)
        except APINotFoundError:
            return self._make_error_response(
                f"No build found for {champion} ({role})", champion, role
            )
        except APIError as e:
            return self._make_error_response(str(e), champion, role)

    def _format_build_response(self, data: dict, champion: str, role: str) -> dict:
        """
        Format API response to the expected application format.

        Args:
            data: Raw API response
            champion: Champion name
            role: Champion role

        Returns:
            dict: Formatted build data for frontend
        """
        build_data = data.get("build", {})

        # === RUNES ===
        runes_data = build_data.get("runes", {})
        primary = runes_data.get("primary", {})
        secondary = runes_data.get("secondary", {})
        shards_data = runes_data.get("shards", {})

        # Keystone
        keystone_id = primary.get("keystone")
        keystone_icon = get_rune_image_url(keystone_id) if keystone_id else None

        # Primary tree
        primary_tree_id = primary.get("path_id")
        primary_tree_icon = (
            get_rune_image_url(primary_tree_id) if primary_tree_id else None
        )

        # Primary runes (slots after keystone)
        primary_runes = []
        for rune_id in primary.get("slots", []):
            primary_runes.append(
                {
                    "id": rune_id,
                    "name": get_rune_name(rune_id),
                    "icon": get_rune_image_url(rune_id),
                }
            )

        # Secondary tree
        secondary_tree_id = secondary.get("path_id")
        secondary_tree_icon = (
            get_rune_image_url(secondary_tree_id) if secondary_tree_id else None
        )

        # Secondary runes
        secondary_runes = []
        for rune_id in secondary.get("slots", []):
            secondary_runes.append(
                {
                    "id": rune_id,
                    "name": get_rune_name(rune_id),
                    "icon": get_rune_image_url(rune_id),
                }
            )

        # Shards
        shards = []
        for shard_key in ["offense", "flex", "defense"]:
            shard_id = shards_data.get(shard_key)
            if shard_id:
                shards.append(
                    {
                        "id": shard_id,
                        "name": get_rune_name(shard_id),
                        "icon": get_rune_image_url(shard_id),
                    }
                )

        # === ITEMS ===
        items_data = build_data.get("items", {})

        # Starting items
        starting_items = []
        for item_id in items_data.get("starting", []):
            starting_items.append({"id": item_id, "icon": get_item_image_url(item_id)})

        # Core items
        core_items = []
        for item_id in items_data.get("core", []):
            core_items.append({"id": item_id, "icon": get_item_image_url(item_id)})

        # Boots
        boots_id = items_data.get("boots")
        boots = None
        if boots_id:
            boots = {"id": boots_id, "icon": get_item_image_url(boots_id)}

        # Full build (final items)
        full_build_items = []
        for item_id in items_data.get("full_build", []):
            full_build_items.append(
                {"id": item_id, "icon": get_item_image_url(item_id)}
            )

        # Situational items
        situational_items = []
        for item_id in items_data.get("situational", []):
            situational_items.append(
                {"id": item_id, "icon": get_item_image_url(item_id)}
            )

        # === SKILLS ===
        skill_order_data = build_data.get("skill_order", {})
        priority_str = skill_order_data.get("priority", "")
        # Parse "Q>E>W" into ["Q", "E", "W"]
        skill_order = (
            [s.strip() for s in priority_str.split(">")] if priority_str else []
        )

        # === SUMMONER SPELLS ===
        summ_data = build_data.get("summoner_spells", {})
        summoners = []

        # Try to get from spell1/spell2 objects first
        spell1 = summ_data.get("spell1", {})
        spell2 = summ_data.get("spell2", {})

        if spell1.get("id"):
            summoners.append(
                {
                    "id": spell1["id"],
                    "name": spell1.get("name", get_spell_name(spell1["id"])),
                    "icon": get_spell_image_url(spell1["id"]),
                }
            )
        if spell2.get("id"):
            summoners.append(
                {
                    "id": spell2["id"],
                    "name": spell2.get("name", get_spell_name(spell2["id"])),
                    "icon": get_spell_image_url(spell2["id"]),
                }
            )

        # Fallback to ids array
        if not summoners and summ_data.get("ids"):
            for spell_id in summ_data["ids"]:
                summoners.append(
                    {
                        "id": spell_id,
                        "name": get_spell_name(spell_id),
                        "icon": get_spell_image_url(spell_id),
                    }
                )

        # === STATS ===
        stats = build_data.get("stats", {})
        winrate = stats.get("winrate")
        games = stats.get("games_analyzed")

        # === CACHE INFO ===
        cached = data.get("cached", False)
        cache_age_hours = data.get("cache_age_hours")

        return {
            "success": True,
            "error": None,
            "champion": data.get("champion", champion).title(),
            "champion_id": None,
            "role": data.get("role", role),
            "rank": data.get("rank", "MASTER"),
            "source": "api.hommet.ch",
            "runes": {
                "primary_tree": primary_tree_id,
                "primary_tree_icon": primary_tree_icon,
                "keystone": keystone_id,
                "keystone_icon": keystone_icon,
                "primary": primary_runes,
                "secondary_tree": secondary_tree_id,
                "secondary_tree_icon": secondary_tree_icon,
                "secondary": secondary_runes,
                "shards": shards,
            },
            "items": {
                "starting": starting_items,
                "core": core_items,
                "boots": boots,
                "full_build": full_build_items,
                "situational": situational_items,
            },
            "skills": {"order": skill_order, "priority": priority_str},
            "summoners": summoners,
            "winrate": winrate,
            "pickrate": runes_data.get("pickrate"),
            "games": games,
            "cached": cached,
            "cache_age_hours": cache_age_hours,
        }

    def _make_error_response(self, error_msg: str, champion: str, role: str) -> dict:
        """
        Create a standardized error response.

        Args:
            error_msg: Error message
            champion: Champion name
            role: Champion role

        Returns:
            dict: Error response
        """
        return {
            "success": False,
            "error": error_msg,
            "champion": champion,
            "role": role,
            "runes": {
                "keystone_icon": None,
                "primary": [],
                "secondary": [],
                "shards": [],
            },
            "items": {"starting": [], "core": [], "boots": None},
            "skills": {"order": [], "priority": ""},
            "summoners": [],
            "winrate": None,
            "pickrate": None,
            "games": None,
        }

    # =========================================================================
    # TIERLIST ENDPOINT
    # =========================================================================

    def get_tierlist(self, role: str = None) -> dict:
        """
        Fetch tier list from API.

        The API aggregates Diamond+ data (Diamond, Master, Grandmaster, Challenger)
        for best statistics.

        Args:
            role: Optional role filter ('top', 'jungle', 'mid', 'adc', 'support')

        Returns:
            dict: Complete tier list with metadata
        """
        endpoint = "/tierlist"
        params = {}
        if role:
            params["role"] = role.lower()

        try:
            data = self._make_request("GET", endpoint, params=params if params else None)
            return self._format_tierlist_response(data, filtered_role=role)
        except APIError as e:
            logger.error(f"Tierlist error: {e}")
            return {
                "success": False,
                "error": str(e),
                "tier_list": {"S": [], "A": [], "B": [], "C": [], "D": []},
                "counts": {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0},
                "total_champions": 0,
                "last_update": None,
                "champions": [],
            }

    def _format_tierlist_response(self, data: dict, filtered_role: str = None) -> dict:
        """
        Format tier list response for the application.

        Args:
            data: Raw API response
            filtered_role: The role filter applied (e.g., 'top', 'mid', etc.)

        Returns:
            dict: Formatted tier list with flat list for table display
        """
        tier_list = data.get("tier_list", {})

        # Format champions in each tier with images
        formatted_tiers = {}
        flat_list = []
        rank_counter = 1

        for tier in ["S", "A", "B", "C", "D"]:
            tier_champions = tier_list.get(tier, [])
            formatted_tiers[tier] = []

            for champ in tier_champions:
                champion_name = champ.get("champion", "Unknown")
                roles = champ.get("roles", [])

                # Format winrate and pickrate
                winrate = champ.get("winrate")
                winrate_str = f"{winrate:.1f}%" if winrate is not None else "-"

                pickrate = champ.get("pickrate")
                pickrate_str = f"{pickrate:.1f}%" if pickrate is not None else "-"

                # Determine the role string to display
                # If a role filter was applied, show that specific role
                # Otherwise, show the role from the champion entry, or all roles, or "Flex" as fallback
                if filtered_role:
                    display_role = filtered_role.title()
                elif champ.get("role"):
                    # Single role from API (for global tierlist showing individual entries)
                    display_role = champ.get("role").title()
                elif roles:
                    display_role = ", ".join([r.title() for r in roles])
                else:
                    display_role = "Flex"

                # Create formatted entry
                formatted_entry = {
                    "champion": champion_name,
                    "name": champion_name.title(),
                    "tier": tier,
                    "winrate": winrate,
                    "winrate_str": winrate_str,
                    "pickrate": pickrate,
                    "pickrate_str": pickrate_str,
                    "games_analyzed": champ.get("games_analyzed", 0),
                    "roles": roles,
                    "roles_str": display_role,
                    "performance_score": champ.get("performance_score", 0),
                    "image": f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VERSION}/img/champion/{champion_name.title()}.png",
                }

                formatted_tiers[tier].append(formatted_entry)

                # Add to flat list for table display
                flat_list.append(
                    {
                        "rank": str(rank_counter),
                        "name": champion_name.title(),
                        "role": formatted_entry["roles_str"],
                        "tier": tier,
                        "winrate": winrate_str,
                        "pickrate": pickrate_str,
                        "games": champ.get("games_analyzed", 0),
                    }
                )
                rank_counter += 1

        return {
            "success": True,
            "rank": data.get("rank", "MASTER"),
            "tier_list": formatted_tiers,
            "counts": data.get("counts", {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0}),
            "total_champions": data.get("total_champions", 0),
            "last_update": data.get("last_update"),
            "champions": flat_list,
        }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_api_client: Optional[LeagueAPIClient] = None


def get_api_client() -> LeagueAPIClient:
    """
    Get the singleton API client instance.

    Returns:
        LeagueAPIClient: The API client instance
    """
    global _api_client
    if _api_client is None:
        _api_client = LeagueAPIClient()
    return _api_client


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================


def fetch_build(
    champion: str, role: str = "default", force_refresh: bool = False
) -> dict:
    """
    Utility function to fetch a champion build.

    The API aggregates Diamond+ data for best statistics.

    Args:
        champion: Champion name
        role: Champion role
        force_refresh: Force cache refresh

    Returns:
        dict: Complete build data
    """
    client = get_api_client()
    return client.get_build(champion, role, force_refresh)


def fetch_tierlist(role: str = None) -> dict:
    """
    Utility function to fetch the tier list.

    The API aggregates Diamond+ data for best statistics.

    Args:
        role: Optional role filter ('top', 'jungle', 'mid', 'adc', 'support')

    Returns:
        dict: Complete tier list with tier_list, counts, last_update, champions
    """
    client = get_api_client()
    return client.get_tierlist(role=role)


# =============================================================================
# TEST / DEBUG
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("Testing API Client...")

    client = LeagueAPIClient()

    # Test Build
    print("\n--- Testing Build Endpoint ---")
    try:
        build = client.get_build("Jinx", "adc")
        print(f"Build success: {build.get('success')}")
        print(f"Champion: {build.get('champion')}")
        print(f"Winrate: {build.get('winrate')}")
        print(f"Games analyzed: {build.get('games')}")
    except APIError as e:
        print(f"Build error: {e}")

    # Test Tierlist
    print("\n--- Testing Tierlist Endpoint ---")
    try:
        tierlist = client.get_tierlist()
        print(f"Tierlist success: {tierlist.get('success')}")
        print(f"Total champions: {tierlist.get('total_champions')}")
        print(f"Last update: {tierlist.get('last_update')}")
    except APIError as e:
        print(f"Tierlist error: {e}")
