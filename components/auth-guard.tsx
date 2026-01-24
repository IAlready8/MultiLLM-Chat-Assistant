"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const hasCheckedOnce = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated" && !pathname.startsWith("/auth")) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  useEffect(() => {
    if (status !== "loading") {
      hasCheckedOnce.current = true;
      setLoadingTimedOut(false);
      if (status === "authenticated" || pathname.startsWith("/auth")) {
        setShowContent(true);
      }
      return;
    }

    // Show content after a brief delay even while loading (optimistic)
    // This allows page content to render while auth check happens in background
    const quickTimer = setTimeout(() => {
      if (!hasCheckedOnce.current) {
        setShowContent(true);
      }
    }, 150);

    const slowTimer = setTimeout(() => setLoadingTimedOut(true), 4000);
    return () => {
      clearTimeout(quickTimer);
      clearTimeout(slowTimer);
    };
  }, [status, pathname]);

  // Auth pages always render immediately
  if (pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  // If authenticated, render immediately
  if (status === "authenticated") {
    return <>{children}</>;
  }

  // Show loading state only if we haven't shown content yet
  if (status === "loading" && !showContent) {
    if (loadingTimedOut) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="flex flex-col items-center space-y-6 p-8 text-center">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">Session check is taking longer than expected</h2>
              <p className="text-muted-foreground">You can continue to sign in or try again.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => router.push(`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`)}>
                Go to sign in
              </Button>
              <Button variant="outline" onClick={() => router.refresh()}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Show a minimal, non-blocking loading indicator
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking session...</p>
        </div>
      </div>
    );
  }

  // Optimistic rendering: show content while checking (after quick timer)
  if (status === "loading" && showContent) {
    return <>{children}</>;
  }

  // Unauthenticated - will redirect
  return null;
}
