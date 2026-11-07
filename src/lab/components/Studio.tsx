import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLab } from "../lib/store";
import { DropZone } from "./DropZone";
import { EmptyGuide } from "./EmptyGuide";
import { ObjectTree } from "./ObjectTree";
import { PropertiesPanel } from "./PropertiesPanel";
import { SceneControls } from "./SceneControls";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { Viewport } from "./Viewport";

function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex h-8 shrink-0 items-center border-b border-border px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function Studio() {
  const empty = useLab((s) => s.models.length === 0);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-panel md:flex">
            <PanelHeader>Hierarquia</PanelHeader>
            <div className="min-h-0 flex-1 overflow-auto">
              <ObjectTree />
            </div>
            <PanelHeader>Visualização</PanelHeader>
            <SceneControls />
          </aside>
          <main className="relative min-w-0 flex-1">
            <DropZone>
              <Viewport />
              {empty && <EmptyGuide />}
            </DropZone>
          </main>
          <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-panel lg:flex">
            <PanelHeader>Propriedades</PanelHeader>
            <div className="min-h-0 flex-1 overflow-auto">
              <PropertiesPanel />
            </div>
          </aside>
        </div>
        <StatusBar />
      </div>
    </TooltipProvider>
  );
}
