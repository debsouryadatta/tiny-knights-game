/** Change when client prediction/map geometry is incompatible with the server. */
export const GAME_PROTOCOL_VERSION = 2;
export const SERVER_MISMATCH_MESSAGE = 'The game server and this page are different versions. Multiplayer is unavailable until the matching server is deployed. Please reload after the update.';
export function isCompatibleSnapshot(state: {mapVersion?:number}): boolean {
  return state.mapVersion === GAME_PROTOCOL_VERSION;
}
