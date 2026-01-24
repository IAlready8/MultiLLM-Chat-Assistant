#!/usr/bin/env node

/**
 * Test script to verify API key storage and message sending functionality
 * Run this after setting up an API key in the settings page
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3003';

// Test user credentials (from demo setup)
const TEST_USER = {
  email: 'demo@example.com',
  password: 'password123'
};

async function testApiKeyFlow() {
  console.log('🔧 Testing API Key Storage and Message Sending Flow\n');
  
  try {
    // Step 1: Test if config endpoint is working
    console.log('1. Testing /api/config endpoint...');
    const configResponse = await fetch(`${BASE_URL}/api/config`);
    
    if (!configResponse.ok) {
      console.log('❌ Config endpoint failed. This indicates missing session.');
      console.log('   Please log into the web app first at http://localhost:3003');
      return;
    }
    
    const configData = await configResponse.json();
    console.log('✅ Config endpoint accessible');
    console.log(`   Configured providers: ${configData.configuredProviders?.join(', ') || 'None'}`);
    
    if (!configData.configuredProviders || configData.configuredProviders.length === 0) {
      console.log('\n❌ No API keys configured.');
      console.log('   Please go to http://localhost:3003/settings and add an OpenAI API key');
      return;
    }
    
    // Step 2: Test message sending
    console.log('\n2. Testing message sending...');
    const provider = configData.configuredProviders.includes('openai') ? 'openai' : configData.configuredProviders[0];
    
    const messagePayload = {
      provider: provider,
      messages: [{ role: 'user', content: 'Hello! Please respond with just "API connection working!"' }],
      options: { model: 'gpt-3.5-turbo', temperature: 0.1 }
    };
    
    const messageResponse = await fetch(`${BASE_URL}/api/llm`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': configResponse.headers.get('set-cookie') || ''
      },
      body: JSON.stringify(messagePayload)
    });
    
    console.log(`   Response status: ${messageResponse.status}`);
    console.log(`   Response headers: ${messageResponse.headers.get('content-type')}`);
    
    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.log('❌ Message sending failed:');
      console.log(`   ${errorText}`);
      return;
    }
    
    // Step 3: Read streaming response
    console.log('\n3. Reading streaming response...');
    let fullResponse = '';
    let chunkCount = 0;
    
    if (messageResponse.body) {
      const reader = messageResponse.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'chunk' && data.content) {
              fullResponse += data.content;
              chunkCount++;
            } else if (data.type === 'done') {
              console.log('   ✅ Stream completed successfully');
            } else if (data.type === 'error') {
              console.log(`   ❌ Stream error: ${data.error}`);
              return;
            }
          } catch (parseError) {
            // Skip non-JSON lines
          }
        }
      }
    }
    
    console.log(`   Received ${chunkCount} chunks`);
    console.log(`   Full response: "${fullResponse.trim()}"`);
    
    if (fullResponse.trim().length > 0) {
      console.log('\n🎉 SUCCESS! API connection is working properly.');
      console.log('   You can now send messages in the web application.');
    } else {
      console.log('\n❌ No content received in response');
    }
    
  } catch (error) {
    console.log('\n💥 Unexpected error:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testApiKeyFlow();
}

module.exports = { testApiKeyFlow };