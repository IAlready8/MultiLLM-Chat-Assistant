import { legalDocument } from '@/lib/legal-document'
export const dynamic = 'force-dynamic'
export function GET() { return legalDocument('privacy') }
