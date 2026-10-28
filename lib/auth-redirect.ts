export const resolveAuthCallbackUrl = (
  value: string | null | undefined,
): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || (value.includes('\\') || Array.from(value).some(character => character.charCodeAt(0) <= 32))) {
    return '/'
  }
  try {
    if (new URL(value, 'https://app.invalid').origin !== 'https://app.invalid') return '/'
  } catch { return '/' }
  return value
}

// A completed credential exchange changes the session cookie outside a Server
// Action. A full navigation reads that cookie without reusing an anonymous
// client-router response cached before sign-in.
export const navigateToAuthCallback = (
  value: string | null | undefined,
): void => {
  window.location.assign(resolveAuthCallbackUrl(value))
}
