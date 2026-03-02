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

test.describe('Multi-chat UI flow', () => {
  test('covers loading, empty, success, error, refresh, and provider model change', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const state = {
      conversations: [] as StoredConversation[],
      messages: [] as StoredMessage[],
      conversationCounter: 0,
      messageCounter: 0,
      conversationGetCalls: 0,
    }

    const listConversations = () =>
      [...state.conversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )

    const getConversation = (id: string) => {
      const conversation = state.conversations.find(item => item.id === id)
      if (!conversation) return null
      const messages = state.messages
        .filter(item => item.conversationId === id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      return { ...conversation, messages }
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
      const body = route.request().postDataJSON() as {
        messages?: Array<{ content?: string }>
      }
      const lastMessage = body.messages?.[body.messages.length - 1]?.content ?? ''

      if (lastMessage.toLowerCase().includes('force error')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-ndjson',
          body: `${JSON.stringify({
            type: 'error',
            error: 'Upstream unavailable',
            code: 'PROVIDER_UNAVAILABLE',
          })}\n`,
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ type: 'chunk', content: 'Assistant mock reply.' })}\n${JSON.stringify({ type: 'done' })}\n`,
      })
    })

    await page.route('**/api/conversations', async route => {
      if (route.request().method() === 'GET') {
        state.conversationGetCalls += 1
        if (state.conversationGetCalls === 1) {
          await new Promise(resolve => setTimeout(resolve, 400))
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(listConversations()),
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
          body: JSON.stringify(getConversation(id)),
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
          body: JSON.stringify(getConversation(id)),
        })
        return
      }

      await route.fallback()
    })

    await page.goto('/multi-chat', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Loading conversations...')).toBeVisible()
    await expect(page.getByText('No saved conversations yet.')).toBeVisible()
    await expect(
      page.getByText('Add a model on the right and send a message to get started.')
    ).toBeVisible()

    await page.locator('select').first().selectOption('gpt-4o-mini')
    await expect(page.getByText('openai/gpt-4o-mini')).toBeVisible()

    const successPrompt = 'Ship release checklist'
    await page.getByPlaceholder('Type your message here...').fill(successPrompt)
    await page.getByLabel('Send message').click()

    await expect(page.getByText('Assistant mock reply.')).toBeVisible()
    await expect(page.getByText(successPrompt).first()).toBeVisible()
    await expect(page.getByText('Recent Conversations (1)')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Assistant mock reply.')).toBeVisible()
    await expect(page.getByText('Recent Conversations (1)')).toBeVisible()

    await page
      .getByPlaceholder('Type your message here...')
      .fill('force error in stream')
    await page.getByLabel('Send message').click()

    await expect(
      page.getByText(
        'Error: Provider temporarily unavailable. Please retry shortly.'
      )
    ).toBeVisible()
  })
})
