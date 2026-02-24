// lib/secure-storage.ts
import { encrypt, decrypt } from './crypto';

// In-memory storage for API keys (in a real app, this would be more secure)
const secureStorage: Record<string, string> = {};
let storageEncryptionKeyPromise: Promise<string> | null = null;

const generateRuntimeKey = async (): Promise<string> => {
  // Allow explicit override for deterministic test environments.
  const configuredKey = process.env.SECURE_STORAGE_KEY?.trim();
  if (configuredKey) {
    return configuredKey;
  }

  // Generate a per-runtime key to avoid a hardcoded global fallback.
  if (typeof window === 'undefined') {
    const { randomBytes } = await import('crypto');
    return randomBytes(32).toString('hex');
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const getStorageEncryptionKey = async (): Promise<string> => {
  if (!storageEncryptionKeyPromise) {
    storageEncryptionKeyPromise = generateRuntimeKey();
  }
  return storageEncryptionKeyPromise;
};

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
    const encryptionKey = await getStorageEncryptionKey();
    const encrypted = await encrypt(apiKey, encryptionKey);
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
    const encryptionKey = await getStorageEncryptionKey();
    return await decrypt(encrypted, encryptionKey);
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
  if (typeof window === 'undefined') {
    return null;
  }

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
