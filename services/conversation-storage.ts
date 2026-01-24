import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ConversationDB extends DBSchema {
  conversations: {
    key: string;
    value: {
      id: string;
      type: 'multi-chat' | 'goal-hub' | 'comparison' | 'pipeline';
      title: string;
      timestamp: number;
      data: any;
    };
    indexes: { 'by-type': string; 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<ConversationDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ConversationDB>('multi-llm-conversations', 1, {
      upgrade(db) {
        const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
        conversationStore.createIndex('by-type', 'type');
        conversationStore.createIndex('by-timestamp', 'timestamp');
      },
    });
  }
  return dbPromise;
}

export async function saveConversation(
  type: 'multi-chat' | 'goal-hub' | 'comparison' | 'pipeline',
  title: string,
  data: any
): Promise<string> {
  const db = await getDB();
  const id = `${type}_${Date.now()}`;
  
  await db.put('conversations', {
    id,
    type,
    title,
    timestamp: Date.now(),
    data,
  });
  
  return id;
}

export async function getConversation(id: string) {
  const db = await getDB();
  return db.get('conversations', id);
}

export async function getConversationsByType(type: 'multi-chat' | 'goal-hub' | 'comparison' | 'pipeline') {
  const db = await getDB();
  return db.getAllFromIndex('conversations', 'by-type', type);
}

export async function getAllConversations() {
  const db = await getDB();
  return db.getAll('conversations');
}

export async function deleteConversation(id: string) {
  const db = await getDB();
  return db.delete('conversations', id);
}

export async function updateConversation(id: string, updates: Partial<Omit<ConversationDB['conversations']['value'], 'id'>>) {
  const db = await getDB();
  const conversation = await db.get('conversations', id);
  
  if (!conversation) {
    throw new Error(`Conversation with ID ${id} not found`);
  }
  
  await db.put('conversations', {
    ...conversation,
    ...updates,
    timestamp: updates.timestamp || Date.now(),
  });
}