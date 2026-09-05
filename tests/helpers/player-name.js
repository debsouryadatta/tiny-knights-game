// Existing gameplay tests explicitly supply a name now that drafts start empty.
export async function enterPlayerName(page) {
  const field=page.locator('input[name="name"]');
  if(!(await field.inputValue()).trim())await field.fill('Test player');
}
