import { expect, test } from '@playwright/test'
import { clearStorage, mockEmptyApi, mockProjectApi, withActiveWorkspace, withProject } from './helpers'

test('selecting a project shows navigation items', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await page.goto('/')

  await page.getByRole('button', { name: /Test Project/ }).click()

  await expect(page.getByRole('button', { name: 'ダッシュボード', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ボード', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'バックログ', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'スプリント', exact: true })).toBeVisible()
})

test('clicking Board nav renders main content', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await withProject(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'ボード', exact: true }).click()

  await expect(page.locator('main')).toBeVisible()
})

test('clicking + opens New Project modal', async ({ page }) => {
  await clearStorage(page)
  await mockEmptyApi(page)
  await withActiveWorkspace(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'プロジェクトを作成' }).click()
  await expect(page.getByText('New Project')).toBeVisible()
  await expect(page.getByPlaceholder('新しいプロジェクト')).toBeVisible()
})

test('closing modal with Escape hides the modal', async ({ page }) => {
  await clearStorage(page)
  await mockEmptyApi(page)
  await withActiveWorkspace(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'プロジェクトを作成' }).click()
  await expect(page.getByText('New Project')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByText('New Project')).not.toBeVisible()
})
