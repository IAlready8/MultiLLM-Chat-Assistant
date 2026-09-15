export const isStrictAuthRequired = (): true => true

export const getOAuthConfiguration = () => {
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  )
  const github = Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() &&
      process.env.GITHUB_CLIENT_SECRET?.trim(),
  )

  return {
    google,
    github,
    any: google || github,
  }
}
