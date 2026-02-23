/**
 * Wallet management — generates and persists an Ethereum wallet for the agent.
 * Used for x402 USDC payments and on-chain identity.
 */
export interface AgentWallet {
    address: string;
    privateKey: string;
    mnemonic?: string;
}
/** Generate a new wallet or load existing one */
export declare function getOrCreateWallet(): Promise<AgentWallet>;
/** Load existing wallet (throws if none exists) */
export declare function loadWallet(): Promise<AgentWallet>;
