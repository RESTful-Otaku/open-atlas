//! Gitignored dotenv files loaded before process configuration.

use std::path::Path;

const ENV_FILES: &[&str] = &[".dev/local.env", ".env"];

pub fn load_gitignored_env_files() {
    for path in ENV_FILES {
        load_env_file(path);
    }
}

fn load_env_file(path: &str) {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return;
    };
    for line in raw.lines() {
        if let Some((key, value)) = parse_env_line(line) {
            if std::env::var(&key).is_err() {
                std::env::set_var(key, value);
            }
        }
    }
}

fn parse_env_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    let (key, rest) = line.split_once('=')?;
    let key = key.trim();
    if key.is_empty() {
        return None;
    }
    let mut value = rest.trim().to_owned();
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        let quote = bytes[0];
        if (quote == b'"' || quote == b'\'') && bytes[value.len() - 1] == quote {
            value = value[1..value.len() - 1].to_owned();
        }
    }
    Some((key.to_owned(), value))
}

pub fn env_file_paths() -> Vec<String> {
    ENV_FILES
        .iter()
        .filter(|p| Path::new(p).exists())
        .map(|p| (*p).to_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_comments_and_quotes() {
        assert_eq!(
            parse_env_line("FRED_API_KEY=abc"),
            Some(("FRED_API_KEY".into(), "abc".into()))
        );
        assert_eq!(parse_env_line("  # comment"), None);
        assert_eq!(
            parse_env_line(r#"EIA_API_KEY="x=y""#),
            Some(("EIA_API_KEY".into(), "x=y".into()))
        );
    }
}
