import { useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLab } from "../lib/store";
import { DropZone } from "./DropZone";
import { EmptyGuide } from "./EmptyGuide";
import { ObjectTree } from "./ObjectTree";
import { PropertiesPanel } from "./PropertiesPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { SceneControls } from "./SceneControls";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { Viewport } from "./Viewport";
import { useDiagnostics } from "../lib/diagnostics";

function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex h-8 shrink-0 items-center border-b border-border px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function Studio() {
  const empty = useLab((s) => s.models.length === 0);
  const [rightTab, setRightTab] = useState<"properties" | "diagnostics">("properties");
  const { report } = useDiagnostics();
  const issueCount = report.summary.critical + report.summary.warning;

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
          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-panel lg:flex">
            <div className="flex h-8 shrink-0 items-center border-b border-border bg-panel px-1">
              <button
                onClick={() => setRightTab("properties")}
                className={`h-full px-3 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors border-b-2 ${
                  rightTab === "properties"
                    ? "border-primary text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Propriedades
              </button>
              <button
                onClick={() => setRightTab("diagnostics")}
                className={`h-full px-3 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors border-b-2 flex items-center gap-1.5 ${
                  rightTab === "diagnostics"
                    ? "border-primary text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Diagnóstico</span>
                {issueCount > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                      report.summary.critical > 0
                        ? "bg-destructive/20 text-destructive"
                        : "bg-amber-500/20 text-amber-500"
                    }`}
                  >
                    {issueCount}
                  </span>
                )}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {rightTab === "properties" ? <PropertiesPanel /> : <DiagnosticsPanel />}
            </div>
          </aside>
        </div>
        <StatusBar />
      </div>
    </TooltipProvider>
  );
}
