import type { HistoryCommand, HistoryManagerOptions, HistoryState } from "./types";

export const DEFAULT_MAX_HISTORY_ENTRIES = 100;
export const DEFAULT_MAX_HISTORY_BYTES = 256 * 1024 * 1024;

interface HistoryEntry {
  readonly command: HistoryCommand;
  readonly estimatedBytes: number;
  readonly hasEstimate: boolean;
}

export class HistoryReentrancyError extends Error {
  constructor() {
    super("History operations cannot be called reentrantly.");
    this.name = "HistoryReentrancyError";
  }
}

/**
 * Synchronous command history with a cursor and bounded retention.
 * Commands must be atomic because the manager cannot infer how to roll back a
 * partially completed command that throws.
 */
export class HistoryManager {
  private readonly entries: HistoryEntry[] = [];
  private readonly registeredCommands = new WeakSet<HistoryCommand>();
  private readonly disposedCommands = new WeakSet<HistoryCommand>();
  private readonly maxEntries: number;
  private readonly maxEstimatedBytes: number;
  private cursor = 0;
  private estimatedBytes = 0;
  private unestimatedEntryCount = 0;
  private busy = false;

  constructor(options: HistoryManagerOptions = {}) {
    this.maxEntries = validateLimit(
      options.maxEntries ?? DEFAULT_MAX_HISTORY_ENTRIES,
      "maxEntries",
      true,
    );
    this.maxEstimatedBytes = validateLimit(
      options.maxEstimatedBytes ?? DEFAULT_MAX_HISTORY_BYTES,
      "maxEstimatedBytes",
      false,
    );
  }

  get canUndo() {
    return this.cursor > 0;
  }

  get canRedo() {
    return this.cursor < this.entries.length;
  }

  get undoLabel() {
    return this.canUndo ? (this.entries[this.cursor - 1]?.command.label ?? null) : null;
  }

  get redoLabel() {
    return this.canRedo ? (this.entries[this.cursor]?.command.label ?? null) : null;
  }

  get entryCount() {
    return this.entries.length;
  }

  get state(): HistoryState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel,
      entryCount: this.entryCount,
      cursor: this.cursor,
      estimatedBytes: this.estimatedBytes,
      unestimatedEntryCount: this.unestimatedEntryCount,
      isBusy: this.busy,
    };
  }

  /** Executes first; only a successful command can change history. */
  execute(command: HistoryCommand): void {
    this.withOperation(() => {
      assertCommand(command);
      if (this.registeredCommands.has(command)) {
        throw new Error("This command has already been registered with this history.");
      }
      if (this.disposedCommands.has(command)) {
        throw new Error("A disposed command cannot be registered again.");
      }

      const rawEstimate = command.estimatedBytes;
      if (rawEstimate !== undefined && (!Number.isFinite(rawEstimate) || rawEstimate < 0)) {
        throw new RangeError("estimatedBytes must be a finite, non-negative number.");
      }
      const entry: HistoryEntry = {
        command,
        estimatedBytes: rawEstimate ?? 0,
        hasEstimate: rawEstimate !== undefined,
      };

      command.redo();
      this.registeredCommands.add(command);

      const cleanupErrors = this.discardFuture();
      this.entries.push(entry);
      this.cursor = this.entries.length;
      this.addEntryAccounting(entry);
      cleanupErrors.push(...this.enforceLimits());
      throwCleanupErrors(cleanupErrors);
    });
  }

  undo(): boolean {
    return this.withOperation(() => {
      if (!this.canUndo) return false;
      const entry = this.entries[this.cursor - 1];
      if (!entry) return false;

      entry.command.undo();
      this.cursor -= 1;
      return true;
    });
  }

  redo(): boolean {
    return this.withOperation(() => {
      if (!this.canRedo) return false;
      const entry = this.entries[this.cursor];
      if (!entry) return false;

      entry.command.redo();
      this.cursor += 1;
      return true;
    });
  }

  /** Forgets all commands without changing the state they produced. */
  clear(): void {
    this.withOperation(() => {
      const discarded = this.entries.splice(0);
      this.cursor = 0;
      this.estimatedBytes = 0;
      this.unestimatedEntryCount = 0;
      throwCleanupErrors(this.disposeEntries(discarded));
    });
  }

  private withOperation<T>(operation: () => T): T {
    if (this.busy) throw new HistoryReentrancyError();
    this.busy = true;
    try {
      return operation();
    } finally {
      this.busy = false;
    }
  }

  private discardFuture() {
    const discarded = this.entries.splice(this.cursor);
    discarded.forEach((entry) => this.removeEntryAccounting(entry));
    return this.disposeEntries(discarded);
  }

  private enforceLimits() {
    const discarded: HistoryEntry[] = [];
    while (this.entries.length > this.maxEntries || this.estimatedBytes > this.maxEstimatedBytes) {
      const oldest = this.entries.shift();
      if (!oldest) break;
      discarded.push(oldest);
      this.removeEntryAccounting(oldest);
      this.cursor = Math.max(0, this.cursor - 1);
    }
    return this.disposeEntries(discarded);
  }

  private addEntryAccounting(entry: HistoryEntry) {
    this.estimatedBytes += entry.estimatedBytes;
    if (!entry.hasEstimate) this.unestimatedEntryCount += 1;
  }

  private removeEntryAccounting(entry: HistoryEntry) {
    this.estimatedBytes -= entry.estimatedBytes;
    if (!entry.hasEstimate) this.unestimatedEntryCount -= 1;
  }

  private disposeEntries(entries: readonly HistoryEntry[]) {
    const errors: unknown[] = [];
    for (const { command } of entries) {
      if (this.disposedCommands.has(command)) continue;
      this.disposedCommands.add(command);
      try {
        command.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}

function validateLimit(value: number, name: string, integer: boolean) {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new RangeError(
      `${name} must be a finite, non-negative${integer ? " integer" : " number"}.`,
    );
  }
  return value;
}

function assertCommand(command: HistoryCommand): void {
  if (
    !command ||
    typeof command !== "object" ||
    typeof command.label !== "string" ||
    typeof command.redo !== "function" ||
    typeof command.undo !== "function" ||
    typeof command.dispose !== "function"
  ) {
    throw new TypeError("A history command must provide a label, redo(), undo(), and dispose().");
  }
}

function throwCleanupErrors(errors: unknown[]) {
  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more discarded history commands failed to dispose.");
  }
}
