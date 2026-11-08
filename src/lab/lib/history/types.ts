/** A synchronous, reversible operation owned by a HistoryManager. */
export interface HistoryCommand {
  /** Human-readable description shown for Undo/Redo. */
  readonly label: string;
  /** Approximate bytes retained by this command; omitted values are treated as zero. */
  readonly estimatedBytes?: number;
  /** Must complete atomically or restore its prior state before throwing. */
  undo(): void;
  /** Applies initially and after Undo; must be atomic or restore state before throwing. */
  redo(): void;
  /** Releases resources retained by this command after it leaves the history permanently. */
  dispose(): void;
}

/** Read-only state suitable for exposing through a UI store. */
export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly entryCount: number;
  /** Number of successfully executed commands represented by the cursor. */
  readonly cursor: number;
  /** Sum of the estimates supplied by commands currently retained in history. */
  readonly estimatedBytes: number;
  /** Entries omitted from this sum because they supplied no estimate. */
  readonly unestimatedEntryCount: number;
  readonly isBusy: boolean;
}

export interface HistoryManagerOptions {
  readonly maxEntries?: number;
  readonly maxEstimatedBytes?: number;
}
