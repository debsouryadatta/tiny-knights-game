// Keep the keyboard and combat button on the same priority/range rules.
export function getMainAction(state, hero) {
  if (!state || !hero || hero.hp <= 0) return 'attack';
  const inRange = (target, range) =>
    Math.hypot(target.x - hero.x, target.y - hero.y) <= range;
  const attackRange = hero.hero === 'ranger' ? 5 : 1.6;
  const enemies = [...state.actors, ...state.structures];
  if (enemies.some(enemy => enemy.hp > 0 && enemy.team !== hero.team && inRange(enemy, attackRange)))
    return 'attack';
  return state.resources.some(node => node.amount > 0 && inRange(node, 1.5))
    ? 'gather'
    : 'attack';
}

// An action is chosen on press. A later label change must never start an
// action on its own, and a released/cancelled attack must always reach the server.
export function createMainActionHold({ getAction, send }) {
  let pressed = false;
  let attacking = false;
  const releaseAttack = () => {
    if (attacking) send({ type: 'attack', held: false });
    attacking = false;
  };
  return {
    press() {
      if (pressed) return;
      pressed = true;
      attacking = getAction() === 'attack';
      send(attacking ? { type: 'attack', held: true } : { type: 'gather' });
    },
    release() {
      releaseAttack();
      pressed = false;
    },
    update({ repeat = false } = {}) {
      if (attacking && getAction() !== 'attack') releaseAttack();
      if (attacking && repeat) send({ type: 'attack', held: true });
    },
  };
}
