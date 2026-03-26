import { expect, test } from '@playwright/test'
import { clearStorage, mockProjectApi, mockSprintCompletionApi, withProject } from './helpers'

test('completing a sprint shows the report modal', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await mockSprintCompletionApi(page)
  await withProject(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Sprints', exact: true }).click()
  await expect(page.getByText('Sprint Active')).toBeVisible()

  await page.getByRole('button', { name: '完了' }).click()
  await page.selectOption('select', 'sprint-2')
  await page.getByRole('button', { name: 'スプリントを完了' }).click()

  await expect(page.getByText('スプリント完了！')).toBeVisible()
  await expect(page.getByText('1 / 2 件')).toBeVisible()
  await expect(page.getByText('5 / 8 pt')).toBeVisible()
})
