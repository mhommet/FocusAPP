"""
Focus App - Main Entry Point
===================================================

A desktop application for viewing champion builds, tier lists, and items data.
Built with Eel (Python + HTML/CSS/JS).

Author: Milan Hommet
License: MIT
"""

import os
import sys
import traceback

# =============================================================================
# GLOBAL EXCEPTION HANDLER - Catches ALL errors including import failures
# =============================================================================

def write_crash_log(error_msg):
    """Write crash info to a file even if logging isn't set up yet."""
    try:
        if getattr(sys, 'frozen', False):
            crash_file = os.path.join(os.path.dirname(sys.executable), 'CRASH_LOG.txt')
        else:
            crash_file = 'CRASH_LOG.txt'
        with open(crash_file, 'w', encoding='utf-8') as f:
            f.write("FOCUS APP CRASH LOG\n")
            f.write("=" * 60 + "\n")
            f.write(f"Python: {sys.version}\n")
            f.write(f"Frozen: {getattr(sys, 'frozen', False)}\n")
            if getattr(sys, 'frozen', False):
                f.write(f"Executable: {sys.executable}\n")
                f.write(f"MEIPASS: {getattr(sys, '_MEIPASS', 'N/A')}\n")
            f.write("=" * 60 + "\n\n")
            f.write("ERROR:\n")
            f.write(error_msg)
        print(f"Crash log written to: {crash_file}")
    except:
        pass

def global_exception_handler(exc_type, exc_value, exc_tb):
    """Handle uncaught exceptions."""
    error_msg = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
    write_crash_log(error_msg)
    print("\n" + "=" * 60)
    print("FATAL ERROR:")
    print("=" * 60)
    print(error_msg)
    print("=" * 60)
    print("Check CRASH_LOG.txt for details")
    input("Press Enter to exit...")
    sys.exit(1)

# Install global exception handler
sys.excepthook = global_exception_handler

import logging

# =============================================================================
# LOGGING CONFIGURATION - MUST BE FIRST
# =============================================================================

def setup_logging():
    """
    Configure logging to both console and file.
    In PyInstaller mode, logs go to a file next to the exe for debugging.
    """
    log_format = "[%(asctime)s] [%(levelname)s] %(name)s: %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Determine log file location
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller exe - log next to exe
        exe_dir = os.path.dirname(sys.executable)
        log_file = os.path.join(exe_dir, 'focus_debug.log')
    else:
        # Running as script - log in current directory
        log_file = 'focus_debug.log'

    # Create handlers
    handlers = [
        logging.StreamHandler(sys.stdout),  # Console output
        logging.FileHandler(log_file, mode='w', encoding='utf-8')  # File output
    ]

    # Configure root logger
    logging.basicConfig(
        level=logging.DEBUG,  # Capture all levels for debugging
        format=log_format,
        datefmt=date_format,
        handlers=handlers
    )

    return log_file

# Setup logging FIRST before ANY other imports
log_file_path = setup_logging()
logger = logging.getLogger(__name__)
logger.info("=" * 60)
logger.info("FOCUS App starting...")
logger.info("=" * 60)
logger.info(f"Log file: {log_file_path}")
logger.info(f"Python version: {sys.version}")
logger.info(f"Frozen: {getattr(sys, 'frozen', False)}")
if getattr(sys, 'frozen', False):
    logger.info(f"Executable: {sys.executable}")
    logger.info(f"MEIPASS: {getattr(sys, '_MEIPASS', 'N/A')}")

# =============================================================================
# IMPORTS - After logging is configured
# =============================================================================

logger.info("Importing modules...")

try:
    import ctypes
    logger.info("ctypes imported")
except Exception as e:
    logger.error(f"Failed to import ctypes: {e}", exc_info=True)

try:
    import platform
    logger.info("platform imported")
except Exception as e:
    logger.error(f"Failed to import platform: {e}", exc_info=True)

try:
    import eel
    logger.info("eel imported")
except Exception as e:
    logger.error(f"Failed to import eel: {e}", exc_info=True)
    raise

try:
    import data_fetcher
    logger.info("data_fetcher imported successfully")
except Exception as e:
    logger.error(f"Failed to import data_fetcher: {e}", exc_info=True)
    raise

from typing import Optional

# =============================================================================
# PYINSTALLER PATH HANDLING
# =============================================================================

def get_resource_path(relative_path: str) -> str:
    """
    Get absolute path to resource, works for dev and PyInstaller builds.

    Args:
        relative_path: Relative path to the resource

    Returns:
        str: Absolute path to the resource
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled executable (PyInstaller)
        base_path = sys._MEIPASS # pyright: ignore[reportAttributeAccessIssue]
    else:
        # Running as script
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)


# Determine web folder path
WEB_FOLDER = get_resource_path('web')
logger.info(f"Web folder path: {WEB_FOLDER}")
logger.info(f"Web folder exists: {os.path.exists(WEB_FOLDER)}")

# List web folder contents for debugging
if os.path.exists(WEB_FOLDER):
    try:
        web_contents = os.listdir(WEB_FOLDER)
        logger.info(f"Web folder contents: {web_contents}")
    except Exception as e:
        logger.error(f"Cannot list web folder: {e}")

# Windows app ID for taskbar grouping
if platform.system() == "Windows":
    myappid = "devops.focus.app.v1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)

# Initialize Eel with the correct web folder
try:
    eel.init(WEB_FOLDER)
    logger.info("Eel initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Eel: {e}", exc_info=True)


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
        logger.debug(f"Tier list response: success={data.get('success') if data else 'None'}")
        if not data or not data.get("success", False):
            error_msg = data.get("error", "Failed to fetch tier list") if data else "No data returned"
            logger.error(f"Tier list failed: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "tier_list": {"S": [], "A": [], "B": [], "C": [], "D": []},
                "counts": {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0},
                "total_champions": 0,
                "last_update": None,
                "champions": [],
            }
        logger.info(f"Tier list loaded: {data.get('total_champions', 0)} champions")
        return data
    except Exception as e:
        logger.error(f"Tier List Error: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Exception: {str(e)}",
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
        champions = data_fetcher.get_champion_list()
        logger.info(f"Champion list loaded: {len(champions)} champions")
        return champions
    except Exception as e:
        logger.error(f"Champion List Error: {e}", exc_info=True)
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
        items = data_fetcher.get_items_data()
        logger.info(f"Items data loaded: {len(items)} items")
        return items
    except Exception as e:
        logger.error(f"Items Error: {e}", exc_info=True)
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
        result = data_fetcher.get_ugg_build(champion_name, role, force_refresh)
        logger.debug(f"Build result: success={result.get('success')}")
        return result
    except Exception as e:
        logger.error(f"Build Error: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Exception: {str(e)}",
            "champion": champion_name,
            "role": role,
            "cached": False,
            "cache_age_hours": None,
        }


# =============================================================================
# APP STARTUP
# =============================================================================

def start_app():
    """Start the Eel application with fallback browsers."""
    logger.info("Starting Eel server on port 8080...")

    # Check if index.html exists
    index_path = os.path.join(WEB_FOLDER, 'index.html')
    if not os.path.exists(index_path):
        logger.error(f"index.html not found at: {index_path}")
        raise FileNotFoundError(f"index.html not found at: {index_path}")

    # Try Chrome first
    try:
        logger.info("Trying Chrome...")
        eel.start(
            "index.html",
            size=(1100, 750),
            port=8080,
            mode='chrome',
            cmdline_args=['--disable-gpu']
        )
        return True
    except EnvironmentError as e:
        logger.warning(f"Chrome not available: {e}")

    # Try Edge
    try:
        logger.info("Trying Edge...")
        eel.start(
            "index.html",
            size=(1100, 750),
            port=8080,
            mode='edge'
        )
        return True
    except Exception as e:
        logger.warning(f"Edge not available: {e}")

    # Try default browser
    try:
        logger.info("Trying default browser...")
        eel.start(
            "index.html",
            size=(1100, 750),
            port=8080,
            mode=None
        )
        return True
    except Exception as e:
        logger.error(f"No browser available: {e}")
        raise


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Starting FOCUS application...")
    logger.info("=" * 60)

    try:
        start_app()
    except Exception as e:
        logger.critical(f"Failed to start application: {e}", exc_info=True)
        print("\n" + "=" * 60)
        print("APPLICATION FAILED TO START")
        print("=" * 60)
        print(f"Error: {e}")
        print("\nCheck focus_debug.log and CRASH_LOG.txt for details")
        print("=" * 60)
        input("\nPress Enter to exit...")
        sys.exit(1)
