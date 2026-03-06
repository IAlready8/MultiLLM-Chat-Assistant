import { expect, test } from '@playwright/test'

type StoredPersona = {
  id: string
  userId: string
  title: string
  description: string | null
  prompt: string
  createdAt: string
  updatedAt: string
}

test.describe('Personas flow', () => {
  test('covers loading, empty, create, edit, list, and delete', async ({
    page,
  }) => {
    const state = {
      personas: [] as StoredPersona[],
      personaCounter: 0,
      personaGetCalls: 0,
    }

    const listPersonas = () =>
      [...state.personas].sort(
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

    await page.route('**/api/personas', async route => {
      if (route.request().method() === 'GET') {
        state.personaGetCalls += 1
        if (state.personaGetCalls === 1) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(listPersonas()),
        })
        return
      }

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          title: string
          description?: string | null
          prompt: string
        }

        const now = new Date().toISOString()
        const persona: StoredPersona = {
          id: `persona-${++state.personaCounter}`,
          userId: 'user-1',
          title: body.title,
          description: body.description ?? null,
          prompt: body.prompt,
          createdAt: now,
          updatedAt: now,
        }
        state.personas.push(persona)

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(persona),
        })
        return
      }

      await route.fallback()
    })

    await page.route('**/api/personas/*', async route => {
      const url = new URL(route.request().url())
      const id = url.pathname.split('/').pop()
      if (!id) {
        await route.fulfill({ status: 400 })
        return
      }

      const persona = state.personas.find(item => item.id === id)

      if (route.request().method() === 'PUT') {
        if (!persona) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Persona not found' }),
          })
          return
        }

        const updates = route.request().postDataJSON() as {
          title?: string
          description?: string | null
          prompt?: string
        }

        if (updates.title !== undefined) persona.title = updates.title
        if (updates.description !== undefined) persona.description = updates.description
        if (updates.prompt !== undefined) persona.prompt = updates.prompt
        persona.updatedAt = new Date().toISOString()

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(persona),
        })
        return
      }

      if (route.request().method() === 'DELETE') {
        if (!persona) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Persona not found' }),
          })
          return
        }

        state.personas = state.personas.filter(item => item.id !== id)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
        return
      }

      await route.fallback()
    })

    await page.goto('/personas', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Loading personas...')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No Personas Yet' })).toBeVisible()
    await expect(page.getByText('0 total')).toBeVisible()

    await page.getByRole('button', { name: 'Create Persona' }).first().click()
    await expect(page.getByRole('heading', { name: 'Create New Persona' })).toBeVisible()

    await page.getByLabel('Title').fill('Architect Persona')
    await page.getByLabel('Description').fill('Focuses on system design.')
    await page
      .getByLabel('System Prompt')
      .fill('Analyze requirements and propose architecture tradeoffs.')
    await page.getByRole('button', { name: 'Create Persona' }).last().click()

    await expect(
      page.getByRole('heading', { name: 'Architect Persona' })
    ).toBeVisible()
    await expect(page.getByText('1 total')).toBeVisible()

    await page.getByLabel('Edit persona Architect Persona').click()
    await page.getByLabel('Title').fill('Architect Persona v2')
    await page
      .getByRole('button', { name: 'Update Persona' })
      .click()

    await expect(
      page.getByRole('heading', { name: 'Architect Persona v2' })
    ).toBeVisible()
    await expect(page.getByText('1 total')).toBeVisible()

    page.once('dialog', dialog => {
      void dialog.accept()
    })
    await page.getByLabel('Delete persona Architect Persona v2').click()

    await expect(page.getByRole('heading', { name: 'No Personas Yet' })).toBeVisible()
    await expect(page.getByText('0 total')).toBeVisible()
  })
})
