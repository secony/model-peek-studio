import type { Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import type { ObjectTransformSnapshot } from "../history/transform-snapshot";

export type TransformMode = "translate" | "rotate" | "scale";
export type CoordinateSpace = "local" | "world";
export type TransformAxis = "x" | "y" | "z";
export type TransformProperty = "position" | "rotation" | "scale";

export interface SnappingConfig {
  /** Translation snap step in world or local units (e.g. 0.1, 0.5, 1.0) */
  translation: number;
  /** Rotation snap step in degrees (e.g. 15, 45, 90) */
  rotation: number;
  /** Scale snap step (e.g. 0.1, 0.25, 0.5) */
  scale: number;
}

export interface TransformState {
  mode: TransformMode;
  space: CoordinateSpace;
  snapping: boolean;
  snappingConfig: SnappingConfig;
}

export interface Vector3Components {
  x: number;
  y: number;
  z: number;
}

export interface DecomposedTransform {
  position: Vector3Components;
  rotation: Vector3Components; // In radians
  rotationDegrees: Vector3Components; // In degrees
  scale: Vector3Components;
}

export interface TransformValidationResult {
  valid: boolean;
  sanitizedValue: number;
  error?: string;
}

export interface TransformTransactionSnapshot {
  object: Object3D;
  before: ObjectTransformSnapshot;
  after?: ObjectTransformSnapshot;
}
