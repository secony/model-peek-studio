import { act, fireEvent, render, screen } from "@testing-library/react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLab } from "../lib/store";
import { TopBar } from "./TopBar";

vi.mock("./ImportButton", () => ({ ImportButton: () => <button>Importar</button> }));

describe("TopBar history controls", () => {
  beforeEach(() => {
    useLab.getState().clearScene();
  });

  it("exposes labeled buttons and ignores shortcuts in editable fields", () => {
    const root = new Group();
    root.name = "Antes";
    useLab.getState().addModel({
      id: "topbar-history-model",
      fileName: "topbar.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    render(
      <TooltipProvider>
        <input aria-label="Campo de texto" />
        <textarea aria-label="Área de texto" />
        <select aria-label="Seleção">
          <option>Opção</option>
        </select>
        <div aria-label="Conteúdo editável" contentEditable="true" role="textbox">
          texto
        </div>
        <TopBar />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: /Desfazer/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Refazer/ })).toBeDisabled();
    act(() => useLab.getState().renameObject(root, "Depois"));
    expect(screen.getByRole("button", { name: /Desfazer: Renomear objeto/ })).toBeEnabled();

    for (const label of ["Campo de texto", "Área de texto", "Seleção", "Conteúdo editável"]) {
      const field =
        label === "Seleção"
          ? screen.getByRole("combobox", { name: label })
          : screen.getByRole("textbox", { name: label });
      fireEvent.keyDown(field, { key: "z", ctrlKey: true });
      expect(root.name).toBe("Depois");
    }

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(root.name).toBe("Antes");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(root.name).toBe("Depois");
  });
});
