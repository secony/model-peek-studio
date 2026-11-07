import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLab } from "../lib/store";
import { SelectionTransform, TransformToolbar, type TransformMode } from "./Viewport";

vi.mock("@react-three/drei", () => ({
  TransformControls: ({
    object,
    mode,
    onMouseDown,
    onMouseUp,
  }: {
    object: { uuid: string; position: { x: number } };
    mode: string;
    onMouseDown?: () => void;
    onMouseUp?: () => void;
  }) => (
    <button
      data-mode={mode}
      data-object={object.uuid}
      data-testid="transform-control"
      onClick={() => {
        onMouseDown?.();
        object.position.x += 1;
        onMouseUp?.();
      }}
    >
      Apply transform
    </button>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function ToolbarHarness() {
  const [mode, setMode] = useState<TransformMode>("translate");
  const [freeMoveEnabled, setFreeMoveEnabled] = useState(false);
  return (
    <TransformToolbar
      mode={mode}
      onModeChange={setMode}
      freeMoveEnabled={freeMoveEnabled}
      onToggleFreeMove={() => setFreeMoveEnabled((enabled) => !enabled)}
    />
  );
}

function TransformHarness({ mode }: { mode: TransformMode }) {
  const transformDraggingRef = useRef(false);
  return <SelectionTransform mode={mode} transformDraggingRef={transformDraggingRef} />;
}

describe("viewport transform tools", () => {
  beforeEach(() => {
    act(() => {
      useLab.getState().clearScene();
    });
  });

  it("shows disabled tools without a selection and activates the chosen mode", () => {
    render(<ToolbarHarness />);

    const translate = screen.getByRole("button", { name: "Mover" });
    const rotate = screen.getByRole("button", { name: "Rotacionar" });
    const scale = screen.getByRole("button", { name: "Escalar" });
    const freeMove = screen.getByRole("button", { name: "Movimentação livre" });
    expect(translate).toBeDisabled();
    expect(rotate).toBeDisabled();
    expect(scale).toBeDisabled();
    expect(freeMove).toBeDisabled();

    act(() => useLab.getState().select(new Group()));
    expect(translate).toBeEnabled();
    fireEvent.click(rotate);
    expect(rotate).toHaveAttribute("aria-pressed", "true");
    expect(translate).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(scale);
    expect(scale).toHaveAttribute("aria-pressed", "true");

    const parent = new Group();
    const selected = new Group();
    parent.add(selected);
    act(() => useLab.getState().select(selected));
    const duplicate = screen.getByRole("button", { name: "Duplicar objeto selecionado" });
    expect(duplicate).toBeEnabled();
    fireEvent.click(duplicate);
    expect(parent.children).toHaveLength(2);
    expect(useLab.getState().selected).toBe(parent.children[1]);
    expect(freeMove).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(freeMove);
    expect(freeMove).toHaveAttribute("aria-pressed", "true");
  });

  it("binds the gizmo to the selected child and touches the store on mouse up", () => {
    const parent = new Group();
    const child = new Group();
    parent.rotation.y = Math.PI / 2;
    parent.add(child);
    act(() => useLab.getState().select(child));

    const { rerender } = render(<TransformHarness mode="rotate" />);
    const control = screen.getByTestId("transform-control");
    expect(control).toHaveAttribute("data-object", child.uuid);
    expect(control).toHaveAttribute("data-mode", "rotate");

    const revision = useLab.getState().revision;
    fireEvent.click(control);
    expect(child.position.x).toBe(1);
    expect(parent.position.x).toBe(0);
    expect(useLab.getState().revision).toBe(revision + 1);

    const nextSelection = new Group();
    act(() => useLab.getState().select(nextSelection));
    rerender(<TransformHarness mode="scale" />);
    expect(screen.getByTestId("transform-control")).toHaveAttribute(
      "data-object",
      nextSelection.uuid,
    );
    expect(screen.getByTestId("transform-control")).toHaveAttribute("data-mode", "scale");

    act(() => useLab.getState().select(null));
    expect(screen.queryByTestId("transform-control")).not.toBeInTheDocument();
  });

  it("hides the gizmo when the selected model is removed or the scene is cleared", () => {
    const root = new Group();
    const child = new Group();
    root.add(child);
    act(() => {
      useLab.getState().addModel({
        id: "selected-model",
        fileName: "selected.glb",
        format: "glb",
        fileSize: 1,
        root,
      });
      useLab.getState().select(child);
    });

    const { rerender } = render(<TransformHarness mode="translate" />);
    expect(screen.getByTestId("transform-control")).toHaveAttribute("data-object", child.uuid);

    act(() => useLab.getState().removeModel("selected-model"));
    expect(screen.queryByTestId("transform-control")).not.toBeInTheDocument();

    const nextRoot = new Group();
    act(() =>
      useLab.getState().addModel({
        id: "next-model",
        fileName: "next.glb",
        format: "glb",
        fileSize: 1,
        root: nextRoot,
      }),
    );
    rerender(<TransformHarness mode="scale" />);
    expect(screen.getByTestId("transform-control")).toHaveAttribute("data-object", nextRoot.uuid);

    act(() => useLab.getState().clearScene());
    expect(screen.queryByTestId("transform-control")).not.toBeInTheDocument();
  });

  it("attaches TransformControls to a newly duplicated selected object", () => {
    const root = new Group();
    const child = new Group();
    root.add(child);
    act(() => {
      useLab.getState().addModel({
        id: "duplicate-transform-model",
        fileName: "model.glb",
        format: "glb",
        fileSize: 1,
        root,
      });
      useLab.getState().select(child);
    });

    const copy = useLab.getState().duplicateSelected()!;
    const { getByTestId } = render(<TransformHarness mode="translate" />);
    const gizmo = getByTestId("transform-control");
    expect(gizmo).toHaveAttribute("data-object", copy.uuid);

    const revision = useLab.getState().revision;
    fireEvent.click(gizmo);
    expect(copy.position.x).toBe(1.25);
    expect(useLab.getState().revision).toBe(revision + 1);
  });
});
