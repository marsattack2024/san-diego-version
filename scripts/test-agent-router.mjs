#!/usr/bin/env node

/**
 * Test script for the agent router
 * 
 * Usage:
 *   node scripts/test-agent-router.js "Can you help me create a Google Ads campaign for my photography business?"
 */

import { AgentRouter } from '../lib/agents/agent-router.js';

// Get the message from command line arguments
const message = process.argv[2];

if (!message) {
  console.error('Please provide a message to test');
  console.error('Usage: node scripts/test-agent-router.js "Your message here"');
  process.exit(1);
}

console.log('Testing agent router with message:', message);

// Create an agent router instance
const agentRouter = new AgentRouter();

// Analyze the message
const analysis = agentRouter.analyzeMessage(message);

// Print the results
console.log('\nAgent Scores:');
console.log('-------------');
Object.entries(analysis.scores)
  .sort(([, a], [, b]) => b - a)
  .forEach(([agent, score]) => {
    console.log(`${agent}: ${score}${agent === analysis.recommended ? ' (RECOMMENDED)' : ''}`);
  });

console.log('\nRecommended Agent:', analysis.recommended);

// Test with mock messages
const mockMessages = [
  { role: 'user', content: message }
];

// Route the message
const routedAgent = agentRouter.routeMessage('default', mockMessages);
console.log('\nRouted Agent:', routedAgent);

// Compare results
if (routedAgent !== analysis.recommended) {
  console.warn('\nWARNING: Routed agent does not match recommended agent!');
  console.warn('This may indicate an issue with the agent router.');
} else {
  console.log('\nSuccess: Routed agent matches recommended agent.');
} 