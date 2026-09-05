import { LANE_NAMES } from '../shared/map';
/** Render player-supplied names through textContent, never HTML. */
export function renderTeamRoster(target, state, roster, lobby, playerId, playing = false) {
  const signature = JSON.stringify([state.size, playerId, lobby?.hostPlayerId, lobby?.readyPlayers, roster,
    state.actors.filter(a => a.kind === 'hero').map(a => [a.id, a.name, a.hero, a.lane, playing ? Math.ceil(a.hp) : null])]);
  if (target.dataset.signature === signature) return;
  target.dataset.signature = signature;
  const ready = new Set(JSON.parse(lobby?.readyPlayers || '[]'));
  const groups = ['blue', 'red'].map(team => {
    const group = document.createElement('section');
    group.className = `lobby-team team-${team}`;
    const heroes = state.actors.filter(a => a.kind === 'hero' && a.team === team);
    const count = heroes.filter(a => roster.some(m => m.playerId === a.id)).length;
    const heading = document.createElement('h2');
    heading.textContent = `${team === 'blue' ? 'Blue' : 'Red'} team · ${count}/${state.size}`;
    group.append(heading);
    for (const actor of heroes) {
      const member = roster.find(m => m.playerId === actor.id);
      const row = document.createElement('div'); row.className = 'lobby-seat'; row.dataset.playerId = actor.id;
      const name = document.createElement('b'), detail = document.createElement('span');
      name.textContent = member ? `${actor.name}${actor.id === playerId ? ' · You' : ''}` : playing ? `${actor.hero} bot` : 'Open seat';
      const status = !member ? (playing ? 'Bot' : 'Bot if host starts') : !member.online ? 'Disconnected · seat reserved' :
        playing ? `${Math.ceil(actor.hp)} HP` : actor.id === lobby?.hostPlayerId ? 'Host' : ready.has(actor.id) ? 'Ready' : 'Not ready';
      detail.textContent = `${actor.hero} · ${status}`;
      const lane = document.createElement('small'); lane.className='lane-assignment'; lane.textContent=`${LANE_NAMES[actor.lane] || 'Mid'} lane`;
      row.append(lane);
      row.append(name, detail); group.append(row);
    }
    return group;
  });
  target.replaceChildren(...groups);
}
