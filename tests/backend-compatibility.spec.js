import {test,expect} from '@playwright/test';
test('an old server is rejected before allocating a multiplayer room',async({page})=>{
  test.skip(!process.env.LEGACY_TEST_URL,'Requires isolated legacy backend fixture');
  await page.goto(process.env.LEGACY_TEST_URL);
  await page.locator('input[name="name"]').fill('Compatibility check');
  await page.locator('[data-choice="size"] [data-value="3"]').click();
  await page.locator('#create-room').click();
  await expect(page.locator('#join-error')).toContainText('different versions',{timeout:20000});
  await expect(page.locator('#waiting-lobby')).toBeHidden();
  expect(await page.evaluate(()=>window.realm.state.playerId)).toBeUndefined();
  await expect(page.locator('#create-room')).toBeEnabled();
});
