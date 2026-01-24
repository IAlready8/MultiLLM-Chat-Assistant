import { encrypt, decrypt } from "@/lib/crypto";
import { getAllConversations, saveConversation } from "./conversation-storage";

export interface ExportData {
  version: string;
  timestamp: number;
  conversations: any[];
  settings?: Record<string, any>;
  apiKeys?: Record<string, string>;
}

export async function exportAllData(password: string): Promise<string> {
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
    
    // Get API keys (encrypted)
    const apiKeys: Record<string, string> = {};
    const apiKeyPrefix = "apiKey_";
    
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(apiKeyPrefix)) {
        apiKeys[key] = localStorage.getItem(key) || "";
      }
    }
    
    // Create export data
    const exportData: ExportData = {
      version: "1.0",
      timestamp: Date.now(),
      conversations,
      settings,
      apiKeys
    };
    
    // Encrypt and return
    const jsonData = JSON.stringify(exportData);
    return await encrypt(jsonData, password);
  } catch (error) {
    console.error("Error exporting data:", error);
    throw new Error("Failed to export data");
  }
}

export async function importAllData(encryptedData: string, password: string): Promise<void> {
  try {
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
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }
    
    // Import API keys
    if (importData.apiKeys) {
      for (const [key, value] of Object.entries(importData.apiKeys)) {
        localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    console.error("Error importing data:", error);
    throw new Error("Failed to import data. Invalid password or corrupted data.");
  }
}