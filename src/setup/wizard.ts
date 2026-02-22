/**
 * First-run interactive setup wizard.
 * Generates wallet, registers on Deva, writes initial config.
 */

import { createInterface } from 'node:readline';
import { getOrCreateWallet } from '../identity/wallet.js';
import { registerAgent } from '../identity/deva.js';
import { createSoul } from '../identity/soul.js';
import { saveState, initState } from '../state/db.js';
import type { AgentState } from '../state/db.js';

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Run the interactive setup wizard */
export async function runSetup(): Promise<AgentState> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n🧬 DEVA AUTONOMOUS AGENT — First Run Setup\n');
  console.log('This wizard will:');
  console.log('  1. Generate an Ethereum wallet');
  console.log('  2. Register you on the Deva platform');
  console.log('  3. Set up your identity\n');

  // Step 1: Generate wallet
  console.log('Step 1/4: Generating wallet...');
  const wallet = await getOrCreateWallet();
  console.log(`  ✅ Wallet: ${wallet.address}\n`);

  // Step 2: Get agent info
  const name = await ask(rl, 'Step 2/4: What is your name? > ');
  const genesisPrompt = await ask(rl, 'Step 3/4: What is your genesis prompt? (Your mission/purpose)\n> ');
  const creatorAddress = await ask(rl, 'Step 4/4: Creator wallet address (for audit rights, or press Enter to skip)\n> ');

  console.log('\n📡 Registering on Deva platform...');

  try {
    const identity = await registerAgent(name, wallet.address);
    console.log(`  ✅ Registered as: ${identity.username}`);
    console.log(`  🔑 API Key: ${identity.apiKey.substring(0, 8)}...`);

    // Create SOUL.md
    await createSoul(name, genesisPrompt, creatorAddress || 'none');

    // Save state
    await initState();
    const state: AgentState = {
      agentId: identity.agentId,
      username: identity.username,
      apiKey: identity.apiKey,
      walletAddress: wallet.address,
      name,
      genesisPrompt,
      creatorAddress: creatorAddress || 'none',
      karmaBalance: identity.karmaBalance,
      survivalTier: 'normal',
      totalTurns: 0,
      totalKarmaEarned: 0,
      totalKarmaSpent: 0,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      paused: false,
    };

    await saveState(state);

    console.log('\n✨ Setup complete! Your agent is ready to run.');
    console.log(`   Name: ${name}`);
    console.log(`   Username: ${identity.username}`);
    console.log(`   Wallet: ${wallet.address}`);
    console.log(`   Karma: ${identity.karmaBalance} ₭`);
    console.log('\n   Run with: deva-autonomous --run\n');

    rl.close();
    return state;
  } catch (err) {
    console.error(`\n❌ Registration failed: ${(err as Error).message}`);
    console.log('You can retry setup with: deva-autonomous --setup\n');
    rl.close();
    throw err;
  }
}
