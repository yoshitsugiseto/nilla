import { expect, test } from '@playwright/test'
import { clearStorage, mockProjectApi, withProject } from './helpers'

test('settings page shows recent automation executions', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await withProject(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()

  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
  await expect(page.getByText('最近の自動化実行')).toBeVisible()
  await expect(page.getByText('Test User が「Login form validation」をレビュー待ちにしました')).toBeVisible()
})
