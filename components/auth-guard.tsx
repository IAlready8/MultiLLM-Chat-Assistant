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
  const currentPath = pathname ?? '/';
  const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(currentPath)}`;
  const strictAuthEnabled = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN === 'true';
  const demoBypassEnabled = !strictAuthEnabled && (
    process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH === 'true' ||
    (
      process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH === undefined &&
      process.env.NODE_ENV !== 'production'
    )
  );
  const [optimisticCycle, setOptimisticCycle] = useState<number | null>(null);
  const [timeoutCycle, setTimeoutCycle] = useState<number | null>(null);
  const hasCheckedOnce = useRef(false);
  const loadingCycleRef = useRef(0);
  const [loadingCycle, setLoadingCycle] = useState(0);

  useEffect(() => {
    if (demoBypassEnabled) {
      return;
    }
    if (status === "unauthenticated" && !currentPath.startsWith("/auth")) {
      router.replace(signInUrl);
    }
  }, [status, router, currentPath, demoBypassEnabled, signInUrl]);

  useEffect(() => {
    if (status !== "loading") {
      hasCheckedOnce.current = true;
      return;
    }

    const cycleId = loadingCycleRef.current + 1;
    loadingCycleRef.current = cycleId;
    setLoadingCycle(cycleId);

    // Show content after a brief delay even while loading (optimistic)
    // This allows page content to render while auth check happens in background
    const quickTimer = setTimeout(() => {
      if (!hasCheckedOnce.current && loadingCycleRef.current === cycleId) {
        setOptimisticCycle(cycleId);
      }
    }, 150);

    const slowTimer = setTimeout(() => {
      if (loadingCycleRef.current === cycleId) {
        setTimeoutCycle(cycleId);
      }
    }, 4000);
    return () => {
      clearTimeout(quickTimer);
      clearTimeout(slowTimer);
    };
  }, [status]);

  const showContent =
    status === "loading" &&
    optimisticCycle !== null &&
    optimisticCycle === loadingCycle;

  const loadingTimedOut =
    status === "loading" &&
    timeoutCycle !== null &&
    timeoutCycle === loadingCycle;

  // Auth pages always render immediately
  if (currentPath.startsWith("/auth")) {
    return <>{children}</>;
  }

  if (demoBypassEnabled) {
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
              <Button onClick={() => router.replace(signInUrl)}>
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

  if (status === "unauthenticated") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center space-y-6 p-8 text-center">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">Redirecting to sign in</h2>
            <p className="text-muted-foreground">
              Your session is not active. Continue to sign in.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => router.replace(signInUrl)}>
              Continue
            </Button>
            <Button variant="outline" onClick={() => router.refresh()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
