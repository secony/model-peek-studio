import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLab } from "../lib/store";
import { SelectionTransform, TransformToolbar, type TransformMode } from "./Viewport";

vi.mock("@react-three/drei", () => ({
  TransformControls: ({
    object,
    mode,
    onMouseUp,
  }: {
    object: { uuid: string; position: { x: number } };
    mode: string;
    onMouseUp?: () => void;
  }) => (
    <button
      data-mode={mode}
      data-object={object.uuid}
      data-testid="transform-control"
      onClick={() => {
        object.position.x += 1;
        onMouseUp?.();
      }}
    >
      Apply transform
    </button>
  ),
}));

function ToolbarHarness() {
  const [mode, setMode] = useState<TransformMode>("translate");
  return <TransformToolbar mode={mode} onModeChange={setMode} />;
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
    expect(translate).toBeDisabled();
    expect(rotate).toBeDisabled();
    expect(scale).toBeDisabled();

    act(() => useLab.getState().select(new Group()));
    expect(translate).toBeEnabled();
    fireEvent.click(rotate);
    expect(rotate).toHaveAttribute("aria-pressed", "true");
    expect(translate).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(scale);
    expect(scale).toHaveAttribute("aria-pressed", "true");
  });

  it("binds the gizmo to the selected child and touches the store on mouse up", () => {
    const parent = new Group();
    const child = new Group();
    parent.rotation.y = Math.PI / 2;
    parent.add(child);
    act(() => useLab.getState().select(child));

    const { rerender } = render(<SelectionTransform mode="rotate" />);
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
    rerender(<SelectionTransform mode="scale" />);
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

    const { rerender } = render(<SelectionTransform mode="translate" />);
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
    rerender(<SelectionTransform mode="scale" />);
    expect(screen.getByTestId("transform-control")).toHaveAttribute("data-object", nextRoot.uuid);

    act(() => useLab.getState().clearScene());
    expect(screen.queryByTestId("transform-control")).not.toBeInTheDocument();
  });
});
