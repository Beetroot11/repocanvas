import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('creates a template board and gives the canvas the full workspace', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Create whiteboard' }).click()
  await page.getByPlaceholder('e.g. Authentication flow').fill('System map')
  await page.getByRole('combobox', { name: 'Starting template' }).selectOption('system-architecture')
  await page.getByRole('button', { name: 'Create & open' }).click()

  await expect(page.locator('.rc-canvas')).toBeVisible()
  if (!testInfo.project.name.startsWith('mobile')) {
    const toggleBox = await page.getByRole('button', { name: 'Hide whiteboard list' }).boundingBox()
    const titleBox = await page.getByRole('textbox', { name: 'Whiteboard title' }).boundingBox()
    expect(toggleBox).not.toBeNull()
    expect(titleBox).not.toBeNull()
    expect(
      toggleBox!.x < titleBox!.x + titleBox!.width &&
      toggleBox!.x + toggleBox!.width > titleBox!.x &&
      toggleBox!.y < titleBox!.y + titleBox!.height &&
      toggleBox!.y + toggleBox!.height > titleBox!.y,
    ).toBe(false)
    const before = await page.locator('.rc-canvas').boundingBox()
    await page.getByRole('button', { name: 'Hide whiteboard list' }).click()
    await expect(page.locator('.rc-workspace')).toHaveAttribute('data-library-collapsed', 'true')
    await expect(page.getByRole('button', { name: 'Show whiteboard list' })).toBeVisible()
    const after = await page.locator('.rc-canvas').boundingBox()
    expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('repocanvas:workspace:library-collapsed'))).toBe('true')
  }
})

test('exports a board as deterministic RepoCanvas JSON', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'The compact mobile header intentionally hides export controls.')
  await page.getByRole('button', { name: 'Create whiteboard' }).click()
  await page.getByPlaceholder('e.g. Authentication flow').fill('Export test')
  await page.getByRole('button', { name: 'Create & open' }).click()
  await expect(page.locator('.rc-canvas')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('combobox', { name: 'Export whiteboard' }).selectOption('json')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('export-test.json')
})

test('edits tags in the RepoCanvas dialog', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Create whiteboard' }).click()
  await page.getByPlaceholder('e.g. Authentication flow').fill('Tagged board')
  await page.getByRole('button', { name: 'Create & open' }).click()
  await expect(page.locator('.rc-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Back to whiteboard library' }).click()

  if (testInfo.project.name.startsWith('mobile')) {
    await page.getByRole('button', { name: 'More actions for Tagged board' }).click()
    await page.getByRole('button', { name: 'Edit tags' }).click()
  } else {
    await page.getByRole('button', { name: 'Edit tags for Tagged board' }).click()
  }

  const dialog = page.getByRole('dialog', { name: 'Edit tags' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Tags' }).fill('platform')
  await dialog.getByRole('textbox', { name: 'Tags' }).press('Enter')
  await dialog.getByRole('button', { name: 'Save tags' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.rc-board-row').filter({ hasText: 'Tagged board' })).toContainText('platform')
})
