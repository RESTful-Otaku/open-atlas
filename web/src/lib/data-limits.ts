
export const CLIENT_RETENTION_MS = 86_400_000;


export const MAX_EVENTS = 800;
<<<<<<< HEAD

export const MAX_EVENTS_HARD_CEILING = 2000;
=======
/** Safety ceiling when many rows share the same second (memory guard). */
export const MAX_EVENTS_HARD_CEILING = 3000;
>>>>>>> 4a07e08 (fix: backoff polling, globe import, reactivity fixes, map defaults)

export const MAX_SIGNALS = 400;
export const MAX_CAUSAL_EDGES = 600;

export const MAX_SEVERITY_HISTORY = 24;

export const MAX_EVENT_NARRATIVES = 96;
