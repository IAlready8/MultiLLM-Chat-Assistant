import packageJson from '@/package.json'

const firstNonEmpty = (...values: Array<string | undefined>) => {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return null
}

export type ReleaseMetadata = {
  version: string
  commitSha: string | null
  commitShort: string | null
  branch: string | null
}

export const getReleaseMetadata = (): ReleaseMetadata => {
  const commitSha = firstNonEmpty(
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA
  )
  const branch = firstNonEmpty(
    process.env.VERCEL_GIT_COMMIT_REF,
    process.env.GITHUB_REF_NAME
  )

  return {
    version: packageJson.version,
    commitSha,
    commitShort: commitSha ? commitSha.slice(0, 7) : null,
    branch,
  }
}
