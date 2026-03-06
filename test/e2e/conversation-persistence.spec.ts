import { expect, test } from '@playwright/test'

type StoredConversation = {
  id: string
  title: string
  userId: string
  createdAt: string
  updatedAt: string
}

type StoredMessage = {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  provider: string | null
  model: string | null
  createdAt: string
}

test.describe('Conversation persistence lifecycle', () => {
  test('supports create/load/list/update/delete with refresh persistence', async ({
    page,
  }) => {
    const state = {
      conversations: [] as StoredConversation[],
      messages: [] as StoredMessage[],
      conversationCounter: 0,
      messageCounter: 0,
    }

    const getConversationList = () =>
      [...state.conversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )

    const getFullConversation = (id: string) => {
      const conversation = state.conversations.find(item => item.id === id)
      if (!conversation) return null

      const messages = state.messages
        .filter(item => item.conversationId === id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )

      return {
        ...conversation,
        messages,
      }
    }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configuredProviders: ['openai'],
        }),
      })
    })

    await page.route('**/api/llm/stream', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ type: 'chunk', content: 'Mock assistant reply.' })}\n${JSON.stringify({ type: 'done' })}\n`,
      })
    })

    await page.route('**/api/conversations', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(getConversationList()),
        })
        return
      }

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          title: string
          messages: Array<{
            role: 'user' | 'assistant'
            content: string
            provider?: string | null
            model?: string | null
          }>
        }

        const now = new Date().toISOString()
        const id = `conv-${++state.conversationCounter}`
        const conversation: StoredConversation = {
          id,
          title: body.title,
          userId: 'user-1',
          createdAt: now,
          updatedAt: now,
        }
        state.conversations.push(conversation)

        for (const message of body.messages) {
          state.messages.push({
            id: `msg-${++state.messageCounter}`,
            conversationId: id,
            role: message.role,
            content: message.content,
            provider: message.provider ?? null,
            model: message.model ?? null,
            createdAt: new Date().toISOString(),
          })
        }

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(conversation),
        })
        return
      }

      await route.fallback()
    })

    await page.route('**/api/conversations/*', async route => {
      const url = new URL(route.request().url())
      const id = url.pathname.split('/').pop()
      if (!id) {
        await route.fulfill({ status: 400 })
        return
      }

      const conversation = state.conversations.find(item => item.id === id)

      if (route.request().method() === 'GET') {
        if (!conversation) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Conversation not found' }),
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(getFullConversation(id)),
        })
        return
      }

      if (route.request().method() === 'POST') {
        if (!conversation) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Conversation not found' }),
          })
          return
        }

        const body = route.request().postDataJSON() as Array<{
          role: 'user' | 'assistant'
          content: string
          provider?: string | null
          model?: string | null
        }>

        for (const message of body) {
          state.messages.push({
            id: `msg-${++state.messageCounter}`,
            conversationId: id,
            role: message.role,
            content: message.content,
            provider: message.provider ?? null,
            model: message.model ?? null,
            createdAt: new Date().toISOString(),
          })
        }

        conversation.updatedAt = new Date().toISOString()

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(getFullConversation(id)),
        })
        return
      }

      if (route.request().method() === 'PUT') {
        if (!conversation) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Conversation not found' }),
          })
          return
        }

        const body = route.request().postDataJSON() as { title: string }
        conversation.title = body.title
        conversation.updatedAt = new Date().toISOString()

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(conversation),
        })
        return
      }

      if (route.request().method() === 'DELETE') {
        if (!conversation) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Conversation not found or failed to delete',
            }),
          })
          return
        }

        state.conversations = state.conversations.filter(item => item.id !== id)
        state.messages = state.messages.filter(
          message => message.conversationId !== id
        )

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
        return
      }

      await route.fallback()
    })

    await page.goto('/multi-chat')

    await expect(page.getByText('No saved conversations yet.')).toBeVisible()

    const firstPrompt = 'Weekly planning notes'
    await page.getByPlaceholder('Type your message here...').fill(firstPrompt)
    await page.getByLabel('Send message').click()

    await expect(page.getByText('Mock assistant reply.')).toBeVisible()
    await expect(page.getByText(firstPrompt).first()).toBeVisible()
    await expect(page.getByText('Recent Conversations (1)')).toBeVisible()

    await page.getByLabel(`Rename conversation ${firstPrompt}`).click()
    await page
      .getByLabel(/^Conversation title$/)
      .fill('Renamed planning thread')
    await page.getByLabel('Save conversation title').click()

    await expect(page.getByText('Renamed planning thread')).toBeVisible()

    await page.reload()

    await expect(page.getByText('Renamed planning thread')).toBeVisible()
    await expect(page.getByText('Mock assistant reply.')).toBeVisible()

    await page
      .getByLabel('Delete conversation Renamed planning thread')
      .click()

    await expect(page.getByText('No saved conversations yet.')).toBeVisible()
  })
})
