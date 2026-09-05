import './landing-music.css';

/** Stream the landing track separately from positional gameplay audio. */
export function createLandingMusic(host) {
  const track = document.createElement('audio');
  track.id = 'landing-music';
  track.src = '/assets/audio/landing-fantasy-adventure.mp3';
  track.preload = 'metadata';
  track.loop = true;
  track.volume = 0.35;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'landing-music-toggle';
  host.append(button, track);
  let active = true, enabled = true, disposed = false, pending = null, blocked = false, failed = false;
  const allowed = () => active && enabled && !disposed && !document.hidden;
  const render = () => {
    button.textContent = !enabled ? 'Music off' : failed ? 'Retry music' : blocked ? 'Play music' : 'Music on';
    button.setAttribute('aria-label', !enabled || blocked || failed ? 'Play landing music' : 'Mute landing music');
    button.setAttribute('aria-pressed', String(enabled));
    button.title = blocked ? 'Your browser needs a tap to play music.' : 'Landing music only';
  };
  const play = () => {
    if (!allowed() || pending) return;
    const request = {};
    pending = request;
    track.play().then(() => {
      if (pending === request) { blocked = false; failed = false; }
      // A delayed play request must never outlive the landing screen.
      if (!allowed()) track.pause();
    }).catch(error => {
      if (pending !== request || !allowed() || error.name === 'AbortError') return;
      blocked = error.name === 'NotAllowedError';
      failed = !blocked;
    }).finally(() => { if (pending === request) pending = null; render(); });
  };
  const stop = (reset = false) => {
    // A paused request can settle after the next attempt to resume playback.
    pending = null;
    track.pause();
    if (reset) track.currentTime = 0;
  };
  const gesture = event => {
    if (!event.isTrusted || event.target?.closest?.('#landing-music-toggle, #quick-play, #create-room, #join, a')) return;
    if (track.paused) play();
  };
  const toggle = () => {
    if (enabled && !blocked && !failed) { enabled = false; stop(); }
    else { enabled = true; play(); }
    render();
  };
  const visibility = () => { if (document.hidden) stop(); else play(); };
  const pagehide = () => destroy();
  button.addEventListener('click', toggle);
  for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, gesture);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  function destroy() {
    if (disposed) return;
    disposed = true;
    stop(true);
    button.removeEventListener('click', toggle);
    for (const event of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(event, gesture);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pagehide);
    track.removeAttribute('src');
    track.load();
    track.remove(); button.remove();
  }
  render();
  play();
  return {
    setActive(value) {
      if (active === value || disposed) return;
      active = value;
      if (active) play(); else stop(true);
    },
    destroy,
  };
}
