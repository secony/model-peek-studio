import { MathUtils } from "three";
import type { SnappingConfig, Vector3Components } from "./types";
import { MIN_SCALE_MAGNITUDE } from "./math";

export const DEFAULT_SNAPPING_CONFIG: SnappingConfig = {
  translation: 0.5,
  rotation: 15, // 15 degrees
  scale: 0.1,
};

export const TRANSLATION_SNAP_PRESETS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0];
export const ROTATION_SNAP_PRESETS = [5, 15, 30, 45, 90];
export const SCALE_SNAP_PRESETS = [0.05, 0.1, 0.25, 0.5, 1.0];

/**
 * Snaps a single value to the nearest step increment.
 * Normalizes floating point representation to avoid 0.30000000000000004.
 */
export function snapValue(value: number, step: number): number {
  if (step <= 0 || !Number.isFinite(step) || !Number.isFinite(value)) return value;
  const raw = Math.round(value / step) * step;
  // Determine decimal places from step to cleanly format
  const stepDecimals = (step.toString().split(".")[1] || "").length;
  return Number(raw.toFixed(Math.max(stepDecimals, 4)));
}

/**
 * Snaps a 3D vector component by component.
 */
export function snapVector3(vector: Vector3Components, step: number): Vector3Components {
  return {
    x: snapValue(vector.x, step),
    y: snapValue(vector.y, step),
    z: snapValue(vector.z, step),
  };
}

/**
 * Snaps rotation in degrees.
 */
export function snapRotationDegrees(degrees: number, stepDegrees: number): number {
  return snapValue(degrees, stepDegrees);
}

/**
 * Snaps rotation in radians to degree steps.
 */
export function snapRotationRadians(radians: number, stepDegrees: number): number {
  const deg = MathUtils.radToDeg(radians);
  const snappedDeg = snapRotationDegrees(deg, stepDegrees);
  return MathUtils.degToRad(snappedDeg);
}

/**
 * Snaps scale while guaranteeing it doesn't collapse below MIN_SCALE_MAGNITUDE.
 */
export function snapScale(scale: number, step: number): number {
  const snapped = snapValue(scale, step);
  if (Math.abs(snapped) < MIN_SCALE_MAGNITUDE) {
    return snapped >= 0 ? MIN_SCALE_MAGNITUDE : -MIN_SCALE_MAGNITUDE;
  }
  return snapped;
}
