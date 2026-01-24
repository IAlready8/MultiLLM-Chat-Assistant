// services/persona-service.ts
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type Persona = {
  id?: string;
  name: string;
  systemPrompt: string;
};

export function applyPersonaPrompt(
  messages: ChatMessage[],
  persona: Persona | null
): ChatMessage[] {
  if (!persona || !persona.systemPrompt?.trim()) return messages;

  const systemMsg: ChatMessage = { role: 'system', content: persona.systemPrompt };

  // Replace first system message if present; otherwise prepend
  if (messages.length && messages[0].role === 'system') {
    return [systemMsg, ...messages.slice(1)];
  }
  return [systemMsg, ...messages];
}

export function getDefaultPersonas(): Persona[] {
  return [
    { name: 'General',  systemPrompt: 'You are a helpful, concise assistant.' },
    { name: 'Engineer', systemPrompt: 'You are a pragmatic senior software engineer. Prefer clear, tested code and explain tradeoffs briefly.' },
    { name: 'Researcher', systemPrompt: 'You are a careful researcher. Cite sources, note uncertainty, and avoid overclaiming.' },
  ];
}