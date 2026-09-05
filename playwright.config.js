import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['three-lanes.spec.js', 'team-multiplayer.spec.js', 'entry-options.spec.js', 'landing-music.spec.js', 'match-intro.spec.js', 'landing.spec.js', 'quick-ui.spec.js', 'issue-progression.spec.js', 'contextual-e2e.spec.js', 'mobile-webkit.spec.js', 'mobile-layout.spec.js', 'mobile-input.spec.js', 'mobile-performance.spec.js', 'pack-visuals.spec.js', 'lobby.spec.js', 'audio.spec.js', 'ping.spec.js', 'combat-polish.spec.js', 'duel.spec.js', 'new-realm.spec.js', 'moba-controls.spec.js', 'mobile-rendering.spec.js', 'responsive-controls.spec.js', 'motion-regression.spec.js', 'gameplay-ux.spec.js', 'startup-loading.spec.js'],
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4177',
    headless: true,
    launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...(process.env.MOBILE_WEBKIT ? [{ name: 'webkit-mobile', use: { browserName: 'webkit', launchOptions: {}, viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } }] : []),
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile-landscape', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-portrait', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
