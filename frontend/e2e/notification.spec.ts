import { expect, test } from '@playwright/test'
import { clearStorage, mockProjectApi, SEARCH_ISSUE, withProject } from './helpers'

test('notification quick actions stay available for triage flows', async ({ page }) => {
  await clearStorage(page)
  await mockProjectApi(page)
  await withProject(page)

  await page.route('**/api/notifications', route =>
    route.fulfill({
      json: [
        {
          id: 'notif-1',
          user_id: 'user-1',
          issue_id: 'issue-1',
          type: 'review_ready',
          message: 'Review is ready',
          read: false,
          created_at: '2026-01-02T10:00:00',
        },
      ],
    })
  )
  await page.route('**/api/issues/issue-1', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        json: {
          ...SEARCH_ISSUE,
          ...body,
          status: body.status ?? SEARCH_ISSUE.status,
          assignee_id: body.assignee_id ?? SEARCH_ISSUE.assignee_id,
        },
      })
      return
    }
    await route.fulfill({
      json: {
        ...SEARCH_ISSUE,
        status: 'todo',
      },
    })
  })
  await page.goto('/')

  await page.getByRole('button', { name: '通知' }).click()
  await expect(page.getByText('Review is ready')).toBeVisible()
  await expect(page.getByRole('button', { name: '着手する' })).toBeVisible()

  await page.getByRole('button', { name: '着手する' }).click()
  await expect(page.getByText('進行中に更新しました')).toBeVisible()
})
