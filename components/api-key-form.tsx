"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { operationalProviderRegistry } from "@/lib/provider-registry";

const providers = operationalProviderRegistry;

type HealthStatus = "ok" | "invalid" | "unreachable" | "rate_limited" | "provider_error" | "format" | "unknown";

interface ProviderHealth {
  status: HealthStatus;
  message: string;
  latencyMs?: number;
  checkedAt: number;
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  ok: { icon: CheckCircle, color: "text-green-500", label: "Connected" },
  invalid: { icon: XCircle, color: "text-red-500", label: "Invalid" },
  unreachable: { icon: AlertTriangle, color: "text-orange-500", label: "Unreachable" },
  rate_limited: { icon: Clock, color: "text-yellow-500", label: "Rate Limited" },
  provider_error: { icon: AlertTriangle, color: "text-orange-500", label: "Provider Error" },
  format: { icon: XCircle, color: "text-red-500", label: "Bad Format" },
  unknown: { icon: AlertTriangle, color: "text-gray-400", label: "Unknown" },
};

export default function ApiKeyForm() {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [healthStatus, setHealthStatus] = useState<Record<string, ProviderHealth>>({});

  const fetchConfiguredProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setConfiguredProviders(data.configuredProviders || []);
      }
    } catch (error) {
      console.error("Failed to fetch configured providers:", error);
      toast({
        title: "Error",
        description: "Could not load saved key status.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchConfiguredProviders();
  }, [fetchConfiguredProviders]);

  const testSavedKey = useCallback(async (providerId: string) => {
    setTesting(prev => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetch('/api/test-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, testSaved: true }),
      });

      if (!response.ok) {
        setHealthStatus(prev => ({
          ...prev,
          [providerId]: {
            status: "unknown",
            message: "Health check unavailable.",
            checkedAt: Date.now(),
          },
        }));
        return;
      }

      const result = await response.json();
      const status: HealthStatus = result.valid
        ? "ok"
        : (result.reason as HealthStatus) || "unknown";

      setHealthStatus(prev => ({
        ...prev,
        [providerId]: {
          status,
          message: result.message,
          latencyMs: result.latencyMs,
          checkedAt: Date.now(),
        },
      }));
    } catch {
      setHealthStatus(prev => ({
        ...prev,
        [providerId]: {
          status: "unreachable",
          message: "Could not reach health check endpoint.",
          checkedAt: Date.now(),
        },
      }));
    } finally {
      setTesting(prev => ({ ...prev, [providerId]: false }));
    }
  }, []);

  const handleSaveKey = async (providerId: string) => {
    const apiKey = apiKeys[providerId];
    const provider = providers.find(p => p.id === providerId);
    const requiresApiKey = provider?.requiresApiKey ?? true;

    if (requiresApiKey && !apiKey) {
      toast({
        title: "No API Key",
        description: "Please enter an API key before saving.",
        variant: "destructive",
      });
      return;
    }

    setLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      let verificationWarning: string | null = null;
      try {
        const testResponse = await fetch('/api/test-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerId, apiKey: apiKey || "" }),
        });

        if (!testResponse.ok) {
          if (testResponse.status === 401 || testResponse.status === 403) {
            toast({
              title: "Sign in required",
              description: "Sign in again to verify and save provider keys to your account.",
              variant: "destructive",
            });
            return;
          }
          verificationWarning = "Key verification service unavailable. Saving without verification.";
        } else {
          const testResult = await testResponse.json();
          if (!testResult.valid) {
            if (testResult.reason === "rate_limited" || testResult.reason === "provider_error" || testResult.reason === "unreachable") {
              verificationWarning = testResult.message || "Unable to verify key right now.";
            } else {
              toast({
                title: "Invalid API Key",
                description: testResult.message || "This API key is not valid.",
                variant: "destructive",
              });
              return;
            }
          }
        }
      } catch {
        verificationWarning = "Could not verify this key right now. Saving without verification.";
      }

      const saveResponse = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey: apiKey }),
      });

      if (!saveResponse.ok) {
        if (saveResponse.status === 401 || saveResponse.status === 403) {
          toast({
            title: "Sign in required",
            description: "Sign in again to save provider keys to your account.",
            variant: "destructive",
          });
          return;
        }
        let errorMessage = 'Failed to save provider configuration.';
        try {
          const errorBody = await saveResponse.json();
          if (errorBody?.error) {
            errorMessage = errorBody.error;
          }
        } catch {}
        throw new Error(errorMessage);
      }

      if (verificationWarning) {
        toast({
          title: "Saved (verification skipped)",
          description: verificationWarning,
        });
      } else {
        toast({
          title: "Success",
          description: `${providers.find(p => p.id === providerId)?.name} configured successfully.`,
        });
      }
      setConfiguredProviders(prev => [...new Set([...prev, providerId])]);
      setApiKeys(prev => ({ ...prev, [providerId]: "" }));

      // Clear old health status and re-test the saved key
      setHealthStatus(prev => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      testSavedKey(providerId);

    } catch (error) {
      console.error("Error saving API key:", error);
      toast({
        title: "Error",
        description: "Failed to save provider configuration.",
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const handleClearKey = async (providerId: string) => {
    setLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey: "", clear: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to clear API key.');
      }

      const provider = providers.find(p => p.id === providerId);
      toast({
        title: provider?.acceptsApiKey === false ? "Connection Removed" : "API Key Cleared",
        description: provider?.acceptsApiKey === false
          ? `${provider.name} has been disconnected.`
          : `${provider?.name} API key has been removed.`,
      });
      setConfiguredProviders(prev => prev.filter(p => p !== providerId));
      setApiKeys(prev => ({ ...prev, [providerId]: "" }));
      setHealthStatus(prev => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
    } catch (error) {
      console.error("Error clearing API key:", error);
      toast({
        title: "Error",
        description: "Failed to clear API key.",
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const toggleShowKey = (providerId: string) => {
    setShowKeys(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const renderHealthBadge = (providerId: string) => {
    const health = healthStatus[providerId];
    const isTesting = testing[providerId];
    const isConfigured = configuredProviders.includes(providerId);

    if (isTesting) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Testing...
        </Badge>
      );
    }

    if (!isConfigured) return null;

    if (!health) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-500" />
          Saved
        </Badge>
      );
    }

    const config = STATUS_CONFIG[health.status] || STATUS_CONFIG.unknown;
    const Icon = config.icon;

    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className="flex items-center gap-1"
          title={health.message}
        >
          <Icon className={`h-3 w-3 ${config.color}`} />
          {config.label}
          {health.latencyMs !== undefined && health.latencyMs > 0 && (
            <span className="text-xs text-muted-foreground ml-1">
              {health.latencyMs}ms
            </span>
          )}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => testSavedKey(providerId)}
          disabled={isTesting}
          title="Re-check connection"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {providers.map((provider) => (
        <div key={provider.id}>
          <div className="flex items-center justify-between mb-1">
            <div className="space-y-0.5">
              <Label htmlFor={`${provider.id}-api-key`}>
                {provider.name}{provider.requiresApiKey ? ' API Key' : ' Connection'}
              </Label>
              <p className="text-xs text-muted-foreground">{provider.description}</p>
            </div>
            {renderHealthBadge(provider.id)}
          </div>
          <div className="flex gap-2">
            {provider.acceptsApiKey === false ? (
              <div
                className="flex flex-1 items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
                role="note"
              >
                No API key required. This shared public endpoint is experimental; never submit private or sensitive data.
              </div>
            ) : (
              <div className="relative flex-1">
              <Input
                id={`${provider.id}-api-key`}
                type={showKeys[provider.id] ? "text" : "password"}
                value={apiKeys[provider.id] || ""}
                onChange={(e) => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                placeholder={configuredProviders.includes(provider.id) ? "Configured. Enter a new key to replace." : provider.placeholder}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => toggleShowKey(provider.id)}
                aria-label={showKeys[provider.id] ? "Hide API key" : "Show API key"}
              >
                {showKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showKeys[provider.id] ? "Hide" : "Show"} API key</span>
              </Button>
              </div>
            )}
            <Button
              onClick={() => handleSaveKey(provider.id)}
              disabled={
                loading[provider.id] ||
                (provider.requiresApiKey && !apiKeys[provider.id])
              }
              size="sm"
            >
              {loading[provider.id] ? "Saving..." : provider.requiresApiKey ? "Save" : "Connect"}
            </Button>
            {configuredProviders.includes(provider.id) && !healthStatus[provider.id] && (
              <Button
                onClick={() => testSavedKey(provider.id)}
                disabled={testing[provider.id]}
                variant="outline"
                size="sm"
                title={provider.acceptsApiKey === false ? "Test connection" : "Test saved API key"}
              >
                {testing[provider.id] ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Test"
                )}
              </Button>
            )}
            <Button
              onClick={() => handleClearKey(provider.id)}
              disabled={loading[provider.id] || !configuredProviders.includes(provider.id)}
              variant="destructive"
              size="sm"
            >
              Clear
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
