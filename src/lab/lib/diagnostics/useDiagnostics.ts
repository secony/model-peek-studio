import { useEffect, useMemo, useState } from "react";
import { useLab } from "../store";
import { diagnosticEngine } from "./DiagnosticEngine";
import { globalPerformanceMonitor } from "./PerformanceMonitor";
import type { FullDiagnosticReport, PerformanceMetrics } from "./types";

export function useDiagnostics() {
  const sceneRoot = useLab((s) => s.sceneRoot);
  const revision = useLab((s) => s.revision);

  const [perf, setPerf] = useState<PerformanceMetrics>(() =>
    globalPerformanceMonitor.getMetrics(),
  );

  useEffect(() => {
    return globalPerformanceMonitor.subscribe((metrics) => {
      setPerf(metrics);
    });
  }, []);

  const report = useMemo<FullDiagnosticReport>(() => {
    return diagnosticEngine.analyze(sceneRoot, revision, perf);
  }, [sceneRoot, revision, perf]);

  const refresh = () => {
    return diagnosticEngine.analyze(sceneRoot, revision, perf, true);
  };

  return {
    report,
    performance: perf,
    refresh,
  };
}
