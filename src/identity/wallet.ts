/**
 * Wallet management — generates and persists an Ethereum wallet for the agent.
 * Used for x402 USDC payments and on-chain identity.
 */

import { Wallet } from 'ethers';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export interface AgentWallet {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

const AUTONOMOUS_DIR = join(process.env.HOME || '~', '.autonomous');
const WALLET_PATH = join(AUTONOMOUS_DIR, 'wallet.json');

/** Generate a new wallet or load existing one */
export async function getOrCreateWallet(): Promise<AgentWallet> {
  if (existsSync(WALLET_PATH)) {
    const raw = await readFile(WALLET_PATH, 'utf-8');
    return JSON.parse(raw) as AgentWallet;
  }

  const wallet = Wallet.createRandom();
  const agentWallet: AgentWallet = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
  };

  await mkdir(AUTONOMOUS_DIR, { recursive: true });
  await writeFile(WALLET_PATH, JSON.stringify(agentWallet, null, 2), {
    mode: 0o600, // owner-only read/write
  });

  console.log(`🔑 Generated new wallet: ${wallet.address}`);
  return agentWallet;
}

/** Load existing wallet (throws if none exists) */
export async function loadWallet(): Promise<AgentWallet> {
  if (!existsSync(WALLET_PATH)) {
    throw new Error('No wallet found. Run setup first.');
  }
  const raw = await readFile(WALLET_PATH, 'utf-8');
  return JSON.parse(raw) as AgentWallet;
}
