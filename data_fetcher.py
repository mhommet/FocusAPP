"""
FocusAPP - Data Fetcher
===============================================

Data Sources:
- Custom API (api.hommet.ch): Build data (runes, items, skills, summoners) and Tier List
- DDragon: Champion list, item images, spell images
- CommunityDragon: Rune/perk images
"""

import requests
import json
import time
import logging

# Import api_client at module level for PyInstaller compatibility
import api_client

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

DDRAGON_VER = "14.10.1"
CACHE_BUILD = {}
CHAMPION_ID_MAP = {}  # name -> id mapping
CHAMPION_KEY_MAP = {}  # id -> key mapping (for DDragon)

# U.GG API Configuration
UGG_API_VERSION = "1.5"
UGG_DATA_VERSION = "1.5.0"


def update_ddragon_version():
    """Fetch latest DDragon version"""
    global DDRAGON_VER
    try:
        versions = requests.get(
            "https://ddragon.leagueoflegends.com/api/versions.json", timeout=10
        ).json()
        DDRAGON_VER = versions[0]
        logger.info(f"[DDragon] Version: {DDRAGON_VER}")
    except Exception as e:
        logger.error(f"[DDragon] Version fetch failed: {e}")


def build_champion_id_map():
    """
    Build champion name -> ID mapping from DDragon.
    This is required because U.GG API uses numeric champion IDs.
    """
    global CHAMPION_ID_MAP, CHAMPION_KEY_MAP

    try:
        url = f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/data/en_US/champion.json"
        data = requests.get(url, timeout=10).json()["data"]

        for key, champ in data.items():
            champ_id = int(champ["key"])
            champ_name = champ["name"]

            # Map name -> id (for API calls)
            CHAMPION_ID_MAP[champ_name.lower()] = champ_id

            # Also map common variations
            name_normalized = (
                champ_name.lower().replace(" ", "").replace("'", "").replace(".", "")
            )
            CHAMPION_ID_MAP[name_normalized] = champ_id

            # Map id -> key (for DDragon images)
            CHAMPION_KEY_MAP[champ_id] = key

        # Manual overrides for edge cases
        CHAMPION_ID_MAP["wukong"] = 62
        CHAMPION_ID_MAP["monkeyking"] = 62
        CHAMPION_ID_MAP["nunu"] = 20
        CHAMPION_ID_MAP["nunu & willump"] = 20
        CHAMPION_ID_MAP["renata glasc"] = 888
        CHAMPION_ID_MAP["renata"] = 888

        logger.info(f"[DDragon] Loaded {len(CHAMPION_ID_MAP)} champion mappings")

    except Exception as e:
        logger.error(f"[DDragon] Failed to build champion map: {e}")


# Initialize on module load - wrapped in try-except to prevent import failures
try:
    update_ddragon_version()
    build_champion_id_map()
    logger.info("[data_fetcher] Module initialized successfully")
except Exception as e:
    logger.error(f"[data_fetcher] Module initialization error: {e}")

# =============================================================================
# IMAGE URL GENERATORS
# =============================================================================


def get_item_image_url(item_id) -> str:
    """Generate DDragon URL for item image"""
    return (
        f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/img/item/{item_id}.png"
    )


def get_spell_image_url(spell_id: int) -> str:
    """Generate DDragon URL for summoner spell image"""
    spell_map = {
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
    spell_name = spell_map.get(int(spell_id), f"Summoner{spell_id}")
    return f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/img/spell/{spell_name}.png"


def get_spell_name(spell_id: int) -> str:
    """Get summoner spell display name"""
    names = {
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
    return names.get(int(spell_id), f"Spell {spell_id}")


# =============================================================================
# RUNE IMAGE MAPPING (CommunityDragon)
# =============================================================================

CDRAGON_BASE = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/"

RUNE_PATHS = {
    # Precision Tree
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
    8299: "perk-images/Styles/Precision/LastStand/LastStand.png",
    # Domination Tree
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
    # Sorcery Tree
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
    # Resolve Tree
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
    # Inspiration Tree
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
    9304: "perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png",  # ID corrigé
    9347: "perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png",  # ID corrigé
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

def get_rune_image_url(rune_id: int) -> str:
    """Generate CommunityDragon URL for rune image (FIXED for 16.1)"""
    rune_id = int(rune_id)

    # Use the RUNE_PATHS dictionary if available
    if rune_id in RUNE_PATHS:
        return f"{CDRAGON_BASE}{RUNE_PATHS[rune_id]}"

    # Fallback: Try generic path (works for most runes)
    # CommunityDragon structure: /perk-images/Styles/{StyleID}/{RuneName}/{RuneName}.png
    # For unknown runes, use a generic approach
    return f"https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Precision/Conqueror/Conqueror.png"


def get_rune_name(rune_id: int) -> str:
    """Get rune display name"""
    return RUNE_NAMES.get(int(rune_id), f"Rune {rune_id}")


# =============================================================================
# U.GG API - BUILD FETCHER (CORRECTED VERSION)
# =============================================================================

# Role mapping for U.GG API (UPDATED FOR PATCH 16.1+)
UGG_ROLE_MAP = {
    "top": 1,  # Changed from 6 to 1
    "jungle": 2,  # Changed from 2 to 2 (same)
    "mid": 4,  # Changed from 3/8 to 4
    "middle": 4,
    "adc": 3,  # Changed from 4 to 3
    "bot": 3,
    "bottom": 3,
    "support": 5,  # Same (5)
    "supp": 5,
    "default": 1,  # Changed from 6 to 1
}

UGG_RANK_MAP = {
    "challenger": 1,
    "grandmaster": 2,
    "master": 3,
    "diamond": 4,
    "emerald": 5,
    "platinum": 6,
    "gold": 7,
    "silver": 8,
    "bronze": 9,
    "iron": 10,
    "platinum_plus": 10,
    "diamond_plus": 11,
    "master_plus": 12,
    "overall": 12,
}


def get_champion_id(champion_name: str) -> int:
    """Convert champion name to numeric ID for U.GG API"""
    if not champion_name:
        return None # type: ignore

    name_lower = champion_name.lower()
    if name_lower in CHAMPION_ID_MAP:
        return CHAMPION_ID_MAP[name_lower]

    normalized = name_lower.replace(" ", "").replace("'", "").replace(".", "")
    if normalized in CHAMPION_ID_MAP:
        return CHAMPION_ID_MAP[normalized]

    logger.warning(f"[U.GG] Champion not found: {champion_name}")
    return None # type: ignore


def get_ugg_build(
    champion_name: str,
    role: str = "default",
    force_refresh: bool = False
) -> dict:
    """
    Fetch champion build from custom API (api.hommet.ch).

    This function uses the new API client. The API automatically aggregates
    Diamond+ data (Diamond, Master, Grandmaster, Challenger) for best statistics.

    Args:
        champion_name: Champion name (e.g., "Jinx", "Lee Sin")
        role: Role ("top", "jungle", "mid", "adc", "support", "default")
        force_refresh: If True, bypass cache and fetch fresh data

    Returns:
        dict with runes, items, summoners, skills, winrate, cache info
    """
    refresh_str = " (force refresh)" if force_refresh else ""
    logger.info(f"[API] Fetching build: {champion_name} @ {role} (Diamond+){refresh_str}")

    try:
        result = api_client.fetch_build(champion_name, role, force_refresh)
        if result.get("success"):
            cache_info = f" [cached: {result.get('cache_age_hours', 0):.1f}h]" if result.get("cached") else " [fresh]"
            logger.info(f"[API] Successfully fetched build for {champion_name}{cache_info}")
        else:
            logger.error(f"[API] Build fetch failed: {result.get('error')}")
        return result

    except Exception as e:
        logger.error(f"[API] Error fetching build: {e}")
        return {
            "success": False,
            "error": str(e),
            "champion": champion_name,
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
            "cached": False,
            "cache_age_hours": None
        }


# =============================================================================
# DDRAGON UTILITIES
# =============================================================================


def get_champion_list() -> list:
    """Fetch champion list from DDragon for the dropdown"""
    try:
        url = f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/data/en_US/champion.json"
        data = requests.get(url, timeout=10).json()["data"]
        champions = []
        for key, val in data.items():
            champions.append(
                {
                    "id": val["id"],
                    "key": val["key"],
                    "name": val["name"],
                    "image": f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/img/champion/{val['image']['full']}",
                }
            )
        champions.sort(key=lambda x: x["name"])
        return champions
    except Exception as e:
        logger.error(f"[DDragon] Error fetching champions: {e}")
        return []


def get_items_data() -> list:
    """Fetch items list from DDragon"""
    try:
        url = f"https://ddragon.leagueoflegends.com/cdn/{DDRAGON_VER}/data/en_US/item.json"
        data = requests.get(url, timeout=10).json()["data"]
        items = []

        # Mapping DDragon stat keys to frontend filter values
        stat_mapping = {
            "FlatPhysicalDamageMod": "ad",
            "FlatMagicDamageMod": "ap",
            "FlatHPPoolMod": "health",
            "PercentHPPoolMod": "health",
            "FlatArmorMod": "armor",
            "FlatSpellBlockMod": "mr",
            "PercentAttackSpeedMod": "as",
            "FlatCritChanceMod": "crit",
        }

        for item_id, val in data.items():
            if not val.get("gold", {}).get("purchasable", True):
                continue
            gold = val["gold"]["total"]
            category = (
                "legendary" if gold >= 2500 else ("epic" if gold >= 1000 else "basic")
            )

            # Detect stat types from DDragon stats object
            item_stats = val.get("stats", {})
            stat_types = []
            for ddragon_key, filter_value in stat_mapping.items():
                if ddragon_key in item_stats and item_stats[ddragon_key] != 0:
                    if filter_value not in stat_types:
                        stat_types.append(filter_value)

            # Primary stat_type is the first detected stat (for single-stat filtering)
            # stat_types list allows for multi-stat filtering if needed
            primary_stat = stat_types[0] if stat_types else None

            items.append(
                {
                    "id": item_id,
                    "name": val["name"],
                    "description": val.get("plaintext", ""),
                    "gold": gold,
                    "image": get_item_image_url(item_id),
                    "category": category,
                    "stats": val.get("plaintext", ""),
                    "stat_type": primary_stat,
                    "stat_types": stat_types,
                    "efficiency": 100,
                }
            )
        return items
    except Exception as e:
        logger.error(f"[DDragon] Error fetching items: {e}")
        return []


# =============================================================================
# TIER LIST (API)
# =============================================================================


def scrape_tierlist(role: str = None) -> dict:
    """
    Fetch tier list from custom API (api.hommet.ch).

    The API automatically aggregates Diamond+ data (Diamond, Master,
    Grandmaster, Challenger) for best statistics.

    Args:
        role: Optional role filter ('top', 'jungle', 'mid', 'adc', 'support')

    Returns:
        dict: {
            "success": bool,
            "tier_list": {"S": [...], "A": [...], "B": [...], "C": [...], "D": [...]},
            "counts": {"S": int, "A": int, ...},
            "total_champions": int,
            "last_update": str (ISO datetime),
            "champions": [...] (flat list for table)
        }
    """
    role_str = f" for role={role}" if role else ""
    logger.info(f"[API] Fetching Tier List (Diamond+ aggregated){role_str}...")

    try:
        result = api_client.fetch_tierlist(role=role)
        if result.get("success"):
            logger.info(f"[API] Successfully fetched tier list: {result.get('total_champions')} champions")
        else:
            logger.error(f"[API] Tier list fetch failed: {result.get('error')}")
        return result

    except Exception as e:
        logger.error(f"[API] Error fetching tier list: {e}")
        return {
            "success": False,
            "error": str(e),
            "tier_list": {"S": [], "A": [], "B": [], "C": [], "D": []},
            "counts": {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0},
            "total_champions": 0,
            "last_update": None,
            "champions": []
        }
