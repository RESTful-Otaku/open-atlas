//! CLI entry point. Defines the Clap surface and dispatches to [`commands`] and [`http`].

use std::time::Duration;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use reqwest::{Client, Url};

mod commands;
mod http;

#[derive(Parser, Debug)]
#[command(name = "openatlas", about = "OpenAtlas SpacetimeDB inspector")]
struct Cli {
    /// SpacetimeDB server URL; overridden by OPENATLAS_STDB_URI.
    #[arg(
        long,
        env = "OPENATLAS_STDB_URI",
        default_value = "http://127.0.0.1:3000"
    )]
    base_url: String,
    /// Target database; overridden by OPENATLAS_STDB_DB.
    #[arg(long, env = "OPENATLAS_STDB_DB", default_value = "openatlas")]
    database: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Read-only views.
    View {
        #[command(subcommand)]
        command: ViewCommand,
    },
    /// Per-domain aggregate from world_state.
    State {
        #[arg(long)]
        domain: Option<String>,
    },
    /// Recent anomaly signals.
    Anomalies {
        #[arg(long)]
        domain: Option<String>,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Show an event and its causal links.
    Trace { event_id: u64 },
}

#[derive(Subcommand, Debug)]
enum ViewCommand {
    /// Recent events, newest first.
    Events {
        #[arg(long)]
        domain: Option<String>,
        #[arg(long, default_value_t = 20)]
        limit: usize,
        #[arg(long, default_value_t = false)]
        watch: bool,
        #[arg(long, default_value_t = 1_500, value_parser = clap::value_parser!(u64).range(100..30_000))]
        interval_ms: u64,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let base_url = Url::parse(&cli.base_url).context("invalid --base-url")?;
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .expect("valid reqwest Client");
    let db = cli.database.as_str();

    match cli.command {
        Command::View { command } => match command {
            ViewCommand::Events {
                domain,
                limit,
                watch,
                interval_ms,
            } => {
                commands::view_events(
                    &client,
                    &base_url,
                    db,
                    domain.as_deref(),
                    limit,
                    watch,
                    interval_ms,
                )
                .await?;
            }
        },
        Command::State { domain } => {
            commands::show_state(&client, &base_url, db, domain.as_deref()).await?;
        }
        Command::Anomalies { domain, limit } => {
            commands::show_anomalies(&client, &base_url, db, domain.as_deref(), limit).await?;
        }
        Command::Trace { event_id } => {
            commands::trace_event(&client, &base_url, db, event_id).await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn verify_cli() {
        Cli::command().debug_assert();
    }

    #[test]
    fn parse_state_subcommand() {
        let cli = Cli::try_parse_from(["openatlas", "state"]).unwrap();
        assert!(matches!(cli.command, Command::State { .. }));
        assert_eq!(cli.base_url, "http://127.0.0.1:3000");
        assert_eq!(cli.database, "openatlas");
    }

    #[test]
    fn parse_state_with_domain() {
        let cli =
            Cli::try_parse_from(["openatlas", "state", "--domain", "energy"]).unwrap();
        assert!(matches!(cli.command, Command::State { domain: Some(_) }));
    }

    #[test]
    fn parse_anomalies_subcommand() {
        let cli = Cli::try_parse_from(["openatlas", "anomalies"]).unwrap();
        assert!(matches!(cli.command, Command::Anomalies { .. }));
    }

    #[test]
    fn parse_anomalies_with_options() {
        let cli = Cli::try_parse_from([
            "openatlas",
            "anomalies",
            "--domain",
            "climate",
            "--limit",
            "50",
        ])
        .unwrap();
        assert!(matches!(cli.command, Command::Anomalies { .. }));
    }

    #[test]
    fn parse_trace_subcommand() {
        let cli = Cli::try_parse_from(["openatlas", "trace", "99"]).unwrap();
        assert!(matches!(cli.command, Command::Trace { .. }));
    }

    #[test]
    fn trace_missing_event_id_fails() {
        let result = Cli::try_parse_from(["openatlas", "trace"]);
        assert!(result.is_err());
    }

    #[test]
    fn parse_view_events() {
        let cli = Cli::try_parse_from(["openatlas", "view", "events"]).unwrap();
        assert!(matches!(cli.command, Command::View { .. }));
    }

    #[test]
    fn parse_view_events_with_all_options() {
        let cli = Cli::try_parse_from([
            "openatlas",
            "view",
            "events",
            "--domain",
            "cyber",
            "--limit",
            "100",
            "--watch",
            "--interval-ms",
            "500",
        ])
        .unwrap();
        assert!(matches!(cli.command, Command::View { .. }));
    }

    #[test]
    fn help_does_not_panic() {
        let result = Cli::try_parse_from(["openatlas", "--help"]);
        assert!(result.is_err());
    }

    #[test]
    fn base_url_override() {
        let cli = Cli::try_parse_from([
            "openatlas",
            "--base-url",
            "http://example.com:8080",
            "state",
        ])
        .unwrap();
        assert_eq!(cli.base_url, "http://example.com:8080");
    }

    #[test]
    fn database_override() {
        let cli =
            Cli::try_parse_from(["openatlas", "--database", "custom_db", "state"]).unwrap();
        assert_eq!(cli.database, "custom_db");
    }

    #[test]
    fn unknown_subcommand_fails() {
        let result = Cli::try_parse_from(["openatlas", "bogus"]);
        assert!(result.is_err());
    }
}
