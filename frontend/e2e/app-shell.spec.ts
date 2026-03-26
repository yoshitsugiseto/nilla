import { expect, test } from '@playwright/test'
import { clearStorage, mockEmptyApi, mockProjectApi } from './helpers'

test('shows app title and sidebar on load', async ({ page }) => {
  await clearStorage(page)
  await mockEmptyApi(page)
  await page.goto('/')

  await expect(page.getByText('Nilla')).toBeVisible()
  await expect(page.getByText('Sprint Manager')).toBeVisible()
  await expect(page.getByPlaceholder('イシューを検索...')).toBeVisible()
})

test('shows "No projects yet" when project list is empty', async ({ page }) => {
  await clearStorage(page)
  await mockEmptyApi(page)
  await page.goto('/')

  await expect(page.getByText('No projects yet')).toBeVisible()
})

test('shows project in sidebar when API returns a project', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await page.goto('/')

  await expect(page.getByText('TP')).toBeVisible()
  await expect(page.getByRole('button', { name: /Test Project/ })).toBeVisible()
})
