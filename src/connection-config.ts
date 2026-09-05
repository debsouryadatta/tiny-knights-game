// Public build-time connection settings. Never put provider or publisher keys here.
export const databaseName = import.meta.env.VITE_SPACETIMEDB_DB_NAME || 'little-realm-teams-v2';
export const databaseUri = import.meta.env.VITE_SPACETIMEDB_URI || 'https://spacetime.tinkerers.space';

// Keep identities separate when a developer explicitly points the client at its own origin.
export function sessionKey(room: string) {
  const prefix = databaseUri === location.origin
    ? 'tiny-knights-session'
    : `tiny-knights-session:${databaseUri}:${databaseName}`;
  return `${prefix}:${room}`;
}

// The optional local LLM gateway is not required for a static cloud frontend.
export const plannerAvailable = import.meta.env.VITE_COMPANION_PLANNER === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_COMPANION_PLANNER !== 'false');
