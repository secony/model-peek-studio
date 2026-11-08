import { useEffect } from "react";
import { Focus, Loader2, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLab } from "../lib/store";
import { ImportButton } from "./ImportButton";

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar() {
  const models = useLab((s) => s.models);
  const loading = useLab((s) => s.loading);
  const fit = useLab((s) => s.fit);
  const clearScene = useLab((s) => s.clearScene);
  const selected = useLab((s) => s.selected);
  const canUndo = useLab((s) => s.canUndo);
  const canRedo = useLab((s) => s.canRedo);
  const undoLabel = useLab((s) => s.undoLabel);
  const redoLabel = useLab((s) => s.redoLabel);
  const undo = useLab((s) => s.undo);
  const redo = useLab((s) => s.redo);
  const empty = models.length === 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        (!event.ctrlKey && !event.metaKey) ||
        event.key.toLowerCase() !== "z"
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
          ))
      ) {
        return;
      }

      const state = useLab.getState();
      if (event.shiftKey ? !state.canRedo : !state.canUndo) return;
      event.preventDefault();
      if (event.shiftKey) state.redo();
      else state.undo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-panel px-3">
      <div className="flex items-center gap-2">
        <div className="grid size-6 place-items-center rounded-sm border border-primary/60 font-mono text-[10px] font-bold text-primary">
          3D
        </div>
        <span className="text-sm font-semibold tracking-tight">3D Lab</span>
      </div>
      <div className="mx-2 h-5 w-px bg-border" />
      <ImportButton />
      {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      <div className="ml-auto flex items-center gap-1">
        <IconAction
          label={canUndo ? `Desfazer: ${undoLabel} (Ctrl/Cmd+Z)` : "Desfazer (Ctrl/Cmd+Z)"}
          onClick={undo}
          disabled={!canUndo}
        >
          <Undo2 />
        </IconAction>
        <IconAction
          label={
            canRedo ? `Refazer: ${redoLabel} (Ctrl/Cmd+Shift+Z)` : "Refazer (Ctrl/Cmd+Shift+Z)"
          }
          onClick={redo}
          disabled={!canRedo}
        >
          <Redo2 />
        </IconAction>
        <div className="mx-1 h-5 w-px bg-border" />
        <IconAction label="Enquadrar seleção / cena" onClick={fit} disabled={empty}>
          <Focus />
        </IconAction>
        <IconAction label="Visão inicial" onClick={fit}>
          <RotateCcw />
        </IconAction>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={clearScene}
          disabled={empty}
        >
          <Trash2 /> Limpar cena
        </Button>
      </div>
      <span className="sr-only">{selected?.name}</span>
    </header>
  );
}
