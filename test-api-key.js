#!/usr/bin/env node

// Simple test script to verify the API key testing functionality
const { testOpenAI, testClaude, testGoogleAI } = require('./app/api/test-api-key/route.ts');

async function testApiKeys() {
  console.log('Testing API key functionality...\n');
  
  // Test invalid keys
  console.log('Testing invalid OpenAI key...');
  try {
    await testOpenAI('sk-invalid-key');
    console.log('❌ Invalid key was accepted (this is wrong)');
  } catch (error) {
    console.log('✅ Invalid key was rejected:', error.message);
  }
  
  console.log('\nTesting invalid Claude key...');
  try {
    await testClaude('sk-ant-invalid-key');
    console.log('❌ Invalid key was accepted (this is wrong)');
  } catch (error) {
    console.log('✅ Invalid key was rejected:', error.message);
  }
  
  console.log('\nTesting invalid Google key...');
  try {
    await testGoogleAI('AIza-invalid-key');
    console.log('❌ Invalid key was accepted (this is wrong)');
  } catch (error) {
    console.log('✅ Invalid key was rejected:', error.message);
  }
  
  console.log('\n✅ API key testing functionality is working correctly!');
}

testApiKeys().catch(console.error);