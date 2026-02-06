"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

type AuthProviderProps = {
  children: React.ReactNode;
  session?: Session | null;
};

export function AuthProvider({ children, session = null }: AuthProviderProps) {
  const strictAuthEnabled = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN === 'true'
  const demoBypassEnabled = !strictAuthEnabled && (
    process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH === 'true' ||
    (
      process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH === undefined &&
      process.env.NODE_ENV !== 'production'
    )
  )

  return (
    <SessionProvider
      session={session}
      refetchInterval={demoBypassEnabled ? 0 : undefined}
      refetchOnWindowFocus={!demoBypassEnabled}
    >
      {children}
    </SessionProvider>
  );
}
