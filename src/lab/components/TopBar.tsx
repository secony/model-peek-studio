import { Focus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLab } from "../lib/store";
import { ImportButton } from "./ImportButton";

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar() {
  const { models, loading, fit, clearScene, selected } = useLab();
  const empty = models.length === 0;
  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-panel px-3">
      <div className="flex items-center gap-2">
        <div className="grid size-6 place-items-center rounded-sm border border-primary/60 font-mono text-[10px] font-bold text-primary">3D</div>
        <span className="text-sm font-semibold tracking-tight">3D Lab</span>
      </div>
      <div className="mx-2 h-5 w-px bg-border" />
      <ImportButton />
      {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      <div className="ml-auto flex items-center gap-1">
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
