/**
 * One-Click Setup & Deployment Script for Cloudflare Backend
 * Automatically handles D1 database creation, schema setup, and deployment.
 */
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wranglerTomlPath = path.join(__dirname, 'wrangler.toml');

console.log('\n======================================================');
console.log('⚡ NPTEL Pro Solver - Cloudflare Edge Setup & Deploy ⚡');
console.log('======================================================\n');

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', ...options });
  } catch (err) {
    if (options.ignoreError) return null;
    throw err;
  }
}

// 1. Check Wrangler login
console.log('🔍 Checking Cloudflare credentials...');
const whoami = run('npx wrangler whoami', { ignoreError: true });
if (!whoami || whoami.includes('not logged in')) {
  console.log('\n🔑 Please log in to Cloudflare in the browser window that opens...\n');
  spawnSync('npx', ['wrangler', 'login'], { stdio: 'inherit' });
} else {
  console.log('✓ Cloudflare account connected.');
}

// 2. Create or find D1 Database
console.log('\n📦 Checking Cloudflare D1 database "nptel-vault"...');
let dbId = null;

const d1List = run('npx wrangler d1 list --json', { ignoreError: true });
if (d1List) {
  try {
    const list = JSON.parse(d1List);
    const existing = list.find(db => db.name === 'nptel-vault');
    if (existing) {
      dbId = existing.uuid;
      console.log(`✓ Found existing D1 database: ${existing.name} (${dbId})`);
    }
  } catch (e) {}
}

if (!dbId) {
  console.log('Creating new D1 database: nptel-vault...');
  const createOutput = run('npx wrangler d1 create nptel-vault');
  const match = createOutput.match(/database_id\s*=\s*"([^"]+)"/);
  if (match) {
    dbId = match[1];
    console.log(`✓ Successfully created D1 database with ID: ${dbId}`);
  } else {
    console.log(createOutput);
  }
}

// 3. Update wrangler.toml with database ID
if (dbId) {
  let toml = fs.readFileSync(wranglerTomlPath, 'utf-8');
  toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${dbId}"`);
  fs.writeFileSync(wranglerTomlPath, toml, 'utf-8');
  console.log('✓ Updated wrangler.toml with database ID.');

  // 4. Run database migration schema
  console.log('\n📋 Initializing D1 database tables & seed solutions...');
  try {
    const schemaRes = run('npx wrangler d1 execute nptel-vault --remote --file=./schema.sql -y');
    console.log('✓ Schema and verified questions uploaded to D1 cloud.');
  } catch (err) {
    console.warn('⚠️ Note: Could not execute schema automatically. You can run: npx wrangler d1 execute nptel-vault --remote --file=./schema.sql');
  }
}

// 5. Deploy worker
console.log('\n🚀 Deploying Cloudflare Worker to Global Edge...');
const deployOutput = run('npx wrangler deploy');
console.log(deployOutput);

const urlMatch = deployOutput.match(/https:\/\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.workers\.dev/);
const deployedUrl = urlMatch ? urlMatch[0] : null;

console.log('\n======================================================');
console.log('🎉 DEPLOYMENT COMPLETE! 🎉');
console.log('======================================================');
if (deployedUrl) {
  console.log(`\nYour Cloudflare Edge API URL is:\n👉 ${deployedUrl}\n`);
  console.log('Next Steps:');
  console.log('1. (Optional) Set your server Gemini API key so the backend can solve un-cached questions:');
  console.log('   npx wrangler secret put GEMINI_API_KEY');
  console.log('\n2. Connect to your Chrome Extension:');
  console.log('   - Open the Extension Side Panel');
  console.log('   - Go to Settings & API');
  console.log(`   - Paste "${deployedUrl}" into "Cloudflare Vault Backend URL"`);
  console.log('   - Click "Save Settings"');
} else {
  console.log('\nCheck your wrangler output above for the deployed worker URL.');
}
console.log('======================================================\n');
