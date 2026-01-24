export interface NdjsonChunk<T = any> {
  value: T
}

// Async iterator over an NDJSON ReadableStream (browser/Next.js fetch Response.body)
export async function* iterNdjson(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          yield JSON.parse(trimmed)
        } catch (e) {
          // swallow malformed lines
          // eslint-disable-next-line no-console
          console.warn('ndjson parse error', e)
        }
      }
    }
    if (buffer.trim()) {
      try { yield JSON.parse(buffer) } catch { /* ignore */ }
    }
  } finally {
    reader.releaseLock()
  }
}