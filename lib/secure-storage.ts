// lib/secure-storage.ts
import { encrypt, decrypt } from './crypto';

// In-memory storage for API keys (in a real app, this would be more secure)
const secureStorage: Record<string, string> = {};

/**
 * Store an API key securely
 * @param provider The provider name (e.g., 'openai', 'claude')
 * @param apiKey The API key to store
 */
export async function setStoredApiKey(provider: string, apiKey: string): Promise<void> {
  if (!apiKey) {
    delete secureStorage[provider];
    return;
  }
  
  try {
    const encrypted = await encrypt(apiKey, 'secure-storage-key');
    secureStorage[provider] = encrypted;
  } catch (error) {
    console.error('Error encrypting API key:', error);
    throw new Error('Failed to store API key securely');
  }
}

/**
 * Retrieve a stored API key
 * @param provider The provider name (e.g., 'openai', 'claude')
 * @returns The decrypted API key or null if not found
 */
export async function getStoredApiKey(provider: string): Promise<string | null> {
  const encrypted = secureStorage[provider];
  if (!encrypted) {
    return null;
  }
  
  try {
    return await decrypt(encrypted, 'secure-storage-key');
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
}

/**
 * Get legacy API key if present (for backward compatibility)
 * @param provider The provider name
 * @returns The API key or null if not found
 */
export async function getLegacyApiKeyIfPresent(provider: string): Promise<string | null> {
  // Check localStorage for legacy keys
  const legacyKey = localStorage.getItem(`apiKey_${provider}`);
  if (legacyKey) {
    // Remove the legacy key from localStorage
    localStorage.removeItem(`apiKey_${provider}`);
    
    // Migrate to secure storage
    await setStoredApiKey(provider, legacyKey);
    
    return legacyKey;
  }
  
  return null;
}