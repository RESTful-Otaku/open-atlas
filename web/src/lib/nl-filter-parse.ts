

import { DOMAIN_CATALOG } from "./colors";

const DOMAIN_IDS = new Set(DOMAIN_CATALOG.map((d) => d.id));

export interface NlFilterIntent {
  readonly raw: string;
  readonly domain: string | null;

  readonly hours: number | null;
  readonly label: string;
}

const HOURS_RE =
  /(?:last|past)\s+(\d+)\s*h(?:ours?)?|(\d+)\s*h(?:ours?)?(?:\s+ago)?/i;

function resolveDomainToken(token: string): string | null {
  const id = token.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (DOMAIN_IDS.has(id)) return id;
  const alias = DOMAIN_CATALOG.find(
    (d) =>
      d.label.toLowerCase() === token.toLowerCase() ||
      d.id === id,
  );
  return alias?.id ?? null;
}


export function parseNlFilterIntent(line: string): NlFilterIntent | null {
  const raw = line.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower === "clear" || lower === "all" || lower === "clear filter") {
    return {
      raw,
      domain: null,
      hours: null,
      label: "Clear domain filter",
    };
  }

  const hoursMatch = raw.match(HOURS_RE);
  const hours = hoursMatch
    ? Number.parseInt(hoursMatch[1] ?? hoursMatch[2] ?? "", 10)
    : null;
  const withoutHours = raw.replace(HOURS_RE, "").trim();
  const tokens = withoutHours.split(/\s+/).filter(Boolean);

  let domain: string | null = null;
  for (const t of tokens) {
    const d = resolveDomainToken(t);
    if (d) {
      domain = d;
      break;
    }
  }
  if (!domain && tokens.length === 1) {
    domain = resolveDomainToken(tokens[0]!);
  }

  if (!domain && hours === null) return null;

  const parts: string[] = [];
  if (domain) parts.push(domain);
  if (hours !== null && Number.isFinite(hours) && hours > 0) {
    parts.push(`last ${hours}h`);
  }

  return {
    raw,
    domain,
    hours:
      hours !== null && Number.isFinite(hours) && hours > 0 ? hours : null,
    label: parts.length > 0 ? parts.join(" · ") : raw,
  };
}
