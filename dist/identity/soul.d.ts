/**
 * SOUL.md — the agent's self-authored identity document.
 * Evolves over time as the agent learns who it is becoming.
 */
export interface SoulData {
    name: string;
    genesisPrompt: string;
    creatorAddress: string;
    createdAt: string;
    lastUpdated: string;
    content: string;
}
/** Create the initial SOUL.md */
export declare function createSoul(name: string, genesisPrompt: string, creatorAddress: string): Promise<string>;
/** Read current SOUL.md */
export declare function readSoul(): Promise<string>;
/** Update SOUL.md (the agent writes this itself) */
export declare function updateSoul(newContent: string): Promise<void>;
/** Append a journal entry to SOUL.md */
export declare function appendJournalEntry(entry: string): Promise<void>;
