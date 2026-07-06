import rawSpec from '@/config/loops/provider-registry-audit.json'
import { loopSpecificationSchema } from '@/lib/loops/types'

export const providerRegistryAuditSpec = loopSpecificationSchema.parse(rawSpec)
