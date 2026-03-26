import { expect, test } from '@playwright/test'
import { clearStorage, mockIssueDetailApi, mockProjectApi, withProject } from './helpers'

test('typing in search box triggers search page', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await withProject(page)
  await page.route('**/api/projects/proj-1/issues**', route =>
    route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
  )
  await page.goto('/')

  const searchInput = page.getByPlaceholder('イシューを検索...')
  await searchInput.fill('login')

  await expect(page.getByText(/"login" の検索結果/)).toBeVisible({ timeout: 1000 })
})

test('pressing Escape clears search', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await withProject(page)
  await page.route('**/api/projects/proj-1/issues**', route =>
    route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
  )
  await page.goto('/')

  const searchInput = page.getByPlaceholder('イシューを検索...')
  await searchInput.fill('login')
  await expect(page.getByText(/"login" の検索結果/)).toBeVisible({ timeout: 1000 })

  await searchInput.press('Escape')
  await expect(searchInput).toHaveValue('')
  await expect(page.getByText(/"login" の検索結果/)).not.toBeVisible()
})

test('search result can open issue detail modal', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await withProject(page)
  await mockIssueDetailApi(page)
  await page.goto('/')

  const searchInput = page.getByPlaceholder('イシューを検索...')
  await searchInput.fill('login')

  await expect(page.getByText(/"login" の検索結果/)).toBeVisible({ timeout: 1000 })
  await page.getByText('Login form validation').click()

  await expect(page.getByText('#42 Login form validation')).toBeVisible()
  await expect(page.getByText('Search result issue description')).toBeVisible()
})
