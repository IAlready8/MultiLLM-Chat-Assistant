"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

type AuthProviderProps = {
  children: React.ReactNode;
  session?: Session | null;
};

export function AuthProvider({ children, session = null }: AuthProviderProps) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
