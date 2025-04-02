#!/usr/bin/env node

/**
 * Vercel Deployment Verification
 * 
 * This script performs a series of checks against a deployed Vercel
 * instance to verify that all critical services and API endpoints
 * are functioning correctly.
 * 
 * Usage:
 *   node scripts/verify-deployment.js [--url https://your-app-url.vercel.app]
 */

import fetch from 'node-fetch';
import { createInterface } from 'readline';

// Parse arguments
const args = process.argv.slice(2);
let targetUrl = '';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
        targetUrl = args[i + 1];
        break;
    }
}

// Endpoints to test
const ENDPOINTS = {
    // Public endpoints
    PUBLIC: [
        { path: '/', method: 'GET', name: 'Home Page' },
        { path: '/api/ping', method: 'GET', name: 'API Ping', expectStatus: 200 },
        { path: '/api/widget-chat', method: 'OPTIONS', name: 'Widget CORS', expectStatus: 204 },
        { path: '/widget/chat-widget.js', method: 'GET', name: 'Widget Script', expectStatus: 200 },
    ],
    // Authentication related endpoints
    AUTH: [
        { path: '/login', method: 'GET', name: 'Login Page', expectStatus: 200 },
        { path: '/auth/callback', method: 'GET', name: 'Auth Callback', expectQuery: '?error=unknown', expectStatus: 302 },
    ],
    // Protected endpoints that require authentication
    PROTECTED: [
        { path: '/api/chat', method: 'POST', name: 'Chat API', expectStatus: 401 },
        { path: '/dashboard', method: 'GET', name: 'Dashboard Page', expectStatus: 302 },
    ]
};

async function main() {
    console.log('🔍 Vercel Deployment Verification');

    // If URL wasn't provided in arguments, prompt for it
    if (!targetUrl) {
        targetUrl = await promptUser('Enter the deployed URL to test (e.g., https://your-app.vercel.app): ');
    }

    // Normalize URL (remove trailing slash)
    targetUrl = targetUrl.replace(/\/$/, '');

    console.log(`\n🌐 Testing deployed application at: ${targetUrl}\n`);

    // Test public endpoints first
    console.log('📝 Testing public endpoints:');
    await testEndpoints(ENDPOINTS.PUBLIC);

    // Test authentication endpoints
    console.log('\n🔒 Testing authentication endpoints:');
    await testEndpoints(ENDPOINTS.AUTH);

    // Test protected endpoints (these should fail with auth errors)
    console.log('\n🛡️ Testing protected endpoints (expecting auth errors):');
    await testEndpoints(ENDPOINTS.PROTECTED);

    // Test CORS headers for the widget
    console.log('\n🔄 Testing CORS configuration:');
    await testCorsHeaders();

    console.log('\n✅ Deployment verification completed');
}

async function testEndpoints(endpoints) {
    for (const endpoint of endpoints) {
        process.stdout.write(`   ${endpoint.name.padEnd(25)}... `);

        try {
            const url = `${targetUrl}${endpoint.path}${endpoint.expectQuery || ''}`;
            const response = await fetch(url, {
                method: endpoint.method,
                redirect: 'manual'
            });

            const status = response.status;
            const success = !endpoint.expectStatus || status === endpoint.expectStatus;

            if (success) {
                console.log(`✅ ${status}`);
            } else {
                console.log(`❌ Expected ${endpoint.expectStatus}, got ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
}

async function testCorsHeaders() {
    process.stdout.write('   Widget API CORS Headers   ... ');

    try {
        const response = await fetch(`${targetUrl}/api/widget-chat`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://example.com',
                'Access-Control-Request-Method': 'POST'
            }
        });

        const corsHeader = response.headers.get('access-control-allow-origin');

        if (corsHeader) {
            console.log(`✅ Headers present: ${corsHeader}`);
        } else {
            console.log('❌ Missing CORS headers');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

async function promptUser(question) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
}); 