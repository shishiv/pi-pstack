import type { BennyWorkflowKind, Ledger, SourceCoordinates } from "./types.js";

export function ledgerKey(coordinates: SourceCoordinates, workflow: BennyWorkflowKind): string {
  return `${workflow}:${coordinates.channelId}:${coordinates.threadTs}`;
}

export class InMemoryBennyLedger implements Ledger {
  private readonly entries = new Set<string>();
  claim(key: string): boolean {
    if (this.entries.has(key)) return false;
    this.entries.add(key);
    return true;
  }
  complete(_key: string): void {
    /* claims are durable for the process */
  }
  release(key: string): void {
    this.entries.delete(key);
  }
  has(key: string): boolean {
    return this.entries.has(key);
  }
}

export function createBennyLedger(): InMemoryBennyLedger {
  return new InMemoryBennyLedger();
}

export const createIdempotencyKey = ledgerKey;
