export const isIPhone = () => /iPhone|iPod/i.test(navigator.userAgent);
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;

export function showInstallGuide() {
  let dialog = document.querySelector('#install-guide');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'install-guide';
    dialog.setAttribute('aria-labelledby', 'install-title');
    dialog.innerHTML = '<h2 id="install-title" tabindex="-1" autofocus>More room for your next duel</h2><p>Add Tiny Knights to your iPhone Home Screen to play without browser bars. No App Store download.</p><ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen. You may need to scroll down.</li><li>Keep Open as Web App enabled if shown, then tap Add.</li><li>Launch Tiny Knights from its new icon and turn your phone sideways.</li></ol><p>If the screen does not rotate, turn off Portrait Orientation Lock in Control Center. Internet is required to play.</p><button type="button">Got it</button>';
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {dialog.remove();window.dispatchEvent(new Event('install-guide-change'));});
    document.body.append(dialog);
  }
  if (!dialog.open) {dialog.showModal();window.dispatchEvent(new Event('install-guide-change'));}
}

export async function enterFullscreen() {
  if (isStandalone()) return 'standalone';
  if (!document.documentElement.requestFullscreen && isIPhone()) {
    showInstallGuide();
    return 'install';
  }
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch (error) {
    if (!isIPhone()) throw error;
    showInstallGuide();
    return 'install';
  }
  return 'fullscreen';
}
