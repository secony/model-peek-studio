import { act, fireEvent, render, screen } from "@testing-library/react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLab } from "../lib/store";
import { ObjectTree } from "./ObjectTree";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setupTree() {
  const root = new Group();
  const first = new Group();
  first.name = "Primeiro";
  const second = new Group();
  second.name = "Segundo";
  root.add(first, second);
  act(() => {
    useLab.getState().addModel({
      id: "tree-group-test",
      fileName: "tree.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
  });
  return { root, first, second };
}

describe("ObjectTree organization tools", () => {
  beforeEach(() => {
    act(() => useLab.getState().clearScene());
  });

  it("supports modifier-based multi-selection while plain click replaces it", () => {
    const { first, second } = setupTree();
    render(<ObjectTree />);
    const firstRow = screen.getByText("Primeiro");
    const secondRow = screen.getByText("Segundo");

    fireEvent.click(firstRow);
    fireEvent.click(secondRow, { ctrlKey: true });
    expect(useLab.getState().selected).toBe(second);
    expect(useLab.getState().selectedObjects).toEqual([first, second]);
    expect(firstRow.parentElement).toHaveAttribute("aria-selected", "true");
    expect(secondRow.parentElement).toHaveAttribute("aria-selected", "true");

    fireEvent.click(firstRow);
    expect(useLab.getState().selected).toBe(first);
    expect(useLab.getState().selectedObjects).toEqual([first]);
  });

  it("toggles visibility from an object's eye control without removing its tree row", () => {
    const { first } = setupTree();
    render(<ObjectTree />);

    fireEvent.click(screen.getByRole("button", { name: "Ocultar Primeiro" }));
    expect(first.visible).toBe(false);
    expect(screen.getByText("Primeiro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar Primeiro" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar Primeiro" }));
    expect(first.visible).toBe(true);
  });

  it("groups and ungroups selected siblings from the hierarchy controls", () => {
    const { first, second, root } = setupTree();
    render(<ObjectTree />);
    const groupButton = screen.getByRole("button", { name: "Agrupar objetos selecionados" });
    const ungroupButton = screen.getByRole("button", { name: "Desagrupar grupo selecionado" });
    expect(groupButton).toBeDisabled();
    expect(ungroupButton).toBeDisabled();

    fireEvent.click(screen.getByText("Primeiro"));
    fireEvent.click(screen.getByText("Segundo"), { metaKey: true });
    expect(groupButton).toBeEnabled();
    fireEvent.click(groupButton);
    const group = useLab.getState().selected as Group;
    expect(group.name).toBe("Grupo");
    expect(group.parent).toBe(root);
    expect(group.children).toEqual([first, second]);
    expect(ungroupButton).toBeEnabled();

    fireEvent.click(ungroupButton);
    expect(first.parent).toBe(root);
    expect(second.parent).toBe(root);
    expect(useLab.getState().selectedObjects).toEqual([first, second]);
  });

  it("renames an object on Enter and rejects an empty name", () => {
    const { first } = setupTree();
    render(<ObjectTree />);
    fireEvent.doubleClick(screen.getByText("Primeiro"));
    const input = screen.getByRole("textbox", { name: "Nome do objeto" });
    fireEvent.change(input, { target: { value: "  Peça renomeada  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(first.name).toBe("Peça renomeada");

    fireEvent.doubleClick(screen.getByText("Peça renomeada"));
    const editAgain = screen.getByRole("textbox", { name: "Nome do objeto" });
    fireEvent.change(editAgain, { target: { value: "   " } });
    fireEvent.keyDown(editAgain, { key: "Enter" });
    expect(first.name).toBe("Peça renomeada");
    expect(screen.getByRole("textbox", { name: "Nome do objeto" })).toBeInTheDocument();
  });
});
