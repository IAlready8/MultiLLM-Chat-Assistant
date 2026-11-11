/** Shared by browser UI and server metadata; only public configuration belongs here. */
export const getAppName = (
  configuredName: string | undefined = process.env.NEXT_PUBLIC_APP_NAME,
): string => configuredName?.trim().slice(0, 80) || 'ManyOne'
