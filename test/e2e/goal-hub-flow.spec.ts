import { expect, test } from '@playwright/test'

type StoredGoal = {
  id: string
  userId: string
  title: string
  description: string | null
  status: string
  createdAt: string
  updatedAt: string
}

test.describe('Goal Hub flow', () => {
  test('covers loading, empty, create, update, refresh, and delete states', async ({
    page,
  }) => {
    const state = {
      goals: [] as StoredGoal[],
      goalCounter: 0,
      goalGetCalls: 0,
    }

    const listGoals = () =>
      [...state.goals].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/goals', async route => {
      if (route.request().method() === 'GET') {
        state.goalGetCalls += 1
        if (state.goalGetCalls === 1) {
          await new Promise(resolve => setTimeout(resolve, 350))
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(listGoals()),
        })
        return
      }

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          title: string
          description?: string | null
          status?: string
        }

        const now = new Date().toISOString()
        const goal: StoredGoal = {
          id: `goal-${++state.goalCounter}`,
          userId: 'user-1',
          title: body.title,
          description: body.description ?? null,
          status: body.status ?? 'not-started',
          createdAt: now,
          updatedAt: now,
        }
        state.goals.push(goal)

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(goal),
        })
        return
      }

      await route.fallback()
    })

    await page.route('**/api/goals/*', async route => {
      const url = new URL(route.request().url())
      const id = url.pathname.split('/').pop()
      if (!id) {
        await route.fulfill({ status: 400 })
        return
      }

      const goal = state.goals.find(item => item.id === id)

      if (route.request().method() === 'PUT') {
        if (!goal) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Goal not found' }),
          })
          return
        }

        const updates = route.request().postDataJSON() as {
          title?: string
          description?: string | null
          status?: string
        }

        if (updates.title !== undefined) goal.title = updates.title
        if (updates.description !== undefined) goal.description = updates.description
        if (updates.status !== undefined) goal.status = updates.status
        goal.updatedAt = new Date().toISOString()

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(goal),
        })
        return
      }

      if (route.request().method() === 'DELETE') {
        if (!goal) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Goal not found' }),
          })
          return
        }

        state.goals = state.goals.filter(item => item.id !== id)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
        return
      }

      await route.fallback()
    })

    await page.goto('/goal-hub', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Loading goals...')).toBeVisible()
    await expect(
      page.getByText(
        'No goals yet. Create your first goal to start tracking implementation progress.'
      )
    ).toBeVisible()

    await page.getByRole('button', { name: 'Create first goal' }).click()
    await expect(page.getByText('Create New Goal')).toBeVisible()

    await page.getByPlaceholder('Goal title').fill('Ship phase one')
    await page
      .getByPlaceholder('Goal description (optional)')
      .fill('Finish API and UI flows.')
    await page.getByRole('button', { name: 'Create Goal' }).click()

    await expect(
      page.getByRole('heading', { name: 'Ship phase one' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Goal Details' })
    ).toBeVisible()

    await page.getByPlaceholder('Goal title').fill('Ship phase one complete')
    await page
      .locator('select')
      .last()
      .selectOption('completed')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(
      page.getByRole('heading', { name: 'Ship phase one complete' })
    ).toBeVisible()
    await expect(page.locator('select').last()).toHaveValue('completed')

    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByText('Ship phase one complete')).toBeVisible()

    page.once('dialog', dialog => {
      void dialog.accept()
    })
    await page.getByRole('button', { name: 'Delete goal' }).click()

    await expect(
      page.getByText(
        'No goals yet. Create your first goal to start tracking implementation progress.'
      )
    ).toBeVisible()
  })
})
