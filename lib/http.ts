import { NextResponse } from 'next/server'

type ErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'too_many_requests'
  | 'internal_error'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init)
}

export function jsonError(code: ErrorCode, message: string, details?: any, status = 400) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status })
}

export const unauthorized = (message = 'Unauthorized', details?: any) =>
  jsonError('unauthorized', message, details, 401)

export const badRequest = (message = 'Bad Request', details?: any) =>
  jsonError('bad_request', message, details, 400)

export const tooManyRequests = (message = 'Rate limit exceeded', details?: any) =>
  jsonError('too_many_requests', message, details, 429)

export const internalError = (message = 'Internal Server Error', details?: any) =>
  jsonError('internal_error', message, details, 500)