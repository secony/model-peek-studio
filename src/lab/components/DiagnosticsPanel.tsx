import { useState, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Filter,
  Image,
  Info,
  Layers,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLab } from "../lib/store";
import { formatBytes, formatNumber } from "../lib/scene-utils";
import { useDiagnostics } from "../lib/diagnostics";
import type { DiagnosticCategory, DiagnosticFinding, DiagnosticSeverity } from "../lib/diagnostics";

type TabId = "findings" | "stats" | "geometry" | "materials" | "performance";

const SEVERITY_CONFIG: Record<
  DiagnosticSeverity,
  { label: string; icon: typeof AlertCircle; badgeClass: string; cardBorder: string }
> = {
  critical: {
    label: "Crítico",
    icon: AlertCircle,
    badgeClass: "bg-destructive/20 text-destructive border-destructive/30",
    cardBorder: "border-destructive/40 hover:border-destructive",
  },
  warning: {
    label: "Aviso",
    icon: AlertTriangle,
    badgeClass: "bg-amber-500/20 text-amber-500 border-amber-500/30",
    cardBorder: "border-amber-500/40 hover:border-amber-500",
  },
  info: {
    label: "Info",
    icon: Info,
    badgeClass: "bg-blue-500/20 text-blue-500 border-blue-500/30",
    cardBorder: "border-blue-500/40 hover:border-blue-500",
  },
};

const CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  geometry: "Geometria",
  materials: "Materiais",
  textures: "Texturas",
  transformations: "Transformações",
  hierarchy: "Hierarquia",
  performance: "Desempenho",
  scene_structure: "Estrutura",
};

export function DiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("findings");
  const [selectedSeverity, setSelectedSeverity] = useState<DiagnosticSeverity | "all">("all");
  const [selectedCategory, setSelectedCategory] = useState<DiagnosticCategory | "all">("all");

  const { report, performance, refresh } = useDiagnostics();
  const sceneRoot = useLab((s) => s.sceneRoot);
  const select = useLab((s) => s.select);
  const fit = useLab((s) => s.fit);

  const filteredFindings = useMemo(() => {
    return report.findings.filter((item) => {
      if (selectedSeverity !== "all" && item.severity !== selectedSeverity) return false;
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      return true;
    });
  }, [report.findings, selectedSeverity, selectedCategory]);

  const handleFocusObject = (objectUuid?: string) => {
    if (!objectUuid) return;
    let target = sceneRoot.getObjectByProperty("uuid", objectUuid);
    if (!target) {
      sceneRoot.traverse((obj) => {
        if (obj.uuid === objectUuid) target = obj;
      });
    }
    if (target) {
      select(target);
      fit();
    }
  };

  return (
    <div className="flex h-full flex-col text-xs text-foreground">
      {/* Header with summary counts */}
      <div className="border-b border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <Activity className="size-4 text-primary" />
            <span>Diagnóstico de Cena</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={refresh}
            title="Atualizar diagnóstico"
          >
            <RefreshCw className="size-3 mr-1" /> Atualizar
          </Button>
        </div>

        {/* Severity pill summary */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <button
            onClick={() => {
              setActiveTab("findings");
              setSelectedSeverity(selectedSeverity === "critical" ? "all" : "critical");
            }}
            className={`rounded border p-1.5 transition-colors ${
              selectedSeverity === "critical"
                ? "border-destructive bg-destructive/15 text-destructive"
                : "border-border bg-panel hover:bg-accent/40"
            }`}
          >
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Críticos</div>
            <div className="text-sm font-bold text-destructive">{report.summary.critical}</div>
          </button>
          <button
            onClick={() => {
              setActiveTab("findings");
              setSelectedSeverity(selectedSeverity === "warning" ? "all" : "warning");
            }}
            className={`rounded border p-1.5 transition-colors ${
              selectedSeverity === "warning"
                ? "border-amber-500 bg-amber-500/15 text-amber-500"
                : "border-border bg-panel hover:bg-accent/40"
            }`}
          >
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Avisos</div>
            <div className="text-sm font-bold text-amber-500">{report.summary.warning}</div>
          </button>
          <button
            onClick={() => {
              setActiveTab("findings");
              setSelectedSeverity(selectedSeverity === "info" ? "all" : "info");
            }}
            className={`rounded border p-1.5 transition-colors ${
              selectedSeverity === "info"
                ? "border-blue-500 bg-blue-500/15 text-blue-500"
                : "border-border bg-panel hover:bg-accent/40"
            }`}
          >
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Infos</div>
            <div className="text-sm font-bold text-blue-500">{report.summary.info}</div>
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-border bg-panel px-2">
        <button
          onClick={() => setActiveTab("findings")}
          className={`px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            activeTab === "findings"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Problemas ({report.summary.total})
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            activeTab === "stats"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Estatísticas
        </button>
        <button
          onClick={() => setActiveTab("geometry")}
          className={`px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            activeTab === "geometry"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Geometria
        </button>
        <button
          onClick={() => setActiveTab("materials")}
          className={`px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            activeTab === "materials"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Texturas
        </button>
        <button
          onClick={() => setActiveTab("performance")}
          className={`px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            activeTab === "performance"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          FPS ({performance.fps})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* TAB 1: FINDINGS */}
        {activeTab === "findings" && (
          <div className="space-y-3">
            {/* Filter controls */}
            <div className="flex items-center gap-1.5 pb-2 border-b border-border text-[11px]">
              <Filter className="size-3 text-muted-foreground" />
              <select
                aria-label="Filtrar por severidade"
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value as any)}
                className="h-6 rounded border border-border bg-panel px-1 text-[11px] text-foreground"
              >
                <option value="all">Todas as severidades</option>
                <option value="critical">Críticos</option>
                <option value="warning">Avisos</option>
                <option value="info">Informativos</option>
              </select>

              <select
                aria-label="Filtrar por categoria"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
                className="h-6 rounded border border-border bg-panel px-1 text-[11px] text-foreground"
              >
                <option value="all">Todas as categorias</option>
                <option value="geometry">Geometria</option>
                <option value="materials">Materiais</option>
                <option value="textures">Texturas</option>
                <option value="transformations">Transformações</option>
                <option value="hierarchy">Hierarquia</option>
                <option value="performance">Desempenho</option>
              </select>
            </div>

            {filteredFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <CheckCircle2 className="size-8 text-emerald-500 mb-2" />
                <p className="font-medium text-foreground">Nenhum problema encontrado</p>
                <p className="text-[11px]">A cena atende a todos os critérios de validação ativos.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFindings.map((finding) => {
                  const conf = SEVERITY_CONFIG[finding.severity];
                  const Icon = conf.icon;

                  return (
                    <div
                      key={finding.id}
                      className={`group relative rounded-lg border bg-panel p-2.5 transition-all shadow-xs ${conf.cardBorder}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`size-3.5 shrink-0 ${finding.severity === "critical" ? "text-destructive" : finding.severity === "warning" ? "text-amber-500" : "text-blue-500"}`} />
                          <span className="font-semibold text-foreground">{finding.title}</span>
                        </div>
                        <Badge variant="outline" className={`h-5 text-[9px] uppercase font-mono px-1.5 ${conf.badgeClass}`}>
                          {conf.label}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground mb-1.5">{finding.description}</p>

                      {finding.evidence && (
                        <div className="rounded bg-muted/40 p-1.5 font-mono text-[10px] text-foreground/80 mb-1.5">
                          <span className="text-muted-foreground">Evidência: </span>
                          {finding.evidence}
                        </div>
                      )}

                      {finding.recommendation && (
                        <p className="text-[11px] text-muted-foreground/90 italic mb-2">
                          💡 {finding.recommendation}
                        </p>
                      )}

                      {finding.objectUuid && (
                        <div className="flex justify-end pt-1 border-t border-border/50">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-[10px] text-primary"
                            onClick={() => handleFocusObject(finding.objectUuid)}
                          >
                            <span>Localizar Objeto</span>
                            <ArrowRight className="size-3 ml-1" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SCENE STATS */}
        {activeTab === "stats" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono">
                Estrutura da Cena
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Total de Objetos</span>
                  <span className="font-mono font-medium">{report.statistics.totalObjects}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Malhas (Meshes)</span>
                  <span className="font-mono font-medium">{report.statistics.meshCount}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Grupos</span>
                  <span className="font-mono font-medium">{report.statistics.groupCount}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Luzes</span>
                  <span className="font-mono font-medium">{report.statistics.lightCount}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Câmeras</span>
                  <span className="font-mono font-medium">{report.statistics.cameraCount}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Profundidade Máxima</span>
                  <span className="font-mono font-medium">{report.statistics.maxHierarchyDepth}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Visíveis / Ocultos</span>
                  <span className="font-mono font-medium">{report.statistics.visibleCount} / {report.statistics.hiddenCount}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono">
                Recursos Distintos vs Referências
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Geometrias</span>
                  <span className="font-mono font-medium">
                    {report.statistics.distinctGeometries} únicas ({report.statistics.geometryReferences} refs)
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Materiais</span>
                  <span className="font-mono font-medium">
                    {report.statistics.distinctMaterials} únicos ({report.statistics.materialReferences} refs)
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Texturas</span>
                  <span className="font-mono font-medium">
                    {report.statistics.distinctTextures} únicas ({report.statistics.textureReferences} refs)
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono">
                Distribuição por Tipo
              </div>
              <div className="space-y-1 text-xs">
                {Object.entries(report.statistics.typeCounts).map(([type, count]) => (
                  <div key={type} className="flex justify-between py-0.5 font-mono text-[11px]">
                    <span className="text-muted-foreground">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: GEOMETRY */}
        {activeTab === "geometry" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono">
                Métricas Globais de Geometria
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Vértices Armazenados</span>
                  <span className="font-mono font-medium">{report.geometry.totalVerticesStored.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Vértices Renderizados</span>
                  <span className="font-mono font-medium">{report.geometry.totalVerticesRendered.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Triângulos Totais</span>
                  <span className="font-mono font-medium">{report.geometry.totalTriangles.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Geometrias Indexadas / Não Indexadas</span>
                  <span className="font-mono font-medium">{report.geometry.indexedGeometriesCount} / {report.geometry.nonIndexedGeometriesCount}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Memória de Vértices Estimada</span>
                  <span className="font-mono font-medium">{formatBytes(report.geometry.estimatedGeometryMemoryBytes)}</span>
                </div>
              </div>
            </div>

            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono px-1">
              Geometrias Únicas ({report.geometry.details.length})
            </div>
            <div className="space-y-2">
              {report.geometry.details.map((geo) => (
                <div key={geo.uuid} className="rounded border border-border bg-panel p-2 text-[11px] space-y-1">
                  <div className="flex justify-between items-center font-medium">
                    <span className="truncate">{geo.name}</span>
                    <span className="font-mono text-muted-foreground">{geo.triangles.toLocaleString("pt-BR")} tris</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground font-mono">
                    <div>Vértices: {geo.verticesStored}</div>
                    <div>Memória: {formatBytes(geo.memoryBytes)}</div>
                    <div>Indexada: {geo.isIndexed ? "Sim" : "Não"}</div>
                    <div>Normais: {geo.hasNormals ? "Sim" : "Ausente"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: MATERIALS & TEXTURES */}
        {activeTab === "materials" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono">
                Métricas de Texturas & VRAM
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Texturas Únicas</span>
                  <span className="font-mono font-medium">{report.materialsTextures.textures.length}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Texturas Compartilhadas</span>
                  <span className="font-mono font-medium">{report.materialsTextures.sharedTexturesCount}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">Dimensões Não-Potência de Dois</span>
                  <span className="font-mono font-medium">{report.materialsTextures.texturesWithNonPowerOfTwo}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">VRAM Estimada (RGBA8 descompactado)</span>
                  <span className="font-mono font-medium text-primary">
                    {formatBytes(report.materialsTextures.estimatedTextureMemoryBytes)}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic border-t border-border/30 pt-1">
                * Estimativa baseada em mapas RGBA descompactados na memória de vídeo com mipmaps (~1.33x).
              </p>
            </div>

            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono px-1">
              Lista de Texturas ({report.materialsTextures.textures.length})
            </div>
            {report.materialsTextures.textures.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Nenhuma textura presente na cena.</p>
            ) : (
              <div className="space-y-2">
                {report.materialsTextures.textures.map((tex) => (
                  <div key={tex.uuid} className="rounded border border-border bg-panel p-2 text-[11px] space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span className="truncate">{tex.name}</span>
                      <span className="font-mono text-muted-foreground">{tex.width}×{tex.height}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground font-mono">
                      <div>POT: {tex.isPowerOfTwo ? "Sim" : "Não (NPOT)"}</div>
                      <div>VRAM: {formatBytes(tex.estimatedGpuMemoryBytes)}</div>
                      <div>Mipmaps: {tex.hasMipmaps ? "Sim" : "Não"}</div>
                      <div>Refs: {tex.referenceCount}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: PERFORMANCE */}
        {activeTab === "performance" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-panel p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] font-mono">
                  Taxa de Quadros em Tempo Real
                </span>
                <span className="flex items-center gap-1 font-mono text-xs">
                  <span className={`size-2 rounded-full ${performance.fps >= 55 ? "bg-emerald-500" : performance.fps >= 30 ? "bg-amber-500" : "bg-destructive animate-pulse"}`} />
                  {performance.fps >= 55 ? "Fluido" : performance.fps >= 30 ? "Regular" : "Lento"}
                </span>
              </div>

              <div className="flex items-baseline justify-around text-center py-2 bg-muted/20 rounded">
                <div>
                  <div className="text-2xl font-bold font-mono text-foreground">{performance.fps}</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-mono">FPS</div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <div className="text-2xl font-bold font-mono text-foreground">{performance.frameTimeMs}</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-mono">ms / frame</div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs pt-2 border-t border-border/40">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Draw Calls (por frame)</span>
                  <span className="font-mono font-medium">{performance.drawCalls}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Triângulos Renderizados</span>
                  <span className="font-mono font-medium">{performance.renderedTriangles.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Geometrias em GPU</span>
                  <span className="font-mono font-medium">{performance.glGeometries}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Texturas em GPU</span>
                  <span className="font-mono font-medium">{performance.glTextures}</span>
                </div>
                {performance.shaderPrograms !== undefined && performance.shaderPrograms > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Programas de Shader</span>
                    <span className="font-mono font-medium">{performance.shaderPrograms}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
