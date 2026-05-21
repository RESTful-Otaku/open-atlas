/**
 * Local operator bar grammar — navigation and domain scoping in the
 * client. Intentionally does not claim server-side effects (isolation,
 * reroute) that do not exist yet; those are rejected with a clear line.
 */

import { DOMAIN_CATALOG } from "./colors";
import { navigate } from "./router.svelte";
import { applyNlFilterIntent, parseNlFilterIntent } from "./nl-filter-intent.svelte";
import { setSelectedDomain } from "./state.svelte";
import { MATRIX_CATALOG } from "./matrices/catalog";

const DOMAIN_IDS = new Set(DOMAIN_CATALOG.map((d) => d.id));
const MATRIX_IDS = new Set(MATRIX_CATALOG.map((m) => m.id));

function normalizeWords(line: string): string[] {
  return line
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^["']|["']$/g, ""))
    .filter((w) => w.length > 0);
}

export type OperatorResult =
  | { kind: "ok"; message: string }
  | { kind: "err"; message: string };

/**
 * Run a line from the operator bar. Return human-readable result.
 */
export function runOperatorLine(line: string): OperatorResult {
  const nl = parseNlFilterIntent(line);
  if (nl) {
    applyNlFilterIntent(nl);
    const scope = nl.domain ? `domain filter: ${nl.domain}` : "cleared domain filter";
    const window =
      nl.hours !== null ? ` · recency hint: last ${nl.hours}h` : "";
    return { kind: "ok", message: `NL filter: ${nl.label} (${scope}${window}).` };
  }

  const w = normalizeWords(line);
  if (w.length === 0) return { kind: "err", message: "Empty command." };

  if (w[0] === "help" || w[0] === "?") {
    return {
      kind: "ok",
      message: [
        "Commands:",
        "  help — this list",
        "  go /path — navigate (e.g. go /hub, go /entities, go /settings, go /legacy)",
        "  home | globe — open 3D globe",
        "  hub — executive hub",
        "  map — global map",
        "  entities | settings | legacy",
        "  domain <id> | filter <id> — scope dashboard to a domain; use id like energy, finance",
        "  NL filter — e.g. finance last 6h (domain + recency hint; see Ops strip)",
        "  all | clear — clear domain filter (all domains)",
        "  matrix <id> — open a matrix (e.g. matrix threat, matrix economic)",
        "  isolate|reroute|analyze … — not available client-side; requires backend M9",
      ].join("\n"),
    };
  }

  if (w[0] === "go" && w[1]) {
    const path = w[1].startsWith("/") ? w[1] : `/${w[1]}`;
    navigate(path);
    return { kind: "ok", message: `Navigated to ${path}.` };
  }
  if (w[0] === "home" || w[0] === "globe") {
    navigate("/");
    return { kind: "ok", message: "Navigated to 3D globe." };
  }
  if (w[0] === "hub") {
    navigate("/hub");
    return { kind: "ok", message: "Navigated to executive hub." };
  }
  if (w[0] === "map") {
    navigate("/map");
    return { kind: "ok", message: "Navigated to global map." };
  }
  if (w[0] === "entities") {
    navigate("/entities");
    return { kind: "ok", message: "Navigated to entity database." };
  }
  if (w[0] === "settings") {
    navigate("/settings");
    return { kind: "ok", message: "Navigated to settings." };
  }
  if (w[0] === "legacy") {
    navigate("/legacy");
    return { kind: "ok", message: "Navigated to overview." };
  }

  if (w[0] === "matrix" && w[1]) {
    const id = w[1];
    if (!MATRIX_IDS.has(id)) {
      return {
        kind: "err",
        message: `Unknown matrix “${id}”. Try: ${[...MATRIX_IDS].slice(0, 6).join(", ")}…`,
      };
    }
    navigate(`/matrix/${id}`);
    return { kind: "ok", message: `Opened matrix “${id}”.` };
  }

  if ((w[0] === "domain" || w[0] === "filter") && w[1]) {
    if (!DOMAIN_IDS.has(w[1])) {
      return {
        kind: "err",
        message: `Unknown domain “${w[1]}”. Valid: ${[...DOMAIN_IDS].join(", ")}`,
      };
    }
    setSelectedDomain(w[1]);
    return { kind: "ok", message: `Domain filter: ${w[1]} (applies to map, overview, entities).` };
  }
  if (w[0] === "all" || w[0] === "clear") {
    setSelectedDomain(null);
    return { kind: "ok", message: "Cleared domain filter." };
  }

  if (
    w[0] === "isolate" ||
    w[0] === "reroute" ||
    w[0] === "rerouting" ||
    w[0] === "analyze" ||
    w[0] === "analysis"
  ) {
    return {
      kind: "err",
      message: `“${w[0]}” is not implemented in the client. Server-side operator hooks are planned; use Settings for integration status.`,
    };
  }

  return {
    kind: "err",
    message: `Unknown: “${line.trim()}”. Type help for available commands.`,
  };
}
