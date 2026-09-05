// Public build-time connection settings. Never put provider or publisher keys here.
export const databaseName = import.meta.env.VITE_SPACETIME_DATABASE || 'tiny-knights-prototype';
export const databaseUri = import.meta.env.VITE_SPACETIME_URI || location.origin;

// Preserve existing local sessions; keep cloud identities separate from local ones.
export function sessionKey(room: string) {
  const prefix = databaseName === 'tiny-knights-prototype' && databaseUri === location.origin
    ? 'tiny-knights-session'
    : `tiny-knights-session:${databaseUri}:${databaseName}`;
  return `${prefix}:${room}`;
}

// The optional local LLM gateway is not required for a static cloud frontend.
export const plannerAvailable = import.meta.env.VITE_COMPANION_PLANNER === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_COMPANION_PLANNER !== 'false');
