import type { WebGLRenderer } from "three";
import type { PerformanceMetrics } from "./types";

export class PerformanceMonitor {
  private lastTime = performance.now();
  private frames = 0;
  private frameTimes: number[] = [];
  private maxSamples = 60;
  private lastUpdate = performance.now();
  private updateIntervalMs = 250; // Update external metrics 4 times per second to prevent React render thrashing

  private currentMetrics: PerformanceMetrics = {
    fps: 60,
    frameTimeMs: 16.6,
    drawCalls: 0,
    renderedTriangles: 0,
    renderedPoints: 0,
    renderedLines: 0,
    glGeometries: 0,
    glTextures: 0,
    shaderPrograms: 0,
    lastSampleTimestamp: performance.now(),
  };

  private listeners = new Set<(metrics: PerformanceMetrics) => void>();

  constructor(updateIntervalMs = 250) {
    this.updateIntervalMs = updateIntervalMs;
  }

  public subscribe(listener: (metrics: PerformanceMetrics) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentMetrics);
    return () => this.listeners.delete(listener);
  }

  public getMetrics(): Readonly<PerformanceMetrics> {
    return this.currentMetrics;
  }

  /**
   * Called every animation frame (e.g. from useFrame in R3F).
   * Extremely lightweight: computes delta and updates rolling buffer.
   */
  public recordFrame(gl?: WebGLRenderer | null): void {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    this.frames++;

    this.frameTimes.push(delta);
    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift();
    }

    if (now - this.lastUpdate >= this.updateIntervalMs) {
      const avgFrameTime =
        this.frameTimes.length > 0
          ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
          : 16.6;

      const fps = avgFrameTime > 0 ? Math.round(1000 / avgFrameTime) : 60;

      let drawCalls = 0;
      let renderedTriangles = 0;
      let renderedPoints = 0;
      let renderedLines = 0;
      let glGeometries = 0;
      let glTextures = 0;
      let shaderPrograms = 0;

      if (gl && gl.info) {
        drawCalls = gl.info.render.calls;
        renderedTriangles = gl.info.render.triangles;
        renderedPoints = gl.info.render.points;
        renderedLines = gl.info.render.lines;
        glGeometries = gl.info.memory.geometries;
        glTextures = gl.info.memory.textures;
        if (gl.info.programs) {
          shaderPrograms = gl.info.programs.length;
        }
      }

      this.currentMetrics = {
        fps: Math.min(fps, 240),
        frameTimeMs: Number(avgFrameTime.toFixed(1)),
        drawCalls,
        renderedTriangles,
        renderedPoints,
        renderedLines,
        glGeometries,
        glTextures,
        shaderPrograms,
        lastSampleTimestamp: now,
      };

      this.lastUpdate = now;
      this.listeners.forEach((listener) => listener(this.currentMetrics));
    }
  }

  public reset(): void {
    this.frames = 0;
    this.frameTimes = [];
    this.lastTime = performance.now();
    this.lastUpdate = performance.now();
  }
}

export const globalPerformanceMonitor = new PerformanceMonitor();
