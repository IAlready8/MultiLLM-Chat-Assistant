import { encrypt, decrypt } from "@/lib/crypto";
import { COMPARISON_SESSIONS_STORAGE_KEY } from "./comparison-session-storage";
import { getAllConversations, saveConversation } from "./conversation-storage";

export interface ExportData {
  version: string;
  timestamp: number;
  conversations: any[];
  comparisonSessions?: any[];
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
    const comparisonSessionsRaw = localStorage.getItem(
      COMPARISON_SESSIONS_STORAGE_KEY
    );
    
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
      comparisonSessions: comparisonSessionsRaw
        ? JSON.parse(comparisonSessionsRaw)
        : [],
      settings,
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

    if (Array.isArray(importData.comparisonSessions)) {
      localStorage.setItem(
        COMPARISON_SESSIONS_STORAGE_KEY,
        JSON.stringify(importData.comparisonSessions)
      );
    }
    
    // Import settings
    if (importData.settings) {
      for (const [key, value] of Object.entries(importData.settings)) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }
    
    // Legacy exports may contain API keys. Do not restore them.
  } catch (error) {
    console.error("Error importing data:", error);
    throw new Error("Failed to import data. Invalid password or corrupted data.");
  }
}
