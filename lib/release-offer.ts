/** Approved November 4, 2026. Subscription pays for the workspace, not AI tokens. */
export const RELEASE_OFFER = {
  currency: 'cad',
  unitAmount: 1900,
  interval: 'month',
  priceLabel: 'CAD 19 / month',
  limits: { FREE: 50, PRO: 2000, ENTERPRISE: 0 },
} as const

export const GENERATION_ALLOWANCE_COPY =
  'One unit is one attempted provider generation. A prompt to three models uses three units. Failed and stopped dispatched attempts count. Saved replay uses no units; deleting history does not refund units. The allowance resets at 00:00 UTC on the first of each calendar month.'

export const BYOK_COPY =
  'Bring your own provider API keys. Provider API charges are separate; consumer chat subscriptions do not include API credentials. MultiLLM does not include AI credits or silently retry paid generations.'
