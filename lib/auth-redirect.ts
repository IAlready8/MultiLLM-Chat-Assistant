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
