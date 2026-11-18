import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import PricingPage from '@/app/pricing/page'

/** Public product/offer; signed-in users retain the existing workspace home. */
export default async function HomePage() {
  const session = await auth()
  if (session?.user?.id) redirect(session.user.deletionPending ? '/account/deletion' : '/workspace')
  return PricingPage()
}
