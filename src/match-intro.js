import './match-intro.css';

const DURATION = 7000;
const tips = [
  ['Gather', 'Send your companion to gather wood and gold.'],
  ['Attack', 'Order your companion to attack and help your push.'],
  ['Escort / Defend', 'Choose Escort to follow you, or Defend to guard your base.'],
];

export function createMatchIntro() {
  const dialog = document.createElement('dialog');
  dialog.id = 'match-intro';
  dialog.setAttribute('aria-labelledby', 'intro-title');
  dialog.setAttribute('aria-describedby', 'intro-objective');
  dialog.innerHTML = `<div class="intro-shell">
    <header class="intro-brand">TINY KNIGHTS <span>FIELD GUIDE</span></header>
    <main class="intro-mission">
      <p class="intro-eyebrow">YOUR MISSION</p>
      <h1 id="intro-title" tabindex="-1">Two ways<br>to win.</h1>
      <p id="intro-objective">Destroy the enemy core<br>or reach <strong>21 hero kills.</strong></p>
      <p class="intro-fineprint">Minions and companions don't count toward 21.</p>
    </main>
    <footer class="intro-footer">
      <div class="intro-tip-heading"><span>YOUR COMPANION</span><span id="intro-tip-count">TIP 1 / 3</span></div>
      <p class="intro-order-hint">Open your companion's menu to give an order.</p>
      <div id="intro-tip" role="status" aria-live="polite" aria-atomic="true"><strong></strong><p></p></div>
      <div class="intro-segments" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="intro-timing"><span>Getting you ready</span><span id="intro-countdown" aria-hidden="true">Continuing in 7s</span></p>
    </footer>
  </div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('#intro-tip strong');
  const detail = dialog.querySelector('#intro-tip p');
  const segments = [...dialog.querySelectorAll('.intro-segments i')];
  let frame, finish, pending, destroyed = false;
  const preventCancel = event => event.preventDefault();
  dialog.addEventListener('cancel', preventCancel);

  function show() {
    if (destroyed) return Promise.resolve(false);
    if (pending) return pending;
    pending = new Promise(resolve => {
      let elapsed = 0, last = performance.now(), currentTip = -1;
      const visibility = () => { last = performance.now(); };
      document.addEventListener('visibilitychange', visibility);
      finish = completed => {
        cancelAnimationFrame(frame);
        document.removeEventListener('visibilitychange', visibility);
        dialog.close();
        finish = null;
        pending = null;
        resolve(completed);
      };
      const render = now => {
        if (!document.hidden) elapsed += Math.max(0, now - last);
        last = now;
        if (elapsed >= DURATION) { finish(true); return; }
        const index = Math.min(2, Math.floor(elapsed / (DURATION / 3)));
        if (index !== currentTip) {
          currentTip = index;
          title.textContent = tips[index][0];
          detail.textContent = tips[index][1];
          dialog.querySelector('#intro-tip-count').textContent = `TIP ${index + 1} / 3`;
        }
        segments.forEach((segment, i) => segment.style.setProperty('--fill', Math.max(0, Math.min(1, elapsed / (DURATION / 3) - i))));
        dialog.querySelector('#intro-countdown').textContent = `Continuing in ${Math.ceil((DURATION - elapsed) / 1000)}s`;
        frame = requestAnimationFrame(render);
      };
      dialog.showModal();
      dialog.querySelector('h1').focus();
      render(last);
    });
    return pending;
  }

  return { show, destroy() {
    destroyed = true;
    finish?.(false);
    dialog.removeEventListener('cancel', preventCancel);
    dialog.remove();
  } };
}
