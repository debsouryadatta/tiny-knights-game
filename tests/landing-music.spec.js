import { test, expect } from '@playwright/test';

const musicState = page => page.locator('#landing-music').evaluate(track => ({
  paused: track.paused, time: track.currentTime, loop: track.loop,
  duration: track.duration, volume: track.volume,
}));
async function startMusic(page) {
  await page.goto('/');
  await expect(page.locator('#landing-music-toggle')).toBeVisible();
  await page.keyboard.press('Shift');
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  await expect.poll(async () => (await musicState(page)).time).toBeGreaterThan(0);
}

test('provided track plays, loops, and honors the landing mute control', async ({ page }) => {
  await startMusic(page);
  const state = await musicState(page);
  expect(state.loop).toBe(true);
  expect(state.duration).toBeGreaterThan(30);
  expect(state.volume).toBe(0.35);
  await page.locator('#landing-music').evaluate(track => { track.currentTime = track.duration - 0.2; });
  await expect.poll(async () => (await musicState(page)).time).toBeLessThan(3);
  await page.getByRole('button', { name: 'Mute landing music' }).click();
  await expect(page.locator('#landing-music-toggle')).toHaveText('Music off');
  await page.keyboard.press('Shift');
  expect((await musicState(page)).paused).toBe(true);
  await page.getByRole('button', { name: 'Play landing music' }).click();
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
});

test('blocked autoplay recovers on a trusted gesture', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let blockedOnce = false;
    HTMLMediaElement.prototype.play = function () {
      if (this.id === 'landing-music' && !blockedOnce) {
        blockedOnce = true;
        return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('#landing-music-toggle')).toHaveText('Play music');
  await expect(page.locator('#landing-music-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift');
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  await expect(page.locator('#landing-music-toggle')).toHaveText('Music on');
});

test('rapid hide and return resumes despite an unsettled playback request', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let firstRequest = true;
    HTMLMediaElement.prototype.play = function () {
      if (this.id === 'landing-music' && firstRequest) {
        firstRequest = false;
        return new Promise((resolve, reject) => { window.rejectPendingMusic = reject; });
      }
      return play.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('#landing-music-toggle')).toBeVisible();
  await page.keyboard.press('Shift');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.rejectPendingMusic(new DOMException('Playback interrupted', 'AbortError'));
    delete document.hidden;
  });
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  await expect.poll(async () => (await musicState(page)).time).toBeGreaterThan(0);
  await expect(page.locator('#landing-music-toggle')).toHaveText('Music on');
});

for (const entry of ['quick-play', 'create-room', 'join']) {
  test(`${entry} stops and rewinds music before the splash`, async ({ page }) => {
    await startMusic(page);
    await page.locator('input[name="name"]').fill('Music QA');
    if (entry === 'join') await page.locator('input[name="room"]').fill('MUSICQA');
    await page.locator(`#${entry}`).click();
    await expect(page.locator('#match-intro')).toBeVisible();
    expect((await musicState(page)).paused).toBe(true);
    expect((await musicState(page)).time).toBe(0);
    await page.keyboard.press('Shift');
    expect((await musicState(page)).paused).toBe(true);
  });
}

test('navigation to credits tears down music; credits has no music player', async ({ page }) => {
  await startMusic(page);
  await page.evaluate(() => {
    const track = document.querySelector('#landing-music');
    window.addEventListener('pagehide', () => {
      sessionStorage.setItem('music-exit', JSON.stringify({ paused: track.paused, src: track.getAttribute('src') }));
    });
  });
  await page.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page).toHaveURL(/credits\.html/);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('music-exit')))).toEqual({ paused: true, src: null });
  await expect(page.locator('#landing-music')).toHaveCount(0);
});

test('music stays stopped in the lobby and game, then returns only on the landing page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await startMusic(page);
  await page.locator('input[name="name"]').fill('Music lifecycle QA');
  await page.locator('#create-room').click();
  await expect(page.locator('#waiting-lobby')).toBeVisible();
  expect((await musicState(page)).paused).toBe(true);
  expect((await musicState(page)).time).toBe(0);
  await page.locator('#lobby-start').click();
  await expect(page.locator('#join-screen')).toBeHidden();
  await page.keyboard.press('Shift');
  expect((await musicState(page)).paused).toBe(true);
  await page.locator('#help').click();
  await page.locator('#leave').click();
  await expect(page.locator('#draft')).toBeVisible();
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
});
