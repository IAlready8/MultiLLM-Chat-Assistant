import type { Metadata } from "next";
import type { Session } from 'next-auth'
import "./globals.css";
import Navbar from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { auth } from "@/lib/auth";
import { getDemoAccountContext, isStrictAuthRequired } from '@/lib/demo-account'
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "MultiLLM Chat Assistant",
  description: "A professional tool for interacting with multiple LLM APIs",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const demoAccount = getDemoAccountContext()
  const strictAuth = isStrictAuthRequired()

  let session: Session | null = null

  if (!strictAuth && demoAccount.enabled && demoAccount.bypassAuth) {
    session = {
      user: {
        id: demoAccount.id,
        name: demoAccount.name,
        email: demoAccount.email,
        role: 'OWNER',
        tier: 'ENTERPRISE',
      },
      expires: '2999-12-31T23:59:59.999Z',
    }
  } else {
    try {
      session = await auth()
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans">
        <AuthProvider session={session}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <AuthGuard>
              <div className="min-h-screen flex flex-col">
                <Navbar />
                <main className="flex-1">
                  {children}
                </main>
              </div>
            </AuthGuard>
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
