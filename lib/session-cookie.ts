type CookieLike = {
  name: string
  value: string
}

const SESSION_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]

export const readSessionTokenFromCookies = (cookies: CookieLike[]) => {
  for (const cookieName of SESSION_COOKIE_NAMES) {
    const directValue = cookies.find((cookie) => cookie.name === cookieName)?.value
    if (directValue) {
      return directValue
    }

    const chunkedValue = cookies
      .filter((cookie) => cookie.name.startsWith(`${cookieName}.`))
      .sort((a, b) => {
        const aSuffix = Number.parseInt(a.name.split('.').pop() ?? '0', 10)
        const bSuffix = Number.parseInt(b.name.split('.').pop() ?? '0', 10)
        return aSuffix - bSuffix
      })
      .map((cookie) => cookie.value)
      .join('')

    if (chunkedValue) {
      return chunkedValue
    }
  }

  return null
}
