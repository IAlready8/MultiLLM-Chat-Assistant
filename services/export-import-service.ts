import { encrypt, decrypt } from "@/lib/crypto";
import { getAllConversations, saveConversation } from "./conversation-storage";

const PREFERENCE_KEYS = new Set(['modelSettings', 'theme', 'userPreferences'])
const MAX_EXPORT_BYTES = 5 * 1024 * 1024

export interface ExportData {
  version: string;
  timestamp: number;
  conversations: any[];
  settings?: Record<string, any>;
  apiKeys?: Record<string, string>;
}

export async function exportAllData(password: string): Promise<string> {
  if (password.length < 12) throw new Error('Use a password of at least 12 characters')
  try {
    // Get all conversations
    const conversations = await getAllConversations();
    
    // Get settings from localStorage
    const settings: Record<string, any> = {};
    const settingsKeys = ["modelSettings", "theme", "userPreferences"];
    
    for (const key of settingsKeys) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          settings[key] = JSON.parse(value);
        } catch {
          settings[key] = value;
        }
      }
    }
    
    // Create export data
    const exportData: ExportData = {
      version: "1.0",
      timestamp: Date.now(),
      conversations,
      settings,
    };
    
    // Encrypt and return
    const jsonData = JSON.stringify(exportData);
    if (new TextEncoder().encode(jsonData).byteLength > MAX_EXPORT_BYTES) throw new Error('Local export exceeds the 5 MiB limit')
    return await encrypt(jsonData, password);
  } catch (error) {
    console.error("Error exporting data:", error);
    throw new Error("Failed to export data");
  }
}

export async function importAllData(encryptedData: string, password: string): Promise<void> {
  try {
    if (encryptedData.length > Math.ceil(MAX_EXPORT_BYTES * 4 / 3) + 256) throw new Error('Import is too large')
    // Decrypt data
    const jsonData = await decrypt(encryptedData, password);
    const importData: ExportData = JSON.parse(jsonData);
    
    // Validate data
    if (!importData.version || !importData.timestamp || !Array.isArray(importData.conversations)) {
      throw new Error("Invalid import data format");
    }
    
    // Import conversations
    for (const conversation of importData.conversations) {
      await saveConversation(
        conversation.type,
        conversation.title,
        conversation.data
      );
    }
    
    // Import settings
    if (importData.settings) {
      for (const [key, value] of Object.entries(importData.settings)) {
        if (!PREFERENCE_KEYS.has(key)) continue
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }
    
    // Legacy exports may contain API keys. Do not restore them.
  } catch (error) {
    console.error("Error importing data:", error);
    throw new Error("Failed to import data. Invalid password or corrupted data.");
  }
}
