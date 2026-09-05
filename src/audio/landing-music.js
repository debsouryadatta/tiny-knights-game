import './landing-music.css';

/** Stream the landing track separately from positional gameplay audio. */
export function createLandingMusic(host) {
  const track = document.createElement('audio');
  track.id = 'landing-music';
  track.src = '/assets/audio/landing-fantasy-adventure.mp3';
  track.preload = 'metadata';
  track.loop = true;
  track.volume = 0.35;
  host.append(track);
  let active = true, disposed = false, pending = null;
  const allowed = () => active && !disposed && !document.hidden;
  const play = () => {
    if (!allowed() || pending) return;
    const request = {};
    pending = request;
    track.play().then(() => {
      // A delayed play request must never outlive the landing screen.
      if (!allowed()) track.pause();
    }).catch(() => {
      // Autoplay may need a user gesture. Retry on the next normal interaction.
    }).finally(() => { if (pending === request) pending = null; });
  };
  const stop = (reset = false) => {
    // A paused request can settle after the next attempt to resume playback.
    pending = null;
    track.pause();
    if (reset) track.currentTime = 0;
  };
  const gesture = event => {
    if (!event.isTrusted) return;
    if (track.paused) play();
  };
  const visibility = () => { if (document.hidden) stop(); else play(); };
  const pagehide = () => destroy();
  for (const event of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(event, gesture);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  function destroy() {
    if (disposed) return;
    disposed = true;
    stop(true);
    for (const event of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(event, gesture);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pagehide);
    track.removeAttribute('src');
    track.load();
    track.remove();
  }
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
