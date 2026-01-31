"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const providers = [
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-v1-..." },
  { id: "anthropic", name: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { id: "googleai", name: "Google AI", placeholder: "AIza..." },
  { id: "grok", name: "Grok (xAI)", placeholder: "xai-..." },
];

export default function ApiKeyForm() {
  const { toast } = useToast();
  const { status } = useSession();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

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
    if (status !== "authenticated") return;
    fetchConfiguredProviders();
  }, [fetchConfiguredProviders, status]);

  const handleSaveKey = async (providerId: string) => {
    if (status !== "authenticated") {
      toast({
        title: "Sign in required",
        description: "Please sign in to save API keys.",
        variant: "destructive",
      });
      return;
    }

    const apiKey = apiKeys[providerId];
    if (!apiKey) {
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
        // First, optionally test the key to provide feedback to the user
        const testResponse = await fetch('/api/test-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerId, apiKey: apiKey }),
        });

        if (!testResponse.ok) {
          if (testResponse.status === 401 || testResponse.status === 403) {
            toast({
              title: "Sign in required",
              description: "Please sign in to verify and save API keys.",
              variant: "destructive",
            });
            return;
          }
          verificationWarning = "Key verification service unavailable. Saving without verification.";
        } else {
          const testResult = await testResponse.json();
          if (!testResult.valid) {
            if (testResult.reason === "unverified" || testResult.reason === "provider_error") {
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
      } catch (error) {
        verificationWarning = "Could not verify this key right now. Saving without verification.";
      }

      // If the test passes, save the key to the secure backend
      const saveResponse = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey: apiKey }),
      });

      if (!saveResponse.ok) {
        if (saveResponse.status === 401 || saveResponse.status === 403) {
          toast({
            title: "Sign in required",
            description: "Please sign in again to save API keys.",
            variant: "destructive",
          });
          return;
        }
        let errorMessage = 'Failed to save API key.';
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
          description: `API key for ${providers.find(p => p.id === providerId)?.name} saved successfully.`,
        });
      }
      setConfiguredProviders(prev => [...new Set([...prev, providerId])]);
      setApiKeys(prev => ({ ...prev, [providerId]: "" })); // Clear input field after save

    } catch (error) {
      console.error("Error saving API key:", error);
      toast({
        title: "Error",
        description: "Failed to save API key.",
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const handleClearKey = async (providerId: string) => {
    if (status !== "authenticated") {
      toast({
        title: "Sign in required",
        description: "Please sign in to update API keys.",
        variant: "destructive",
      });
      return;
    }

    setLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey: "" }), // Send empty key to clear
      });

      if (!response.ok) {
        throw new Error('Failed to clear API key.');
      }

      toast({
        title: "API Key Cleared",
        description: `${providers.find(p => p.id === providerId)?.name} API key has been removed.`,
      });
      setConfiguredProviders(prev => prev.filter(p => p !== providerId));
      setApiKeys(prev => ({ ...prev, [providerId]: "" }));
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

  return (
    <div className="space-y-6">
      {providers.map((provider) => (
        <div key={provider.id}>
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor={`${provider.id}-api-key`}>{provider.name} API Key</Label>
            {configuredProviders.includes(provider.id) && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Saved
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id={`${provider.id}-api-key`}
                type={showKeys[provider.id] ? "text" : "password"}
                value={apiKeys[provider.id] || ""}
                onChange={(e) => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                placeholder={configuredProviders.includes(provider.id) ? "••••••••••••••••••••••" : provider.placeholder}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => toggleShowKey(provider.id)}
                tabIndex={-1}
              >
                {showKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showKeys[provider.id] ? "Hide" : "Show"} API key</span>
              </Button>
            </div>
            <Button
              onClick={() => handleSaveKey(provider.id)}
              disabled={loading[provider.id] || !apiKeys[provider.id]}
              size="sm"
            >
              {loading[provider.id] ? "Saving..." : "Save"}
            </Button>
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
