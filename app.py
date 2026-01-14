"""
League of Legends Companion App - Main Entry Point
===================================================

A desktop application for viewing champion builds, tier lists, and items data.
Built with Eel (Python + HTML/CSS/JS).

Author: Milan Hommet
License: MIT
"""

import eel
import data_fetcher
import ctypes
import platform
import logging
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# Windows app ID for taskbar grouping
if platform.system() == "Windows":
    myappid = "devops.lolcompanion.app.v1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)

# Initialize Eel with the web folder
eel.init("web")


# =============================================================================
# EEL EXPOSED FUNCTIONS
# =============================================================================


@eel.expose
def get_app_version() -> str:
    """
    Get the current application version.

    Returns:
        str: Version string (e.g., "1.0.0")
    """
    return "1.0.0"


@eel.expose
def get_champion_tier_list() -> dict:
    """
    Fetch tier list from API.

    The API automatically aggregates Diamond+ data (Diamond, Master,
    Grandmaster, Challenger) for best statistics.

    Returns:
        dict: Tier list data with the following structure:
            - success (bool): Whether the request succeeded
            - tier_list (dict): Champions grouped by tier (S, A, B, C, D)
            - counts (dict): Number of champions per tier
            - total_champions (int): Total number of champions
            - last_update (str): ISO datetime of last update
            - champions (list): Flat list for table compatibility
    """
    logger.info("Fetching Tier List (Diamond+ aggregated)...")
    try:
        data = data_fetcher.scrape_tierlist()
        if not data or not data.get("success", False):
            return {
                "success": False,
                "error": data.get("error", "Failed to fetch tier list"),
                "tier_list": {"S": [], "A": [], "B": [], "C": [], "D": []},
                "counts": {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0},
                "total_champions": 0,
                "last_update": None,
                "champions": [],
            }
        return data
    except Exception as e:
        logger.error(f"Tier List Error: {e}")
        return {
            "success": False,
            "error": str(e),
            "tier_list": {"S": [], "A": [], "B": [], "C": [], "D": []},
            "counts": {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0},
            "total_champions": 0,
            "last_update": None,
            "champions": [],
        }


@eel.expose
def get_champion_list() -> list:
    """
    Fetch champion list from DDragon.

    Returns:
        list: List of champion objects with id, name, key, and image URL
    """
    logger.info("Fetching Champion List...")
    try:
        return data_fetcher.get_champion_list()
    except Exception as e:
        logger.error(f"Champion List Error: {e}")
        return []


@eel.expose
def get_items_data() -> list:
    """
    Fetch items data from DDragon.

    Returns:
        list: List of item objects with id, name, gold, stats, and image URL
    """
    logger.info("Fetching Items Data...")
    try:
        return data_fetcher.get_items_data()
    except Exception as e:
        logger.error(f"Items Error: {e}")
        return []


@eel.expose
def get_ugg_build(
    champion_name: str,
    role: str = "default",
    force_refresh: bool = False
) -> dict:
    """
    Fetch champion build from API.

    The API automatically aggregates Diamond+ data (Diamond, Master,
    Grandmaster, Challenger) for best statistics.

    Args:
        champion_name: Champion name (e.g., "Jinx", "Lee Sin")
        role: Role ("top", "jungle", "mid", "adc", "support", "default")
        force_refresh: If True, bypass cache and fetch fresh data

    Returns:
        dict: Complete build data including:
            - runes: Keystone, primary, secondary, and shards
            - items: Starting, core, boots, full build, situational
            - skills: Skill priority order
            - summoners: Summoner spells
            - winrate: Win rate percentage
            - games: Number of games analyzed
            - cached: Whether data was from cache
            - cache_age_hours: Age of cached data in hours
    """
    refresh_str = " [force refresh]" if force_refresh else ""
    logger.info(f"Fetching Build: {champion_name} ({role}, Diamond+){refresh_str}")
    try:
        return data_fetcher.get_ugg_build(champion_name, role, force_refresh)
    except Exception as e:
        logger.error(f"Build Error: {e}")
        return {
            "success": False,
            "error": str(e),
            "champion": champion_name,
            "role": role,
            "cached": False,
            "cache_age_hours": None,
        }


# =============================================================================
# APP STARTUP
# =============================================================================

if __name__ == "__main__":
    logger.info("Starting FOCUS...")
    eel.start("index.html", size=(1100, 750), port=8080)
