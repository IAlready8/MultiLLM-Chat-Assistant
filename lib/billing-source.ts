type BillingRequestBody = {
  source?: unknown
}

type ReadBillingSourceOptions = {
  defaultValue?: string
  maxLength?: number
}

export const readBillingSource = async (
  req: Request,
  options: ReadBillingSourceOptions = {}
) => {
  const { defaultValue = 'unknown', maxLength = 64 } = options
  const contentType = req.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    return defaultValue
  }

  try {
    const body = (await req.json()) as BillingRequestBody
    if (typeof body.source === 'string' && body.source.trim()) {
      return body.source.trim().slice(0, maxLength)
    }
  } catch {
    return defaultValue
  }

  return defaultValue
}
