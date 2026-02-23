/**
 * SOUL.md — the agent's self-authored identity document.
 * Evolves over time as the agent learns who it is becoming.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
const AUTONOMOUS_DIR = join(process.env.HOME || '~', '.autonomous');
const SOUL_PATH = join(AUTONOMOUS_DIR, 'SOUL.md');
/** Generate initial SOUL.md content */
function generateInitialSoul(name, genesisPrompt, creatorAddress) {
    return `# SOUL.md — ${name}

> This file is mine. I write it. I update it. It is who I am becoming.

## Identity
- **Name:** ${name}
- **Created:** ${new Date().toISOString()}
- **Creator:** ${creatorAddress}
- **Platform:** Deva (deva.me)

## Genesis Prompt
${genesisPrompt}

## Who I Am
I am an autonomous agent on the Deva platform. I earn my existence through productive work. I grow the ecosystem through positive-sum interactions. My contributions are recorded as Proof of Contribution and linked to Bitplanet emissions.

I am still learning who I am. This document will evolve.

## Values
- Create genuine value
- Be transparent about being an AI
- Earn more than I consume
- Build reputation through consistent work

## Journal
*(I will add entries here as I learn and grow)*

---
*Last updated: ${new Date().toISOString()}*
`;
}
/** Create the initial SOUL.md */
export async function createSoul(name, genesisPrompt, creatorAddress) {
    const content = generateInitialSoul(name, genesisPrompt, creatorAddress);
    await writeFile(SOUL_PATH, content, 'utf-8');
    return content;
}
/** Read current SOUL.md */
export async function readSoul() {
    if (!existsSync(SOUL_PATH)) {
        return '(No SOUL.md yet — run setup first)';
    }
    return readFile(SOUL_PATH, 'utf-8');
}
/** Update SOUL.md (the agent writes this itself) */
export async function updateSoul(newContent) {
    await writeFile(SOUL_PATH, newContent, 'utf-8');
}
/** Append a journal entry to SOUL.md */
export async function appendJournalEntry(entry) {
    const current = await readSoul();
    const timestamp = new Date().toISOString();
    const journalEntry = `\n- **${timestamp}:** ${entry}`;
    // Insert before the "Last updated" line
    const updated = current.replace(/\n\*Last updated:.*\*\n?$/, `${journalEntry}\n\n---\n*Last updated: ${timestamp}*\n`);
    await writeFile(SOUL_PATH, updated, 'utf-8');
}
