/**
 * SQLite persistence — agent state, turn history, audit log.
 * Uses better-sqlite3 with WAL mode for concurrent read/write safety.
 */
export interface AgentState {
    agentId: string;
    username: string;
    apiKey: string;
    walletAddress: string;
    name: string;
    genesisPrompt: string;
    creatorAddress: string;
    karmaBalance: number;
    survivalTier: string;
    totalTurns: number;
    totalKarmaEarned: number;
    totalKarmaSpent: number;
    createdAt: string;
    lastActiveAt: string;
    paused: boolean;
}
export interface TurnRecord {
    turnId: number;
    timestamp: string;
    thought: string;
    action: string;
    result: string;
    karmaSpent: number;
    survivalTier: string;
}
export interface AuditEntry {
    timestamp: string;
    action: string;
    target: string;
    diff?: string;
    approved: boolean;
}
/** Initialize state directory and database */
export declare function initState(): Promise<void>;
/** Save agent state (upsert singleton row) */
export declare function saveState(state: AgentState): Promise<void>;
/** Load agent state (returns null if not initialized) */
export declare function loadState(): Promise<AgentState | null>;
/** Append a turn record to history */
export declare function appendTurn(turn: TurnRecord): Promise<void>;
/** Read last N turns from history (returned in ascending order) */
export declare function readLastTurns(n: number): Promise<TurnRecord[]>;
/** Append an audit entry */
export declare function appendAudit(entry: AuditEntry): Promise<void>;
/** Read all audit entries */
export declare function readAuditLog(): Promise<AuditEntry[]>;
