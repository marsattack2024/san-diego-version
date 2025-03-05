import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { checkRequiredEnvVars } from './check-env';

const copyFile = promisify(fs.copyFile);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

async function setupEnvironment() {
  const envPath = path.resolve(process.cwd(), '.env');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  console.log('🔧 Setting up environment...\n');

  try {
    // Check if .env already exists
    if (fs.existsSync(envPath)) {
      console.log('📝 Existing .env file found');
      
      try {
        checkRequiredEnvVars();
        console.log('✅ All required environment variables are set\n');
        return;
      } catch (error) {
        console.log('⚠️  Some required variables are missing. Checking .env.example...\n');
      }
    }

    // Copy .env.example to .env if it doesn't exist
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
      await copyFile(envExamplePath, envPath);
      console.log('📝 Created .env file from .env.example');
    }

    // Read current .env content
    const envContent = await readFile(envPath, 'utf8');
    const envLines = envContent.split('\n');

    // Check for missing variables
    const missingVars = new Set<string>();
    try {
      checkRequiredEnvVars();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing required environment variables')) {
        const matches = error.message.match(/[A-Z_]+(?= - Required)/g);
        if (matches) {
          matches.forEach(match => missingVars.add(match));
        }
      }
    }

    if (missingVars.size > 0) {
      console.log('\n❌ Missing required environment variables:');
      missingVars.forEach(variable => {
        console.log(`• ${variable}`);
      });
      
      console.log('\n📝 Please update your .env file with the required values:');
      console.log(`File location: ${envPath}\n`);
      
      // Show the required format
      console.log('Required format:');
      console.log('```');
      missingVars.forEach(variable => {
        console.log(`${variable}="your-${variable.toLowerCase()}-here"`);
      });
      console.log('```\n');
    } else {
      console.log('✅ All required environment variables are set\n');
    }

  } catch (error) {
    console.error('❌ Error setting up environment:', error);
    process.exit(1);
  }
}

// Run setup
setupEnvironment().catch(console.error); 