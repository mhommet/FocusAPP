"""
Module pour récupérer les builds via l'API Riot
Inspiré de https://github.com/CookieDecide/LeagueBuilds
"""

import requests
import json
import os
import time
from collections import Counter

# Configuration
RIOT_API_KEY = os.environ.get("RIOT_API_KEY", "")  # Mettre ta clé API ici ou en variable d'environnement
CACHE_DIR = os.path.dirname(__file__)
CACHE_DURATION = 3600 * 6  # 6 heures

# Régions
REGIONS = {
    "euw": {"platform": "euw1", "regional": "europe"},
    "na": {"platform": "na1", "regional": "americas"},
    "kr": {"platform": "kr", "regional": "asia"},
}

# Mapping des rôles
ROLE_MAPPING = {
    "top": "TOP",
    "jungle": "JUNGLE",
    "mid": "MIDDLE",
    "adc": "BOTTOM",
    "support": "UTILITY"
}


def get_cache_path(champion_id, role):
    """Retourne le chemin du cache pour un champion/role"""
    return os.path.join(CACHE_DIR, f"build_cache_{champion_id}_{role}.json")


def load_build_cache(champion_id, role):
    """Charge le build depuis le cache s'il est valide"""
    cache_path = get_cache_path(champion_id, role)
    try:
        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
            if time.time() - cache.get("timestamp", 0) < CACHE_DURATION:
                return cache.get("data")
    except:
        pass
    return None


def save_build_cache(champion_id, role, data):
    """Sauvegarde le build dans le cache"""
    cache_path = get_cache_path(champion_id, role)
    try:
        cache = {
            "timestamp": time.time(),
            "champion_id": champion_id,
            "role": role,
            "data": data
        }
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
    except:
        pass


def get_champion_key_mapping():
    """Récupère le mapping nom -> key depuis Data Dragon"""
    try:
        versions = requests.get("https://ddragon.leagueoflegends.com/api/versions.json", timeout=5).json()
        version = versions[0]

        champs_url = f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
        champs_data = requests.get(champs_url, timeout=10).json()

        mapping = {}
        for champ_id, champ_info in champs_data["data"].items():
            # Mapping: nom en minuscules -> key numérique
            mapping[champ_id.lower()] = int(champ_info["key"])
            mapping[champ_info["name"].lower()] = int(champ_info["key"])

        return mapping, version
    except Exception as e:
        print(f"Erreur récupération champion mapping: {e}")
        return {}, "14.24.1"


def get_high_elo_players(region="euw", queue="RANKED_SOLO_5x5"):
    """Récupère les joueurs Challenger/Grandmaster/Master"""
    if not RIOT_API_KEY:
        return []

    platform = REGIONS.get(region, REGIONS["euw"])["platform"]
    headers = {"X-Riot-Token": RIOT_API_KEY}
    players = []

    try:
        # Challenger
        url = f"https://{platform}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/{queue}"
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok:
            data = resp.json()
            players.extend([p["summonerId"] for p in data.get("entries", [])[:50]])

        # Grandmaster
        url = f"https://{platform}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/{queue}"
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok:
            data = resp.json()
            players.extend([p["summonerId"] for p in data.get("entries", [])[:50]])

        return players
    except Exception as e:
        print(f"Erreur récupération joueurs high elo: {e}")
        return []


def get_puuid_from_summoner_id(summoner_id, region="euw"):
    """Convertit un summoner ID en PUUID"""
    if not RIOT_API_KEY:
        return None

    platform = REGIONS.get(region, REGIONS["euw"])["platform"]
    headers = {"X-Riot-Token": RIOT_API_KEY}

    try:
        url = f"https://{platform}.api.riotgames.com/lol/summoner/v4/summoners/{summoner_id}"
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok:
            return resp.json().get("puuid")
    except:
        pass
    return None


def get_recent_matches(puuid, region="euw", count=10):
    """Récupère les matchs récents d'un joueur"""
    if not RIOT_API_KEY:
        return []

    regional = REGIONS.get(region, REGIONS["euw"])["regional"]
    headers = {"X-Riot-Token": RIOT_API_KEY}

    try:
        url = f"https://{regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {"queue": 420, "count": count}  # 420 = Ranked Solo
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if resp.ok:
            return resp.json()
    except:
        pass
    return []


def get_match_details(match_id, region="euw"):
    """Récupère les détails d'un match"""
    if not RIOT_API_KEY:
        return None

    regional = REGIONS.get(region, REGIONS["euw"])["regional"]
    headers = {"X-Riot-Token": RIOT_API_KEY}

    try:
        url = f"https://{regional}.api.riotgames.com/lol/match/v5/matches/{match_id}"
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok:
            return resp.json()
    except:
        pass
    return None


def get_match_timeline(match_id, region="euw"):
    """Récupère la timeline d'un match (pour l'ordre des items)"""
    if not RIOT_API_KEY:
        return None

    regional = REGIONS.get(region, REGIONS["euw"])["regional"]
    headers = {"X-Riot-Token": RIOT_API_KEY}

    try:
        url = f"https://{regional}.api.riotgames.com/lol/match/v5/matches/{match_id}/timeline"
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok:
            return resp.json()
    except:
        pass
    return None


def extract_build_from_participant(participant, timeline_data=None, participant_id=None):
    """Extrait le build d'un participant"""
    build = {
        "champion_id": participant.get("championId"),
        "role": participant.get("teamPosition", ""),
        "win": participant.get("win", False),
        "items": [],
        "starting_items": [],
        "boots": None,
        "runes": {
            "primary": [],
            "secondary": [],
            "shards": []
        },
        "skill_order": [],
        "summoners": []
    }

    # Items finaux
    for i in range(7):
        item_id = participant.get(f"item{i}")
        if item_id and item_id > 0:
            # Vérifier si c'est des bottes (IDs connus)
            boots_ids = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
            if item_id in boots_ids:
                build["boots"] = item_id
            else:
                build["items"].append(item_id)

    # Runes (perks)
    perks = participant.get("perks", {})
    styles = perks.get("styles", [])

    if len(styles) >= 1:
        # Primary tree
        primary = styles[0]
        for selection in primary.get("selections", []):
            build["runes"]["primary"].append(selection.get("perk"))

    if len(styles) >= 2:
        # Secondary tree
        secondary = styles[1]
        for selection in secondary.get("selections", []):
            build["runes"]["secondary"].append(selection.get("perk"))

    # Stat perks (shards)
    stat_perks = perks.get("statPerks", {})
    if stat_perks:
        build["runes"]["shards"] = [
            stat_perks.get("offense"),
            stat_perks.get("flex"),
            stat_perks.get("defense")
        ]

    # Summoner spells
    build["summoners"] = [
        participant.get("summoner1Id"),
        participant.get("summoner2Id")
    ]

    # Extraire l'ordre des skills depuis la timeline si disponible
    if timeline_data and participant_id:
        skill_order = extract_skill_order(timeline_data, participant_id)
        build["skill_order"] = skill_order

    return build


def extract_skill_order(timeline_data, participant_id):
    """Extrait l'ordre des skills depuis la timeline"""
    skill_order = []
    skill_map = {1: "Q", 2: "W", 3: "E", 4: "R"}

    try:
        frames = timeline_data.get("info", {}).get("frames", [])
        for frame in frames:
            events = frame.get("events", [])
            for event in events:
                if event.get("type") == "SKILL_LEVEL_UP":
                    if event.get("participantId") == participant_id:
                        skill_slot = event.get("skillSlot")
                        if skill_slot in skill_map:
                            skill_order.append(skill_map[skill_slot])
    except:
        pass

    return skill_order


def extract_starting_items(timeline_data, participant_id):
    """Extrait les items de départ depuis la timeline"""
    starting_items = []

    try:
        frames = timeline_data.get("info", {}).get("frames", [])
        if frames:
            first_frame = frames[0]
            events = first_frame.get("events", [])
            for event in events:
                if event.get("type") == "ITEM_PURCHASED":
                    if event.get("participantId") == participant_id:
                        if event.get("timestamp", 0) < 30000:  # Avant 30 secondes
                            starting_items.append(event.get("itemId"))
    except:
        pass

    return starting_items


def aggregate_builds(builds):
    """Agrège plusieurs builds pour trouver le plus populaire"""
    if not builds:
        return None

    # Compter les items
    all_items = []
    all_starting = []
    all_boots = []
    all_primary_runes = []
    all_secondary_runes = []
    all_shards = []
    all_skill_orders = []

    for build in builds:
        all_items.extend(build.get("items", []))
        all_starting.extend(build.get("starting_items", []))
        if build.get("boots"):
            all_boots.append(build["boots"])

        runes = build.get("runes", {})
        all_primary_runes.extend(runes.get("primary", []))
        all_secondary_runes.extend(runes.get("secondary", []))
        all_shards.extend([s for s in runes.get("shards", []) if s])

        if build.get("skill_order"):
            all_skill_orders.append(tuple(build["skill_order"][:3]))

    # Trouver les plus populaires
    def most_common(lst, n=6):
        if not lst:
            return []
        return [item for item, _ in Counter(lst).most_common(n)]

    # Déterminer l'ordre des skills le plus populaire
    skill_order = []
    if all_skill_orders:
        most_common_order = Counter(all_skill_orders).most_common(1)
        if most_common_order:
            skill_order = list(most_common_order[0][0])

    return {
        "items": {
            "core": most_common(all_items, 6),
            "starting": most_common(all_starting, 3),
            "boots": most_common(all_boots, 1)
        },
        "runes": {
            "primary": most_common(all_primary_runes, 4),
            "secondary": most_common(all_secondary_runes, 2),
            "shards": most_common(all_shards, 3)
        },
        "skill_order": skill_order,
        "sample_size": len(builds)
    }


def get_builds_from_api(champion_id, role="mid", region="euw", max_matches=20):
    """
    Récupère les builds d'un champion depuis l'API Riot
    en analysant les matchs des joueurs high elo
    """
    if not RIOT_API_KEY:
        print("    Pas de clé API Riot configurée")
        return None

    # Vérifier le cache
    cached = load_build_cache(champion_id, role)
    if cached:
        print(f"    Build chargé depuis le cache")
        return cached

    # Récupérer le mapping champion
    champion_mapping, _ = get_champion_key_mapping()
    champion_key = champion_mapping.get(champion_id.lower())

    if not champion_key:
        print(f"    Champion {champion_id} non trouvé")
        return None

    target_role = ROLE_MAPPING.get(role, "MIDDLE")
    builds = []

    print(f"    Récupération des joueurs high elo...")
    players = get_high_elo_players(region)[:20]  # Limiter pour éviter rate limit

    matches_checked = 0
    for summoner_id in players:
        if matches_checked >= max_matches:
            break

        puuid = get_puuid_from_summoner_id(summoner_id, region)
        if not puuid:
            continue

        time.sleep(0.1)  # Rate limiting

        match_ids = get_recent_matches(puuid, region, count=5)

        for match_id in match_ids:
            if matches_checked >= max_matches:
                break

            time.sleep(0.1)  # Rate limiting

            match_data = get_match_details(match_id, region)
            if not match_data:
                continue

            # Chercher le champion dans ce match
            participants = match_data.get("info", {}).get("participants", [])
            for participant in participants:
                if participant.get("championId") == champion_key:
                    if participant.get("teamPosition") == target_role:
                        # Récupérer la timeline pour les skills
                        timeline = get_match_timeline(match_id, region)
                        participant_id = participant.get("participantId")

                        build = extract_build_from_participant(participant, timeline, participant_id)

                        if timeline:
                            build["starting_items"] = extract_starting_items(timeline, participant_id)

                        builds.append(build)
                        matches_checked += 1
                        print(f"    Match {matches_checked}/{max_matches} trouvé")
                        break

    if builds:
        aggregated = aggregate_builds(builds)
        save_build_cache(champion_id, role, aggregated)
        return aggregated

    return None


# Pour tester sans clé API - données statiques par défaut
DEFAULT_BUILDS = {
    "aatrox": {
        "top": {
            "items": {
                "core": ["3161", "6697", "3071", "3053", "3156", "3026"],
                "starting": ["1054", "2003"],
                "boots": ["3111"]
            },
            "runes": {
                "primary": ["8010", "8009", "9105", "8299"],  # Conqueror
                "secondary": ["8444", "8451"],  # Resolve
                "shards": ["5008", "5008", "5001"]
            },
            "skill_order": ["Q", "E", "W"]
        }
    }
}


def get_default_build(champion_id, role):
    """Retourne un build par défaut si pas de clé API"""
    champion_builds = DEFAULT_BUILDS.get(champion_id.lower(), {})
    return champion_builds.get(role)
