import type { Object3D } from "three";
import type { FullDiagnosticReport, PerformanceMetrics } from "./types";
import { analyzeScene } from "./SceneAnalyzer";
import { analyzeGeometries } from "./GeometryAnalyzer";
import { analyzeMaterialsAndTextures } from "./MaterialTextureAnalyzer";
import { analyzeTransforms } from "./TransformAnalyzer";
import { evaluateDiagnosticRules } from "./DiagnosticRules";
import { globalPerformanceMonitor } from "./PerformanceMonitor";

export class DiagnosticEngine {
  private lastReport: FullDiagnosticReport | null = null;
  private cachedRevision = -1;
  private cachedRoot: Object3D | null = null;

  /**
   * Performs complete scene diagnostics.
   * If root and revision match cached analysis and force is false, reuses cached scene analysis
   * while updating live performance metrics.
   */
  public analyze(
    root: Object3D,
    revision = 0,
    performanceMetrics?: PerformanceMetrics,
    force = false,
  ): FullDiagnosticReport {
    const livePerformance = performanceMetrics || globalPerformanceMonitor.getMetrics();

    // Check cache
    if (!force && this.lastReport && this.cachedRoot === root && this.cachedRevision === revision) {
      // Return cached report with updated live performance numbers
      return {
        ...this.lastReport,
        performance: livePerformance,
      };
    }

    // 1. Scene structure & collection
    const { statistics, geometriesMap, materialsMap, texturesMap } = analyzeScene(root);

    // 2. Geometry analysis
    const geometry = analyzeGeometries(geometriesMap);

    // 3. Materials and Textures analysis
    const materialsTextures = analyzeMaterialsAndTextures(materialsMap, texturesMap);

    // 4. Transform analysis
    const transforms = analyzeTransforms(root);

    // 5. Rule evaluation
    const findings = evaluateDiagnosticRules({
      root,
      statistics,
      geometry,
      materialsTextures,
      transforms,
      performance: livePerformance,
      geometriesMap,
      materialsMap,
    });

    const summary = {
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
      total: findings.length,
    };

    const report: FullDiagnosticReport = {
      timestamp: Date.now(),
      sceneRevision: revision,
      statistics,
      geometry,
      materialsTextures,
      transforms,
      performance: livePerformance,
      findings,
      summary,
    };

    this.lastReport = report;
    this.cachedRoot = root;
    this.cachedRevision = revision;

    return report;
  }

  public invalidateCache(): void {
    this.lastReport = null;
    this.cachedRevision = -1;
    this.cachedRoot = null;
  }
}

export const diagnosticEngine = new DiagnosticEngine();
