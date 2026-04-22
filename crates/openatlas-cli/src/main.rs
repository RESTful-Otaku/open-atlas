//! Thin CLI entry point. All logic lives in:
//! * [`http`] — SpacetimeDB SQL helpers shared across subcommands.
//! * [`commands`] — non-interactive subcommand handlers.
//!
//! This module only defines the Clap surface and dispatches to the two.
//!
//! The CLI talks to SpacetimeDB directly via its HTTP SQL endpoint.
//! For an interactive dashboard, run the Svelte frontend — it uses the
//! SpacetimeDB TypeScript SDK and subscribes to live row updates.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use reqwest::{Client, Url};

mod commands;
mod http;

#[derive(Parser, Debug)]
#[command(name = "openatlas", about = "OpenAtlas SpacetimeDB inspector")]
struct Cli {
    /// Base URL of the SpacetimeDB server. Overridden by
    /// `OPENATLAS_STDB_URI` if set.
    #[arg(
        long,
        env = "OPENATLAS_STDB_URI",
        default_value = "http://127.0.0.1:3000"
    )]
    base_url: String,
    /// Database (module) name to query. Overridden by
    /// `OPENATLAS_STDB_DB` if set.
    #[arg(long, env = "OPENATLAS_STDB_DB", default_value = "openatlas")]
    database: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Read-only views of the SpacetimeDB state.
    View {
        #[command(subcommand)]
        command: ViewCommand,
    },
    /// Print the per-domain aggregate (`world_state` table).
    State {
        #[arg(long)]
        domain: Option<String>,
    },
    /// Print recent anomaly signals.
    Anomalies {
        #[arg(long)]
        domain: Option<String>,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Show an event and every causal edge that touches it.
    Trace { event_id: u64 },
}

#[derive(Subcommand, Debug)]
enum ViewCommand {
    /// List the most recent events, newest first.
    Events {
        #[arg(long)]
        domain: Option<String>,
        #[arg(long, default_value_t = 20)]
        limit: usize,
        #[arg(long, default_value_t = false)]
        watch: bool,
        #[arg(long, default_value_t = 1_500)]
        interval_ms: u64,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let base_url = Url::parse(&cli.base_url).context("invalid --base-url")?;
    let client = Client::new();
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
