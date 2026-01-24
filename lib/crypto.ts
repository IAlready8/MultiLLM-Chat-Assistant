// lib/crypto.ts
import { isServer, b64encode, b64decode, utf8encode, utf8decode } from "./runtime";

// 32 bytes key from any string seed
export async function deriveKey(seed: string): Promise<Uint8Array> {
  // SHA-256(seed) -> 32 bytes
  if (isServer) {
    const { createHash } = await import("crypto");
    const h = createHash("sha256").update(seed, "utf8").digest();
    return new Uint8Array(h);
  } else {
    const encoded = utf8encode(seed);
    const buf = await crypto.subtle.digest("SHA-256", encoded as BufferSource);
    return new Uint8Array(buf);
  }
}

export function randomBytes(n: number): Uint8Array {
  if (isServer) {
    const { randomBytes } = require("crypto") as typeof import("crypto");
    return new Uint8Array(randomBytes(n));
  } else {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
  }
}

export async function aesGcmEncrypt(keyRaw: Uint8Array, plaintext: string): Promise<string> {
  const iv = randomBytes(12);
  if (isServer) {
    const { createCipheriv } = await import("crypto");
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyRaw), Buffer.from(iv));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = new Uint8Array(iv.length + ct.length + tag.length);
    payload.set(iv, 0);
    payload.set(ct, iv.length);
    payload.set(tag, iv.length + ct.length);
    return `v2:gcm:${b64encode(payload)}`;
  } else {
    const key = await crypto.subtle.importKey("raw", keyRaw as BufferSource, "AES-GCM", false, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, utf8encode(plaintext) as BufferSource);
    const tagAppended = new Uint8Array(ct); // WebCrypto includes tag
    const payload = new Uint8Array(iv.length + tagAppended.length);
    payload.set(iv, 0);
    payload.set(tagAppended, iv.length);
    return `v2:gcm:${b64encode(payload)}`;
  }
}

export async function aesGcmDecrypt(keyRaw: Uint8Array, token: string): Promise<string> {
  if (!token.startsWith("v2:gcm:")) throw new Error("not-gcm");
  const payload = b64decode(token.slice("v2:gcm:".length));
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  if (isServer) {
    const { createDecipheriv } = await import("crypto");
    // Node expects tag separated; last 16 bytes are GCM tag
    if (data.length < 17) throw new Error("cipher-too-short");
    const tag = data.slice(data.length - 16);
    const ct = data.slice(0, data.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyRaw), Buffer.from(iv));
    decipher.setAuthTag(Buffer.from(tag));
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } else {
    const key = await crypto.subtle.importKey("raw", keyRaw as BufferSource, "AES-GCM", false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
    return utf8decode(new Uint8Array(pt));
  }
}

// LEGACY FUNCTIONS FOR BACKWARD COMPATIBILITY

// Generate a random encryption key
export function generateEncryptionKey(): string {
  const array = new Uint8Array(16);
  if (isServer) {
    const { randomBytes } = require("crypto") as typeof import("crypto");
    return randomBytes(16).toString('hex');
  } else {
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

// Validate base64 string
export function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  try {
    // Check if string contains only valid base64 characters
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(str)) return false;
    
    // Try to decode and check if successful
    if (isServer) {
      Buffer.from(str, 'base64');
    } else {
      atob(str);
    }
    return true;
  } catch (error) {
    return false;
  }
}

// Encrypt text with a key
export async function encrypt(text: string, key: string): Promise<string> {
  if (isServer) {
    const { createCipheriv, randomBytes } = await import("crypto");
    const keyData = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyData, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString("base64");
  } else {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = encoder.encode(text);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encodedText
    );
    
    const encryptedArray = new Uint8Array(iv.length + encryptedData.byteLength);
    encryptedArray.set(iv);
    encryptedArray.set(new Uint8Array(encryptedData), iv.length);
    
    return btoa(String.fromCharCode(...encryptedArray));
  }
}

// Decrypt text with a key
export async function decrypt(encryptedText: string, key: string): Promise<string> {
  try {
    // Validate base64 format first
    if (!isValidBase64(encryptedText)) {
      throw new Error('Invalid encrypted data format');
    }
    
    if (isServer) {
      const { createDecipheriv } = await import("crypto");
      const keyData = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
      const combined = Buffer.from(encryptedText, 'base64');
      const iv = combined.slice(0, 12);
      const tag = combined.slice(-16);
      const encrypted = combined.slice(12, -16);
      
      const decipher = createDecipheriv("aes-256-gcm", keyData, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf8");
    } else {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      
      const encryptedArray = new Uint8Array(
        atob(encryptedText).split('').map(char => char.charCodeAt(0))
      );
      const iv = encryptedArray.slice(0, 12);
      const encryptedData = encryptedArray.slice(12);
      
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encryptedData
      );
      
      return decoder.decode(decryptedData);
    }
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data. Invalid key or corrupted data.');
  }
}

// Simplified API for components
const DEFAULT_KEY = 'default-encryption-key-12345678901234567890123456789012';

export function encryptApiKey(apiKey: string): string {
  if (!apiKey) return '';
  
  try {
    // Simple XOR encryption for demo purposes
    const encrypted = Array.from(apiKey)
      .map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ DEFAULT_KEY.charCodeAt(i % DEFAULT_KEY.length))
      )
      .join('');
    
    return isServer ? Buffer.from(encrypted).toString('base64') : btoa(encrypted);
  } catch (error) {
    console.error('Encryption error:', error);
    return apiKey;
  }
}

export function decryptApiKey(encryptedApiKey: string): string {
  if (!encryptedApiKey) return '';
  
  try {
    // Check if it's already decrypted (plain text)
    if (!isValidBase64(encryptedApiKey)) {
      return encryptedApiKey;
    }
    
    const encrypted = isServer ? Buffer.from(encryptedApiKey, 'base64').toString() : atob(encryptedApiKey);
    const decrypted = Array.from(encrypted)
      .map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ DEFAULT_KEY.charCodeAt(i % DEFAULT_KEY.length))
      )
      .join('');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedApiKey;
  }
}