//! OOTP league stats exports: `<year>.<leagueNumber>` format ids and the
//! strict filename rule the desktop uses to infer them.

const MIN_YEAR: u32 = 1900;
const MAX_YEAR: u32 = 9999;
const MIN_LEAGUE_NUMBER: u32 = 50;
const MAX_LEAGUE_NUMBER: u32 = 500;

fn all_digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Parses `YYYY.N` (4-digit year, 2-3 digit number) and range-checks both parts.
pub fn parse_league_format_id(value: &str) -> Option<(u32, u32)> {
    let (year_text, number_text) = value.split_once('.')?;
    if year_text.len() != 4 || !(2..=3).contains(&number_text.len()) {
        return None;
    }
    if !all_digits(year_text) || !all_digits(number_text) {
        return None;
    }
    let year = year_text.parse::<u32>().ok()?;
    let number = number_text.parse::<u32>().ok()?;
    if !(MIN_YEAR..=MAX_YEAR).contains(&year)
        || !(MIN_LEAGUE_NUMBER..=MAX_LEAGUE_NUMBER).contains(&number)
    {
        return None;
    }
    Some((year, number))
}

/// A league export is only a file whose whole name is `YYYY.NN[N].csv`.
pub fn league_format_id_from_filename(filename: &str) -> Option<String> {
    let lowered = filename.to_ascii_lowercase();
    let stem = lowered.strip_suffix(".csv")?;
    let (year, number) = parse_league_format_id(stem)?;
    Some(format!("{year}.{number}"))
}

pub fn league_team_count_ok(team_count: u32) -> bool {
    team_count == 0 || (24..=36).contains(&team_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_ids_and_boundaries() {
        assert_eq!(parse_league_format_id("2050.403"), Some((2050, 403)));
        assert_eq!(parse_league_format_id("1959.500"), Some((1959, 500)));
        assert_eq!(parse_league_format_id("2050.50"), Some((2050, 50)));
        assert_eq!(parse_league_format_id("1900.50"), Some((1900, 50)));
    }

    #[test]
    fn rejects_out_of_range_and_malformed_ids() {
        assert_eq!(parse_league_format_id("2050.49"), None);
        assert_eq!(parse_league_format_id("2050.501"), None);
        assert_eq!(parse_league_format_id("1899.100"), None);
        assert_eq!(parse_league_format_id("2050.5"), None);
        assert_eq!(parse_league_format_id("2050.1000"), None);
        assert_eq!(parse_league_format_id("205.100"), None);
        assert_eq!(parse_league_format_id("2050"), None);
        assert_eq!(parse_league_format_id("2050.+10"), None);
        assert_eq!(parse_league_format_id("2050.10a"), None);
    }

    #[test]
    fn filename_rule_is_strict_and_canonical() {
        assert_eq!(league_format_id_from_filename("2050.403.csv").as_deref(), Some("2050.403"));
        assert_eq!(league_format_id_from_filename("2050.050.csv").as_deref(), Some("2050.50"));
        assert_eq!(league_format_id_from_filename("2050.403.CSV").as_deref(), Some("2050.403"));
        assert_eq!(league_format_id_from_filename("2050.49.csv"), None);
        assert_eq!(league_format_id_from_filename("2050.501.csv"), None);
        assert_eq!(league_format_id_from_filename("1899.100.csv"), None);
        assert_eq!(league_format_id_from_filename("2026-04-03.csv"), None);
        assert_eq!(league_format_id_from_filename("2070146.csv"), None);
        assert_eq!(league_format_id_from_filename("Q-2050.403.csv"), None);
        assert_eq!(league_format_id_from_filename("2050.403.txt"), None);
    }

    #[test]
    fn team_count_bounds() {
        assert!(league_team_count_ok(0));
        assert!(!league_team_count_ok(23));
        assert!(league_team_count_ok(24));
        assert!(league_team_count_ok(36));
        assert!(!league_team_count_ok(37));
    }
}
