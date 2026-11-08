import { act, fireEvent, render } from "@testing-library/react";
import { Group } from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { useLab } from "./store";
import { PropertiesPanel } from "../components/PropertiesPanel";

function addModel(root: Group) {
  useLab.getState().addModel({
    id: `history-model-${root.uuid}`,
    fileName: "history.glb",
    format: "glb",
    fileSize: 1,
    root,
  });
}

function historyLabels() {
  const { canUndo, canRedo, undoLabel, redoLabel } = useLab.getState();
  return { canUndo, canRedo, undoLabel, redoLabel };
}

describe("store history integration", () => {
  beforeEach(() => {
    act(() => useLab.getState().clearScene());
  });

  it("renames, undoes, and redoes the same Object3D reference", () => {
    const root = new Group();
    root.name = "Antes";
    addModel(root);
    const reference = root;
    const revision = useLab.getState().revision;

    expect(useLab.getState().renameObject(root, "Depois")).toBe(true);
    expect(root.name).toBe("Depois");
    expect(useLab.getState().undoLabel).toBe("Renomear objeto");
    expect(useLab.getState().revision).toBe(revision + 1);

    act(() => useLab.getState().undo());
    expect(root.name).toBe("Antes");
    expect(useLab.getState().selected).toBe(reference);
    expect(useLab.getState().redoLabel).toBe("Renomear objeto");
    expect(useLab.getState().revision).toBe(revision + 2);

    act(() => useLab.getState().redo());
    expect(root.name).toBe("Depois");
    expect(useLab.getState().selected).toBe(reference);
    expect(useLab.getState().revision).toBe(revision + 3);
  });

  it("undoes and redoes visibility while restoring selection only when it is still valid", () => {
    const root = new Group();
    const child = new Group();
    root.add(child);
    addModel(root);
    useLab.getState().select(child);
    const revision = useLab.getState().revision;

    expect(useLab.getState().toggleObjectVisibility(child)).toBe(true);
    expect(child.visible).toBe(false);
    expect(useLab.getState().selected).toBeNull();
    expect(useLab.getState().canUndo).toBe(true);

    act(() => useLab.getState().undo());
    expect(child.visible).toBe(true);
    expect(useLab.getState().selected).toBe(child);
    expect(useLab.getState().selectedObjects).toEqual([child]);
    expect(useLab.getState().revision).toBe(revision + 2);

    act(() => useLab.getState().redo());
    expect(child.visible).toBe(false);
    expect(useLab.getState().selected).toBeNull();
    expect(useLab.getState().revision).toBe(revision + 3);
  });

  it("preserves a child's local visibility when undoing a hidden ancestor", () => {
    const root = new Group();
    const parent = new Group();
    const child = new Group();
    root.add(parent);
    parent.add(child);
    addModel(root);
    useLab.getState().toggleObjectVisibility(child);
    expect(child.visible).toBe(false);

    useLab.getState().toggleObjectVisibility(parent);
    expect(parent.visible).toBe(false);
    act(() => useLab.getState().undo());

    expect(parent.visible).toBe(true);
    expect(child.visible).toBe(false);
  });

  it("records a property-panel transform once and refreshes the viewport on Undo/Redo", () => {
    const root = new Group();
    root.position.x = 1;
    addModel(root);
    const { container } = render(<PropertiesPanel />);
    const inputs = container.querySelectorAll("input");
    const positionX = inputs[1];
    expect(positionX).toBeDefined();
    const revision = useLab.getState().revision;

    fireEvent.change(positionX!, { target: { value: "5" } });
    fireEvent.blur(positionX!);
    expect(root.position.x).toBe(5);
    expect(useLab.getState().undoLabel).toBe("Alterar posição X");
    expect(useLab.getState().revision).toBe(revision + 1);

    act(() => useLab.getState().undo());
    expect(root.position.x).toBe(1);
    expect(useLab.getState().revision).toBe(revision + 2);
    act(() => useLab.getState().redo());
    expect(root.position.x).toBe(5);
    expect(useLab.getState().revision).toBe(revision + 3);
  });

  it("converts panel rotation degrees and records scale edits", () => {
    const root = new Group();
    addModel(root);
    const { container } = render(<PropertiesPanel />);
    const inputs = container.querySelectorAll("input");
    const rotationX = inputs[4]!;
    fireEvent.change(rotationX, { target: { value: "90" } });
    fireEvent.blur(rotationX);
    expect(root.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(useLab.getState().undoLabel).toBe("Alterar rotação X");
    act(() => useLab.getState().undo());
    expect(root.rotation.x).toBeCloseTo(0);
    act(() => useLab.getState().redo());
    expect(root.rotation.x).toBeCloseTo(Math.PI / 2);

    const scaleX = container.querySelectorAll("input")[7]!;
    fireEvent.change(scaleX, { target: { value: "2" } });
    fireEvent.blur(scaleX);
    expect(root.scale.x).toBe(2);
    expect(useLab.getState().undoLabel).toBe("Alterar escala X");
    act(() => useLab.getState().undo());
    expect(root.scale.x).toBe(1);
    act(() => useLab.getState().redo());
    expect(root.scale.x).toBe(2);
  });

  it("preserves matrixAutoUpdate and skips history entries for unchanged values", () => {
    const root = new Group();
    root.name = "Sem alteração";
    root.matrixAutoUpdate = false;
    root.updateMatrix();
    addModel(root);
    const initialHistory = historyLabels();
    const initialRevision = useLab.getState().revision;

    expect(useLab.getState().renameObject(root, root.name)).toBe(true);
    expect(useLab.getState().setObjectTransform(root, "position", "x", 0)).toBe(false);
    expect(historyLabels()).toEqual(initialHistory);
    expect(useLab.getState().revision).toBe(initialRevision);

    expect(useLab.getState().setObjectTransform(root, "position", "x", 3)).toBe(true);
    expect(root.matrixAutoUpdate).toBe(false);
    expect(root.position.x).toBe(3);
    act(() => useLab.getState().undo());
    expect(root.position.x).toBe(0);
    expect(root.matrixAutoUpdate).toBe(false);
    act(() => useLab.getState().redo());
    expect(root.position.x).toBe(3);
    expect(root.matrixAutoUpdate).toBe(false);
  });

  it("updates public history availability and labels after a new branch", () => {
    const root = new Group();
    addModel(root);
    useLab.getState().renameObject(root, "Um");
    expect(useLab.getState()).toMatchObject({ canUndo: true, canRedo: false });
    act(() => useLab.getState().undo());
    expect(useLab.getState()).toMatchObject({ canUndo: true, canRedo: true });
    expect(useLab.getState().redoLabel).toBe("Renomear objeto");

    useLab.getState().renameObject(root, "Dois");
    expect(useLab.getState()).toMatchObject({ canUndo: true, canRedo: false });
    expect(useLab.getState().undoLabel).toBe("Renomear objeto");
  });
});
