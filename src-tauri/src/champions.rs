//! Champion name normalization module for League of Legends.
//!
//! Provides deterministic mapping from API names to display names and DDragon icon URLs.

use std::collections::HashMap;
use std::sync::LazyLock;

const DDRAGON_VERSION: &str = "14.10.1";
const DDRAGON_BASE: &str = "https://ddragon.leagueoflegends.com/cdn";

struct ChampionData {
    display_name: &'static str,
    ddragon_key: &'static str,
}

static CHAMPION_MAP: LazyLock<HashMap<&'static str, ChampionData>> = LazyLock::new(|| {
    let mut m = HashMap::new();

    // Champions with spaces
    m.insert("aurelionsol", ChampionData { display_name: "Aurelion Sol", ddragon_key: "AurelionSol" });
    m.insert("drmundo", ChampionData { display_name: "Dr. Mundo", ddragon_key: "DrMundo" });
    m.insert("jarvaniv", ChampionData { display_name: "Jarvan IV", ddragon_key: "JarvanIV" });
    m.insert("leesin", ChampionData { display_name: "Lee Sin", ddragon_key: "LeeSin" });
    m.insert("masteryi", ChampionData { display_name: "Master Yi", ddragon_key: "MasterYi" });
    m.insert("missfortune", ChampionData { display_name: "Miss Fortune", ddragon_key: "MissFortune" });
    m.insert("tahmkench", ChampionData { display_name: "Tahm Kench", ddragon_key: "TahmKench" });
    m.insert("twistedfate", ChampionData { display_name: "Twisted Fate", ddragon_key: "TwistedFate" });
    m.insert("xinzhao", ChampionData { display_name: "Xin Zhao", ddragon_key: "XinZhao" });
    m.insert("renataglasc", ChampionData { display_name: "Renata Glasc", ddragon_key: "Renata" });

    // Champions with apostrophes
    m.insert("belveth", ChampionData { display_name: "Bel'Veth", ddragon_key: "Belveth" });
    m.insert("chogath", ChampionData { display_name: "Cho'Gath", ddragon_key: "Chogath" });
    m.insert("kaisa", ChampionData { display_name: "Kai'Sa", ddragon_key: "Kaisa" });
    m.insert("kassadin", ChampionData { display_name: "Kassadin", ddragon_key: "Kassadin" });
    m.insert("khazix", ChampionData { display_name: "Kha'Zix", ddragon_key: "Khazix" });
    m.insert("kogmaw", ChampionData { display_name: "Kog'Maw", ddragon_key: "KogMaw" });
    m.insert("ksante", ChampionData { display_name: "K'Sante", ddragon_key: "KSante" });
    m.insert("reksai", ChampionData { display_name: "Rek'Sai", ddragon_key: "RekSai" });
    m.insert("velkoz", ChampionData { display_name: "Vel'Koz", ddragon_key: "Velkoz" });

    // Special DDragon keys
    m.insert("nunu", ChampionData { display_name: "Nunu & Willump", ddragon_key: "Nunu" });
    m.insert("nunuwillump", ChampionData { display_name: "Nunu & Willump", ddragon_key: "Nunu" });
    m.insert("wukong", ChampionData { display_name: "Wukong", ddragon_key: "MonkeyKing" });
    m.insert("monkeyking", ChampionData { display_name: "Wukong", ddragon_key: "MonkeyKing" });
    m.insert("fiddlesticks", ChampionData { display_name: "Fiddlesticks", ddragon_key: "Fiddlesticks" });

    // Champions with periods/special chars
    m.insert("kayn", ChampionData { display_name: "Kayn", ddragon_key: "Kayn" });
    m.insert("renata", ChampionData { display_name: "Renata Glasc", ddragon_key: "Renata" });

    // Two-word champions (lowercase input)
    m.insert("blindmonk", ChampionData { display_name: "Lee Sin", ddragon_key: "LeeSin" });

    m
});

static SIMPLE_CHAMPIONS: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut m = HashMap::new();

    // All standard champions (api_name lowercase -> DDragon key)
    m.insert("aatrox", "Aatrox");
    m.insert("ahri", "Ahri");
    m.insert("akali", "Akali");
    m.insert("akshan", "Akshan");
    m.insert("alistar", "Alistar");
    m.insert("ambessa", "Ambessa");
    m.insert("amumu", "Amumu");
    m.insert("anivia", "Anivia");
    m.insert("annie", "Annie");
    m.insert("aphelios", "Aphelios");
    m.insert("ashe", "Ashe");
    m.insert("aurora", "Aurora");
    m.insert("azir", "Azir");
    m.insert("bard", "Bard");
    m.insert("blitzcrank", "Blitzcrank");
    m.insert("brand", "Brand");
    m.insert("braum", "Braum");
    m.insert("briar", "Briar");
    m.insert("caitlyn", "Caitlyn");
    m.insert("camille", "Camille");
    m.insert("cassiopeia", "Cassiopeia");
    m.insert("corki", "Corki");
    m.insert("darius", "Darius");
    m.insert("diana", "Diana");
    m.insert("draven", "Draven");
    m.insert("ekko", "Ekko");
    m.insert("elise", "Elise");
    m.insert("evelynn", "Evelynn");
    m.insert("ezreal", "Ezreal");
    m.insert("fiora", "Fiora");
    m.insert("fizz", "Fizz");
    m.insert("galio", "Galio");
    m.insert("gangplank", "Gangplank");
    m.insert("garen", "Garen");
    m.insert("gnar", "Gnar");
    m.insert("gragas", "Gragas");
    m.insert("graves", "Graves");
    m.insert("gwen", "Gwen");
    m.insert("hecarim", "Hecarim");
    m.insert("heimerdinger", "Heimerdinger");
    m.insert("hwei", "Hwei");
    m.insert("illaoi", "Illaoi");
    m.insert("irelia", "Irelia");
    m.insert("ivern", "Ivern");
    m.insert("janna", "Janna");
    m.insert("jax", "Jax");
    m.insert("jayce", "Jayce");
    m.insert("jhin", "Jhin");
    m.insert("jinx", "Jinx");
    m.insert("kalista", "Kalista");
    m.insert("karma", "Karma");
    m.insert("karthus", "Karthus");
    m.insert("katarina", "Katarina");
    m.insert("kayle", "Kayle");
    m.insert("kennen", "Kennen");
    m.insert("kindred", "Kindred");
    m.insert("kled", "Kled");
    m.insert("leblanc", "Leblanc");
    m.insert("leona", "Leona");
    m.insert("lillia", "Lillia");
    m.insert("lissandra", "Lissandra");
    m.insert("lucian", "Lucian");
    m.insert("lulu", "Lulu");
    m.insert("lux", "Lux");
    m.insert("malphite", "Malphite");
    m.insert("malzahar", "Malzahar");
    m.insert("maokai", "Maokai");
    m.insert("milio", "Milio");
    m.insert("mordekaiser", "Mordekaiser");
    m.insert("morgana", "Morgana");
    m.insert("naafiri", "Naafiri");
    m.insert("nami", "Nami");
    m.insert("nasus", "Nasus");
    m.insert("nautilus", "Nautilus");
    m.insert("neeko", "Neeko");
    m.insert("nidalee", "Nidalee");
    m.insert("nilah", "Nilah");
    m.insert("nocturne", "Nocturne");
    m.insert("olaf", "Olaf");
    m.insert("orianna", "Orianna");
    m.insert("ornn", "Ornn");
    m.insert("pantheon", "Pantheon");
    m.insert("poppy", "Poppy");
    m.insert("pyke", "Pyke");
    m.insert("qiyana", "Qiyana");
    m.insert("quinn", "Quinn");
    m.insert("rakan", "Rakan");
    m.insert("rammus", "Rammus");
    m.insert("rell", "Rell");
    m.insert("renekton", "Renekton");
    m.insert("rengar", "Rengar");
    m.insert("riven", "Riven");
    m.insert("rumble", "Rumble");
    m.insert("ryze", "Ryze");
    m.insert("samira", "Samira");
    m.insert("sejuani", "Sejuani");
    m.insert("senna", "Senna");
    m.insert("seraphine", "Seraphine");
    m.insert("sett", "Sett");
    m.insert("shaco", "Shaco");
    m.insert("shen", "Shen");
    m.insert("shyvana", "Shyvana");
    m.insert("singed", "Singed");
    m.insert("sion", "Sion");
    m.insert("sivir", "Sivir");
    m.insert("skarner", "Skarner");
    m.insert("smolder", "Smolder");
    m.insert("sona", "Sona");
    m.insert("soraka", "Soraka");
    m.insert("swain", "Swain");
    m.insert("sylas", "Sylas");
    m.insert("syndra", "Syndra");
    m.insert("taliyah", "Taliyah");
    m.insert("talon", "Talon");
    m.insert("taric", "Taric");
    m.insert("teemo", "Teemo");
    m.insert("thresh", "Thresh");
    m.insert("tristana", "Tristana");
    m.insert("trundle", "Trundle");
    m.insert("tryndamere", "Tryndamere");
    m.insert("udyr", "Udyr");
    m.insert("urgot", "Urgot");
    m.insert("varus", "Varus");
    m.insert("vayne", "Vayne");
    m.insert("veigar", "Veigar");
    m.insert("vex", "Vex");
    m.insert("vi", "Vi");
    m.insert("viego", "Viego");
    m.insert("viktor", "Viktor");
    m.insert("vladimir", "Vladimir");
    m.insert("volibear", "Volibear");
    m.insert("warwick", "Warwick");
    m.insert("xayah", "Xayah");
    m.insert("xerath", "Xerath");
    m.insert("yasuo", "Yasuo");
    m.insert("yone", "Yone");
    m.insert("yorick", "Yorick");
    m.insert("yuumi", "Yuumi");
    m.insert("zac", "Zac");
    m.insert("zed", "Zed");
    m.insert("zeri", "Zeri");
    m.insert("ziggs", "Ziggs");
    m.insert("zilean", "Zilean");
    m.insert("zoe", "Zoe");
    m.insert("zyra", "Zyra");

    m
});

pub fn normalize_champion(api_name: &str) -> Option<(String, String)> {
    let key = api_name.to_lowercase();
    let key = key.trim();

    // Check special cases first
    if let Some(data) = CHAMPION_MAP.get(key) {
        let icon_url = format!("{}/{}/img/champion/{}.png", DDRAGON_BASE, DDRAGON_VERSION, data.ddragon_key);
        return Some((data.display_name.to_string(), icon_url));
    }

    // Check simple champions
    if let Some(ddragon_key) = SIMPLE_CHAMPIONS.get(key) {
        let display_name = capitalize_first(ddragon_key);
        let icon_url = format!("{}/{}/img/champion/{}.png", DDRAGON_BASE, DDRAGON_VERSION, ddragon_key);
        return Some((display_name, icon_url));
    }

    // Fallback: humanize the input
    let display_name = humanize_name(api_name);
    let icon_url = format!("{}/{}/img/champion/{}.png", DDRAGON_BASE, DDRAGON_VERSION, capitalize_first(api_name));
    Some((display_name, icon_url))
}

pub fn get_champion_icon_url(ddragon_key: &str) -> String {
    format!("{}/{}/img/champion/{}.png", DDRAGON_BASE, DDRAGON_VERSION, ddragon_key)
}

pub fn get_ddragon_key(api_name: &str) -> Option<String> {
    let key = api_name.to_lowercase();

    if let Some(data) = CHAMPION_MAP.get(key.as_str()) {
        return Some(data.ddragon_key.to_string());
    }

    if let Some(ddragon_key) = SIMPLE_CHAMPIONS.get(key.as_str()) {
        return Some(ddragon_key.to_string());
    }

    Some(capitalize_first(api_name))
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn humanize_name(s: &str) -> String {
    let mut result = String::new();
    let mut prev_lower = false;

    for c in s.chars() {
        if c.is_uppercase() && prev_lower {
            result.push(' ');
        }
        result.push(c);
        prev_lower = c.is_lowercase();
    }

    if result.is_empty() {
        return s.to_string();
    }

    let mut chars = result.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_special_champions() {
        let (name, url) = normalize_champion("jarvaniv").unwrap();
        assert_eq!(name, "Jarvan IV");
        assert!(url.contains("JarvanIV.png"));

        let (name, url) = normalize_champion("drmundo").unwrap();
        assert_eq!(name, "Dr. Mundo");
        assert!(url.contains("DrMundo.png"));

        let (name, url) = normalize_champion("missfortune").unwrap();
        assert_eq!(name, "Miss Fortune");
        assert!(url.contains("MissFortune.png"));

        let (name, url) = normalize_champion("kogmaw").unwrap();
        assert_eq!(name, "Kog'Maw");
        assert!(url.contains("KogMaw.png"));

        let (name, url) = normalize_champion("leesin").unwrap();
        assert_eq!(name, "Lee Sin");
        assert!(url.contains("LeeSin.png"));

        let (name, url) = normalize_champion("aurelionsol").unwrap();
        assert_eq!(name, "Aurelion Sol");
        assert!(url.contains("AurelionSol.png"));

        let (name, url) = normalize_champion("masteryi").unwrap();
        assert_eq!(name, "Master Yi");
        assert!(url.contains("MasterYi.png"));

        let (name, url) = normalize_champion("xinzhao").unwrap();
        assert_eq!(name, "Xin Zhao");
        assert!(url.contains("XinZhao.png"));

        let (name, url) = normalize_champion("tahmkench").unwrap();
        assert_eq!(name, "Tahm Kench");
        assert!(url.contains("TahmKench.png"));

        let (name, url) = normalize_champion("reksai").unwrap();
        assert_eq!(name, "Rek'Sai");
        assert!(url.contains("RekSai.png"));
    }

    #[test]
    fn test_normalize_apostrophe_champions() {
        let (name, _) = normalize_champion("khazix").unwrap();
        assert_eq!(name, "Kha'Zix");

        let (name, _) = normalize_champion("kaisa").unwrap();
        assert_eq!(name, "Kai'Sa");

        let (name, _) = normalize_champion("velkoz").unwrap();
        assert_eq!(name, "Vel'Koz");

        let (name, _) = normalize_champion("chogath").unwrap();
        assert_eq!(name, "Cho'Gath");

        let (name, _) = normalize_champion("belveth").unwrap();
        assert_eq!(name, "Bel'Veth");

        let (name, _) = normalize_champion("ksante").unwrap();
        assert_eq!(name, "K'Sante");
    }

    #[test]
    fn test_normalize_special_ddragon_keys() {
        let (name, url) = normalize_champion("wukong").unwrap();
        assert_eq!(name, "Wukong");
        assert!(url.contains("MonkeyKing.png"));

        let (name, url) = normalize_champion("nunu").unwrap();
        assert_eq!(name, "Nunu & Willump");
        assert!(url.contains("Nunu.png"));
    }

    #[test]
    fn test_normalize_case_insensitive() {
        let (name1, _) = normalize_champion("JARVANIV").unwrap();
        let (name2, _) = normalize_champion("jarvaniv").unwrap();
        let (name3, _) = normalize_champion("JarvanIV").unwrap();

        assert_eq!(name1, name2);
        assert_eq!(name2, name3);
    }

    #[test]
    fn test_normalize_simple_champions() {
        let (name, url) = normalize_champion("ahri").unwrap();
        assert_eq!(name, "Ahri");
        assert!(url.contains("Ahri.png"));

        let (name, url) = normalize_champion("yasuo").unwrap();
        assert_eq!(name, "Yasuo");
        assert!(url.contains("Yasuo.png"));

        let (name, url) = normalize_champion("jinx").unwrap();
        assert_eq!(name, "Jinx");
        assert!(url.contains("Jinx.png"));
    }

    #[test]
    fn test_get_ddragon_key() {
        assert_eq!(get_ddragon_key("wukong"), Some("MonkeyKing".to_string()));
        assert_eq!(get_ddragon_key("ahri"), Some("Ahri".to_string()));
        assert_eq!(get_ddragon_key("jarvaniv"), Some("JarvanIV".to_string()));
    }

    #[test]
    fn test_icon_url_format() {
        let (_, url) = normalize_champion("ahri").unwrap();
        assert!(url.starts_with("https://ddragon.leagueoflegends.com/cdn/"));
        assert!(url.contains("/img/champion/"));
        assert!(url.ends_with(".png"));
    }
}
