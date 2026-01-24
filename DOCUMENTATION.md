# MultiLLM Chat Assistant API Documentation

This documentation covers all the APIs, services, components, and hooks implemented in the MultiLLM Chat Assistant application.

## Table of Contents
1.  [API Client Services](#api-client-services)
2.  [Secure Storage](#secure-storage)
3.  [Conversation Management](#conversation-management)
4.  [Authentication](#authentication)
5.  [Analytics & Visualization](#analytics--visualization)
6.  [Export & Import](#export--import)
7.  [UI Components](#ui-components)

## 1. API Client Services

### `callLLMApi(provider, prompt, options)`

Makes a request to a specific LLM provider's API.

**Parameters:**

*   `provider` (string): The ID of the LLM provider (e.g., "openai", "claude")
*   `prompt` (string | string[]): The prompt text or conversation history
*   `options` (LLMRequestOptions): Configuration options for the request

**Returns:**

*   `Promise<LLMResponse>`: The response from the LLM provider

**Options:**

```typescript
interface LLMRequestOptions {
  model?: string;         // Model name to use
  temperature?: number;   // Sampling temperature (0-1)
  maxTokens?: number;     // Maximum tokens to generate
  systemPrompt?: string;  // System prompt for context
  stream?: boolean;       // Whether to stream the response
  onChunk?: (chunk: string) => void; // Callback for streaming chunks
}
```

**Response:**

```typescript
interface LLMResponse {
  text: string;           // Generated text
  usage?: {               // Token usage statistics
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>; // Additional provider-specific metadata
}
```

**Example:**

```typescript
import { callLLMApi } from "@/services/api-client";

async function generateText() {
  try {
    const response = await callLLMApi(
      "openai",
      "Explain quantum computing in simple terms",
      {
        model: "gpt-4o",
        temperature: 0.7,
        maxTokens: 500
      }
    );
    
    console.log(response.text);
    console.log(`Used ${response.usage?.totalTokens} tokens`);
  } catch (error) {
    console.error("API call failed:", error);
  }
}
```

### `sendChatMessage(provider, messages, options)`

Sends a chat message to a specific LLM provider and formats the response.

**Parameters:**

*   `provider` (string): The ID of the LLM provider
*   `messages` (ChatMessage[]): Array of chat messages
*   `options` (LLMRequestOptions): Configuration options for the request

**Returns:**

*   `Promise<ChatMessage>`: The assistant's response as a ChatMessage

**ChatMessage:**

```typescript
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}
```

**Example:**

```typescript
import { sendChatMessage } from "@/services/api-service";

async function handleUserMessage(userInput: string) {
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: userInput }
  ];
  
  const response = await sendChatMessage("claude", messages, {
    temperature: 0.5
  });
  
  console.log(response.content);
}
```

### `streamChatMessage(provider, messages, onChunk, options)`

Streams a chat response from a specific LLM provider.

**Parameters:**

*   `provider` (string): The ID of the LLM provider
*   `messages` (ChatMessage[]): Array of chat messages
*   `onChunk` (function): Callback function that receives each text chunk
*   `options` (LLMRequestOptions): Configuration options for the request

**Returns:**

*   `Promise<void>`

**Example:**

```typescript
import { streamChatMessage } from "@/services/api-service";

function handleStreamedResponse() {
  const messages = [
    { role: "user", content: "Write a short story about a robot" }
  ];
  
  let responseText = "";
  
  streamChatMessage(
    "openai",
    messages,
    (chunk) => {
      responseText += chunk;
      // Update UI with each chunk
      updateUI(responseText);
    },
    { model: "gpt-4o" }
  );
}
```

## 2. Secure Storage

### `secureStore(key, value)`

Securely stores a value with encryption.

**Parameters:**

*   `key` (string): Storage key
*   `value` (string): Value to store

**Returns:**

*   `Promise<void>`

**Example:**

```typescript
import { secureStore } from "@/lib/secure-storage";

async function saveApiKey(apiKey: string) {
  await secureStore("apiKey_openai", apiKey);
}
```

### `secureRetrieve(key)`

Securely retrieves a stored value.

**Parameters:**

*   `key` (string): Storage key

**Returns:**

*   `Promise<string | null>`: The decrypted value or null if not found

**Example:**

```typescript
import { secureRetrieve } from "@/lib/secure-storage";

async function getApiKey() {
  const apiKey = await secureRetrieve("apiKey_openai");
  return apiKey;
}
```

### `secureRemove(key)`

Removes a securely stored value.

**Parameters:**

*   `key` (string): Storage key

**Returns:**

*   `void`

**Example:**

```typescript
import { secureRemove } from "@/lib/secure-storage";

function clearApiKey() {
  secureRemove("apiKey_openai");
}
```

### `encrypt(text, key)`and `decrypt(encryptedText, key)`

Low-level encryption and decryption functions.

**Parameters:**

*   `text` / `encryptedText` (string): Text to encrypt or decrypt
*   `key` (string): Encryption key

**Returns:**

*   `Promise<string>`: Encrypted or decrypted text

**Example:**

```typescript
import { encrypt, decrypt } from "@/lib/crypto";

async function encryptAndDecrypt() {
  const key = "my-secret-key";
  const text = "sensitive data";
  
  const encrypted = await encrypt(text, key);
  console.log("Encrypted:", encrypted);
  
  const decrypted = await decrypt(encrypted, key);
  console.log("Decrypted:", decrypted); // "sensitive data"
}
```

## 3. Conversation Management

### `saveConversation(type, title, data)`

Saves a conversation to the IndexedDB storage.

**Parameters:**

*   `type` (string): Conversation type ('multi-chat', 'goal-hub', 'comparison', 'pipeline')
*   `title` (string): Conversation title
*   `data` (any): Conversation data

**Returns:**

*   `Promise<string>`: ID of the saved conversation

**Example:**

```typescript
import { saveConversation } from "@/services/conversation-storage";

async function saveCurrentChat(messages) {
  const id = await saveConversation(
    "multi-chat",
    "Chat with GPT-4 and Claude",
    { messages }
  );
  console.log(`Saved conversation with ID: ${id}`);
}
```

### `getConversation(id)`

Retrieves a specific conversation by ID.

**Parameters:**

*   `id` (string): Conversation ID

**Returns:**

*   `Promise<Conversation | undefined>`: The conversation object or undefined if not found

**Example:**

```typescript
import { getConversation } from "@/services/conversation-storage";

async function loadConversation(id) {
  const conversation = await getConversation(id);
  if (conversation) {
    console.log(`Loaded: ${conversation.title}`);
    return conversation.data;
  }
  return null;
}
```

### `getConversationsByType(type)`

Retrieves all conversations of a specific type.

**Parameters:**

*   `type` (string): Conversation type

**Returns:**

*   `Promise<Conversation[]>`: Array of conversation objects

**Example:**

```typescript
import { getConversationsByType } from "@/services/conversation-storage";

async function loadAllMultiChats() {
  const conversations = await getConversationsByType("multi-chat");
  console.log(`Found ${conversations.length} multi-chats`);
  return conversations;
}
```

### `getAllConversations()`

Retrieves all saved conversations.

**Returns:**

*   `Promise<Conversation[]>`: Array of all conversation objects

**Example:**

```typescript
import { getAllConversations } from "@/services/conversation-storage";

async function backupAllConversations() {
  const allConversations = await getAllConversations();
  const backup = JSON.stringify(allConversations);
  // Save backup
}
```

### `deleteConversation(id)`

Deletes a conversation by ID.

**Parameters:**

*   `id` (string): Conversation ID

**Returns:**

*   `Promise<void>`

**Example:**

```typescript
import { deleteConversation } from "@/services/conversation-storage";

async function removeConversation(id) {
  await deleteConversation(id);
  console.log(`Conversation ${id} deleted`);
}
```

### `updateConversation(id, updates)`

Updates an existing conversation.

**Parameters:**

*   `id` (string): Conversation ID
*   `updates` (object): Properties to update

**Returns:**

*   `Promise<void>`

**Example:**

```typescript
import { updateConversation } from "@/services/conversation-storage";

async function renameConversation(id, newTitle) {
  await updateConversation(id, { title: newTitle });
}
```

### `useConversation(type)`

React hook for managing conversations of a specific type.

**Parameters:**

*   `type` (string): Conversation type

**Returns:**

*   Object with the following properties:
    *   `conversations` (array): List of conversations
    *   `isLoading` (boolean): Loading state
    *   `error` (string | null): Error message if any
    *   `saveConversation` (function): Save a new conversation
    *   `updateConversation` (function): Update an existing conversation
    *   `deleteConversation` (function): Delete a conversation
    *   `refreshConversations` (function): Refresh the conversation list

**Example:**

```typescript
import { useConversation } from "@/hooks/use-conversation";

function ConversationList() {
  const {
    conversations,
    isLoading,
    error,
    saveConversation,
    deleteConversation
  } = useConversation("multi-chat");
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <ul>
      {conversations.map(conv => (
        <li key={conv.id}>
          {conv.title}
          <button onClick={() => deleteConversation(conv.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

## 4. Authentication

### `authOptions`

Configuration options for NextAuth.js.

**Properties:**

*   `providers`: Authentication providers (Google, GitHub, Credentials)
*   `pages`: Custom authentication pages
*   `callbacks`: Authentication callbacks
*   `session`: Session configuration
*   `secret`: Authentication secret

**Example:**

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

### `<AuthProvider>`

React context provider for authentication.

**Props:**

*   `children` (ReactNode): Child components

**Example:**

```typescript
// app/layout.tsx
import { AuthProvider } from "@/components/auth-provider";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### `<AuthGuard>`

Component that protects routes requiring authentication.

**Props:**

*   `children` (ReactNode): Child components

**Example:**

```typescript
// app/layout.tsx
import { AuthGuard } from "@/components/auth-guard";

export default function RootLayout({ children }) {
  return (
    <AuthProvider>
      <AuthGuard>
        {children}
      </AuthGuard>
    </AuthProvider>
  );
}
```

### `<UserNav>`

User navigation component showing authentication status and options.

**Example:**

```typescript
import { UserNav } from "@/components/user-nav";

function Header() {
  return (
    <header>
      <div className="logo">MultiLLM</div>
      <UserNav />
    </header>
  );
}
```

## 5. Analytics & Visualization

### `<UsageChart>`

Component for visualizing usage statistics.

**Props:**

*   `data` (array): Usage data to visualize
*   `title` (string, optional): Chart title

**Data Format:**

```typescript
interface UsageData {
  provider: string;
  requests: number;
  tokens: number;
  errors: number;
  avgResponseTime: number;
  date?: string;
}
```

**Example:**

```typescript
import { UsageChart } from "@/components/analytics/usage-chart";

function AnalyticsPage() {
  const usageData = [
    {
      provider: "OpenAI",
      requests: 150,
      tokens: 12500,
      errors: 3,
      avgResponseTime: 850
    },
    // More data...
  ];
  
  return <UsageChart data={usageData} title="Monthly Usage" />;
}
```

### `<ModelComparisonChart>`

Component for comparing model performance across different metrics.

**Props:**

*   `data` (array): Model comparison data
*   `title` (string, optional): Chart title

**Data Format:**

```typescript
interface ModelComparisonData {
  provider: string;
  factualAccuracy: number;
  creativity: number;
  helpfulness: number;
  coherence: number;
  conciseness: number;
}
```

**Example:**

```typescript
import { ModelComparisonChart } from "@/components/analytics/model-comparison-chart";

function ComparisonPage() {
  const comparisonData = [
    {
      provider: "OpenAI",
      factualAccuracy: 4.5,
      creativity: 4.2,
      helpfulness: 4.7,
      coherence: 4.8,
      conciseness: 3.9
    },
    // More data...
  ];
  
  return <ModelComparisonChart data={comparisonData} />;
}
```

### Chart Components

Base chart components for creating custom visualizations.

**Components:**

*   `<Chart>`: Base container for charts
*   `<BarChart>`: Bar chart component
*   `<LineChart>`: Line chart component
*   `<PieChart>`: Pie chart component

**Example:**

```typescript
import { BarChart, Bar } from "@/components/ui/chart";

function CustomChart({ data }) {
  return (
    <BarChart data={data} xAxisKey="name">
      <Bar dataKey="value" fill="#3B82F6" name="Value" />
    </BarChart>
  );
}
```

## 6. Export & Import

### `exportAllData(password)`

Exports all application data with password encryption.

**Parameters:**

*   `password` (string): Password for encryption

**Returns:**

*   `Promise<string>`: Encrypted export data

**Example:**

```typescript
import { exportAllData } from "@/services/export-import-service";

async function handleExport(password) {
  try {
    const exportData = await exportAllData(password);
    // Save to file or clipboard
    return exportData;
  } catch (error) {
    console.error("Export failed:", error);
  }
}
```

### `importAllData(encryptedData, password)`

Imports previously exported data.

**Parameters:**

*   `encryptedData` (string): Encrypted data string
*   `password` (string): Password for decryption

**Returns:**

*   `Promise<void>`

**Example:**

```typescript
import { importAllData } from "@/services/export-import-service";

async function handleImport(data, password) {
  try {
    await importAllData(data, password);
    console.log("Import successful");
  } catch (error) {
    console.error("Import failed:", error);
  }
}
```

### `<ExportImportDialog>`

Component for exporting and importing data.

**Props:**

*   `onExport` (function): Function to handle export
*   `onImport` (function): Function to handle import
*   `buttonVariant` (string, optional): Button style variant

**Example:**

```typescript
import { ExportImportDialog } from "@/components/export-import-dialog";
import { exportAllData, importAllData } from "@/services/export-import-service";

function SettingsPage() {
  return (
    <ExportImportDialog
      onExport={exportAllData}
      onImport={importAllData}
    />
  );
}
```

## 7. UI Components

### `<ConversationManager>`

Component for saving, loading, and managing conversations.

**Props:**

*   `type` (string): Conversation type
*   `data` (any): Current conversation data
*   `onLoad` (function): Callback when a conversation is loaded
*   `buttonVariant` (string, optional): Button style variant

**Example:**

```typescript
import { ConversationManager } from "@/components/conversation-manager";

function ChatPage() {
  const [messages, setMessages] = useState([]);
  
  return (
    <div>
      <ConversationManager
        type="multi-chat"
        data={{ messages }}
        onLoad={(data) => setMessages(data.messages)}
      />
      {/* Chat interface */}
    </div>
  );
}
```

### `<MobileMenu>`

Responsive mobile navigation menu.

**Props:**

*   `items` (array): Navigation items

**Example:**

```typescript
import { MobileMenu } from "@/components/mobile-menu";

function Navbar() {
  const navItems = [
    { name: "Home", path: "/" },
    { name: "Chat", path: "/chat" }
  ];
  
  return (
    <nav>
      <div className="logo">MultiLLM</div>
      <MobileMenu items={navItems} />
    </nav>
  );
}
```

### `<ResponsiveGrid>`

Grid component with responsive column configuration.

**Props:**

*   `children` (ReactNode): Child components
*   `cols` (object): Column configuration for different breakpoints
*   `gap` (string, optional): Grid gap
*   `className` (string, optional): Additional CSS classes

**Example:**

```typescript
import { ResponsiveGrid } from "@/components/responsive-grid";

function CardGrid({ items }) {
  return (
    <ResponsiveGrid cols={{ default: 1, md: 2, lg: 3 }} gap="gap-6">
      {items.map(item => (
        <Card key={item.id}>{item.content}</Card>
      ))}
    </ResponsiveGrid>
  );
}
```

### `<ApiKeyForm>`

Form for managing API keys.

**Example:**

```typescript
import ApiKeyForm from "@/components/api-key-form";

function SettingsPage() {
  return (
    <div>
      <h1>API Settings</h1>
      <ApiKeyForm />
    </div>
  );
}
```