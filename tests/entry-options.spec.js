import { test, expect } from '@playwright/test';

test('Quick Play stands above the private-room options with simple labels', async ({ page }) => {
  await page.goto('/');
  const quick = page.locator('#quick-play');
  const join = page.locator('#join');
  const create = page.locator('#create-room');
  await expect(quick).toHaveText('Quick Play');
  await expect(join).toHaveText('Join Room');
  await expect(create).toHaveText('Create Room');
  const boxes = await Promise.all([quick, join, create].map(button => button.boundingBox()));
  expect(boxes[0].y + boxes[0].height).toBeLessThanOrEqual(Math.min(boxes[1].y, boxes[2].y));
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    if (page.viewportSize().height <= 540 && page.viewportSize().width > 600) {
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
    }
  }
  expect(await quick.evaluate(button => {
    const join = document.querySelector('#join'), create = document.querySelector('#create-room');
    return Boolean(button.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(button.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await quick.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('entry-options.png'), fullPage: true });
});
