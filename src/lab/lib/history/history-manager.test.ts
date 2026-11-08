import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryManager, HistoryReentrancyError } from "./history-manager";
import type { HistoryCommand } from "./types";

function createCommand(
  label: string,
  apply: () => void = () => {},
  revert: () => void = () => {},
  options: { estimatedBytes?: number; dispose?: () => void } = {},
): HistoryCommand {
  return {
    label,
    ...(options.estimatedBytes === undefined ? {} : { estimatedBytes: options.estimatedBytes }),
    redo: apply,
    undo: revert,
    dispose: options.dispose ?? (() => {}),
  };
}

describe("HistoryManager", () => {
  let manager: HistoryManager;

  beforeEach(() => {
    manager = new HistoryManager();
  });

  it("executes, undoes, and redoes one command", () => {
    let value = 0;
    const command = createCommand(
      "Incrementar",
      () => value++,
      () => value--,
    );

    manager.execute(command);
    expect(value).toBe(1);
    expect(manager.state).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: "Incrementar",
      redoLabel: null,
      entryCount: 1,
      cursor: 1,
    });

    expect(manager.undo()).toBe(true);
    expect(value).toBe(0);
    expect(manager.state).toMatchObject({
      canUndo: false,
      canRedo: true,
      redoLabel: "Incrementar",
    });

    expect(manager.redo()).toBe(true);
    expect(value).toBe(1);
    expect(manager.state).toMatchObject({ canUndo: true, canRedo: false, cursor: 1 });
  });

  it("tracks the cursor and labels across multiple commands", () => {
    let value = 0;
    const add = (label: string, amount: number) =>
      createCommand(
        label,
        () => (value += amount),
        () => (value -= amount),
      );
    manager.execute(add("Adicionar um", 1));
    manager.execute(add("Adicionar dois", 2));
    manager.execute(add("Adicionar três", 3));
    expect(value).toBe(6);

    manager.undo();
    manager.undo();
    expect(value).toBe(1);
    expect(manager.state).toMatchObject({
      canUndo: true,
      canRedo: true,
      undoLabel: "Adicionar um",
      redoLabel: "Adicionar dois",
      entryCount: 3,
      cursor: 1,
    });

    manager.redo();
    manager.redo();
    expect(value).toBe(6);
  });

  it("discards and disposes the redo branch after executing a new command", () => {
    let value = 0;
    const disposeFuture = vi.fn();
    manager.execute(
      createCommand(
        "A",
        () => value++,
        () => value--,
      ),
    );
    manager.execute(
      createCommand(
        "B",
        () => value++,
        () => value--,
        { dispose: disposeFuture },
      ),
    );
    manager.undo();

    manager.execute(
      createCommand(
        "C",
        () => (value += 10),
        () => (value -= 10),
      ),
    );

    expect(value).toBe(11);
    expect(manager.state).toMatchObject({ entryCount: 2, cursor: 2, canRedo: false });
    expect(disposeFuture).toHaveBeenCalledOnce();
  });

  it("does not register a command whose initial redo throws", () => {
    const error = new Error("execute failed");
    const command = createCommand("Falha", () => {
      throw error;
    });

    expect(() => manager.execute(command)).toThrow(error);
    expect(manager.state).toMatchObject({
      entryCount: 0,
      cursor: 0,
      canUndo: false,
      canRedo: false,
    });
  });

  it("preserves the redo branch when a new command fails during initial execution", () => {
    let value = 0;
    const disposeFuture = vi.fn();
    manager.execute(
      createCommand(
        "A",
        () => value++,
        () => value--,
      ),
    );
    manager.execute(
      createCommand(
        "B",
        () => value++,
        () => value--,
        { dispose: disposeFuture },
      ),
    );
    manager.undo();
    const failed = createCommand("Falha", () => {
      throw new Error("execute failed");
    });

    expect(() => manager.execute(failed)).toThrow("execute failed");
    expect(manager.state).toMatchObject({ entryCount: 2, cursor: 1, redoLabel: "B" });
    expect(disposeFuture).not.toHaveBeenCalled();
  });

  it("leaves the cursor unchanged when undo throws", () => {
    let value = 0;
    const command = createCommand(
      "Undo inválido",
      () => value++,
      () => {
        throw new Error("undo failed");
      },
    );
    manager.execute(command);

    expect(() => manager.undo()).toThrow("undo failed");
    expect(value).toBe(1);
    expect(manager.state).toMatchObject({ cursor: 1, canUndo: true, canRedo: false });
  });

  it("leaves the cursor unchanged when redo throws", () => {
    let failRedo = false;
    let value = 0;
    const command = createCommand(
      "Redo inválido",
      () => {
        if (failRedo) throw new Error("redo failed");
        value++;
      },
      () => value--,
    );
    manager.execute(command);
    manager.undo();
    failRedo = true;

    expect(() => manager.redo()).toThrow("redo failed");
    expect(value).toBe(0);
    expect(manager.state).toMatchObject({ cursor: 0, canUndo: false, canRedo: true });
  });

  it("evicts the oldest entries when the entry limit is exceeded", () => {
    let value = 0;
    const disposeFirst = vi.fn();
    manager = new HistoryManager({ maxEntries: 2 });
    manager.execute(
      createCommand(
        "A",
        () => value++,
        () => value--,
        { dispose: disposeFirst },
      ),
    );
    manager.execute(
      createCommand(
        "B",
        () => value++,
        () => value--,
      ),
    );
    manager.execute(
      createCommand(
        "C",
        () => value++,
        () => value--,
      ),
    );

    expect(value).toBe(3);
    expect(manager.state).toMatchObject({ entryCount: 2, cursor: 2, undoLabel: "C" });
    expect(disposeFirst).toHaveBeenCalledOnce();
    manager.undo();
    manager.undo();
    expect(value).toBe(1);
    expect(manager.canUndo).toBe(false);
  });

  it("evicts oldest entries when the estimated-memory limit is exceeded", () => {
    const disposeFirst = vi.fn();
    manager = new HistoryManager({ maxEstimatedBytes: 10 });
    manager.execute(
      createCommand(
        "Primeiro",
        () => {},
        () => {},
        { estimatedBytes: 7, dispose: disposeFirst },
      ),
    );
    manager.execute(
      createCommand(
        "Segundo",
        () => {},
        () => {},
        { estimatedBytes: 6 },
      ),
    );

    expect(manager.state).toMatchObject({ entryCount: 1, estimatedBytes: 6, undoLabel: "Segundo" });
    expect(disposeFirst).toHaveBeenCalledOnce();
  });

  it("treats missing estimates as zero while exposing incomplete accounting", () => {
    manager.execute(createCommand("Sem estimativa"));

    expect(manager.state).toMatchObject({
      estimatedBytes: 0,
      unestimatedEntryCount: 1,
      entryCount: 1,
    });
  });

  it("disposes each discarded command once and clears all public history state", () => {
    const disposeFirst = vi.fn();
    const disposeSecond = vi.fn();
    manager.execute(
      createCommand(
        "A",
        () => {},
        () => {},
        { dispose: disposeFirst },
      ),
    );
    manager.execute(
      createCommand(
        "B",
        () => {},
        () => {},
        { estimatedBytes: 123, dispose: disposeSecond },
      ),
    );
    manager.undo();

    manager.clear();
    manager.clear();

    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(disposeSecond).toHaveBeenCalledOnce();
    expect(manager.state).toMatchObject({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      entryCount: 0,
      cursor: 0,
      estimatedBytes: 0,
      unestimatedEntryCount: 0,
    });
  });

  it("does not allow the same command instance to be registered twice", () => {
    const redo = vi.fn();
    const command = createCommand("Único", redo);
    manager.execute(command);

    expect(() => manager.execute(command)).toThrow("already been registered");
    expect(redo).toHaveBeenCalledOnce();
    expect(manager.entryCount).toBe(1);
  });

  it("does not allow reentrant history operations", () => {
    const command = createCommand("Reentrante", () => manager.undo());

    expect(() => manager.execute(command)).toThrow(HistoryReentrancyError);
    expect(manager.state).toMatchObject({ entryCount: 0, cursor: 0, isBusy: false });
  });

  it("keeps its stacks consistent when cleanup throws", () => {
    manager = new HistoryManager({ maxEntries: 0 });
    const command = createCommand(
      "Descartado",
      () => {},
      () => {},
      {
        dispose: () => {
          throw new Error("dispose failed");
        },
      },
    );

    expect(() => manager.execute(command)).toThrow(AggregateError);
    expect(manager.state).toMatchObject({
      entryCount: 0,
      cursor: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(() => manager.execute(command)).toThrow("already been registered");
  });

  it("rejects invalid limits and invalid memory estimates", () => {
    expect(() => new HistoryManager({ maxEntries: 1.5 })).toThrow(RangeError);
    expect(() => new HistoryManager({ maxEstimatedBytes: -1 })).toThrow(RangeError);
    const invalidEstimate = createCommand(
      "Estimativa inválida",
      () => {},
      () => {},
      {
        estimatedBytes: Number.NaN,
      },
    );

    expect(() => manager.execute(invalidEstimate)).toThrow(RangeError);
    expect(manager.entryCount).toBe(0);
  });
});
