/**
 * Maps raw SpacetimeDB / subscription error strings to short remediation
 * hints for Settings, OpsStrip, and status surfaces.
 */

export type ConnectionErrorKind =
  | "unreachable"
  | "subscription"
  | "auth"
  | "config"
  | "unknown";

export type ConnectionErrorGuide = {
  kind: ConnectionErrorKind;
  summary: string;
  remediation: string;
};

const RULES: readonly {
  test: (msg: string) => boolean;
  kind: ConnectionErrorKind;
  summary: string;
  remediation: string;
}[] = [
  {
    test: (m) => /subscription|subscribe|ORDER BY|LIMIT/i.test(m),
    kind: "subscription",
    summary: "Dashboard subscription failed",
    remediation:
      "Confirm the module is published and subscription SQL uses plain SELECT * (no ORDER BY or LIMIT). See Settings for the database name.",
  },
  {
    test: (m) => /401|403|unauthorized|forbidden/i.test(m),
    kind: "auth",
    summary: "Authentication rejected",
    remediation:
      "Check SpacetimeDB access tokens or cloud login. For local dev, ensure the database is published to the URI shown in Settings.",
  },
  {
    test: (m) =>
      /ECONNREFUSED|ENOTFOUND|failed to fetch|network|websocket|closed|disconnect/i.test(
        m,
      ),
    kind: "unreachable",
    summary: "Cannot reach SpacetimeDB",
    remediation:
      "Start SpacetimeDB (./dev.sh spacetime:start), publish the module, and verify VITE_STDB_URI / port 3000 in Settings. Use Reconnect after the host is up.",
  },
  {
    test: (m) => /database|module|not found|404/i.test(m),
    kind: "config",
    summary: "Database or module mismatch",
    remediation:
      "Open Settings and confirm VITE_STDB_DB matches a published database. Run ./dev.sh spacetime:publish if the name is new.",
  },
  {
    test: (m) => /connect error|failed to build connection/i.test(m),
    kind: "unreachable",
    summary: "WebSocket connection failed",
    remediation:
      "Verify SpacetimeDB is listening on the WebSocket URL in Settings. For cloud, set VITE_STDB_URI to the dashboard URL before building the web bundle.",
  },
];

const DEFAULT_GUIDE: ConnectionErrorGuide = {
  kind: "unknown",
  summary: "SpacetimeDB connection error",
  remediation:
    "Open Settings for the effective WebSocket URI and database name, then use Reconnect. Check browser devtools and SpacetimeDB host logs for details.",
};

/** Classify a raw `connectionLastError` string (null → null). */
export function connectionErrorGuide(
  raw: string | null | undefined,
): ConnectionErrorGuide | null {
  const msg = raw?.trim();
  if (!msg) return null;
  for (const rule of RULES) {
    if (rule.test(msg)) {
      return {
        kind: rule.kind,
        summary: rule.summary,
        remediation: rule.remediation,
      };
    }
  }
  return { ...DEFAULT_GUIDE, summary: DEFAULT_GUIDE.summary };
}

/** One-line hint for `title` / `aria-describedby` on connection pills. */
export function connectionErrorHint(raw: string | null | undefined): string | null {
  const guide = connectionErrorGuide(raw);
  if (!guide) return null;
  return `${guide.summary}. ${guide.remediation}`;
}

/** Settings / alert block: summary + raw detail. */
export function connectionErrorDisplay(raw: string | null | undefined): {
  summary: string;
  remediation: string;
  raw: string;
} | null {
  const msg = raw?.trim();
  if (!msg) return null;
  const guide = connectionErrorGuide(msg) ?? DEFAULT_GUIDE;
  return {
    summary: guide.summary,
    remediation: guide.remediation,
    raw: msg,
  };
}
