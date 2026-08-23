import type { BennyWorkflowKind, Ledger, SourceCoordinates } from "./types.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

function ledgerFile(root: string, key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return join(root, `${digest}.json`);
}

export class FileBennyLedger implements Ledger {
  private readonly root: string;

  public constructor(root: string) {
    if (!root.trim()) throw new Error("an explicit Benny ledger directory is required");
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
  }

  public claim(key: string): boolean {
    const path = ledgerFile(this.root, key);
    try {
      writeFileSync(path, `${JSON.stringify({ key, status: "claimed" })}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }

  public complete(key: string): void {
    const path = ledgerFile(this.root, key);
    if (!existsSync(path)) throw new Error("cannot complete an unclaimed Benny ledger key");
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ key, status: "completed" })}\n`, "utf8");
    renameSync(temporary, path);
  }

  public release(key: string): void {
    try {
      unlinkSync(ledgerFile(this.root, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  public has(key: string): boolean {
    return existsSync(ledgerFile(this.root, key));
  }
}

export function createBennyLedger(): InMemoryBennyLedger {
  return new InMemoryBennyLedger();
}

export function createFileBennyLedger(root: string): FileBennyLedger {
  return new FileBennyLedger(root);
}

export const createIdempotencyKey = ledgerKey;
