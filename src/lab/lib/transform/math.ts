import {
  Euler,
  MathUtils,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { CoordinateSpace, DecomposedTransform, TransformAxis, TransformProperty, Vector3Components } from "./types";

export const EPSILON = 1e-6;
export const MIN_SCALE_MAGNITUDE = 1e-4;

/**
 * Validates numeric input for a given transform property and axis.
 */
export function validateTransformValue(
  property: TransformProperty,
  value: number,
): { valid: boolean; value: number; error?: string } {
  if (!Number.isFinite(value)) {
    return { valid: false, value: 0, error: "O valor deve ser um número finito." };
  }

  if (property === "scale") {
    if (Math.abs(value) < MIN_SCALE_MAGNITUDE) {
      // Prevent collapse to 0 which destroys inverse matrix and rotation data
      return {
        valid: false,
        value: value >= 0 ? MIN_SCALE_MAGNITUDE : -MIN_SCALE_MAGNITUDE,
        error: "A escala não pode ser zero.",
      };
    }
  }

  return { valid: true, value };
}

/**
 * Returns decomposed local transform components of an Object3D.
 */
export function getLocalTransform(object: Object3D): DecomposedTransform {
  return {
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
    rotationDegrees: {
      x: MathUtils.radToDeg(object.rotation.x),
      y: MathUtils.radToDeg(object.rotation.y),
      z: MathUtils.radToDeg(object.rotation.z),
    },
    scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
  };
}

/**
 * Returns decomposed world transform components of an Object3D,
 * accurately extracted from its world matrix.
 */
export function getWorldTransform(object: Object3D): DecomposedTransform {
  object.updateWorldMatrix(true, false);
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();

  object.matrixWorld.decompose(position, quaternion, scale);

  const euler = new Euler().setFromQuaternion(quaternion, object.rotation.order);

  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    rotationDegrees: {
      x: MathUtils.radToDeg(euler.x),
      y: MathUtils.radToDeg(euler.y),
      z: MathUtils.radToDeg(euler.z),
    },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  };
}

/**
 * Gets transform components in the requested coordinate space.
 */
export function getObjectTransform(object: Object3D, space: CoordinateSpace): DecomposedTransform {
  return space === "world" ? getWorldTransform(object) : getLocalTransform(object);
}

/**
 * Sets position of an object in either local or world space.
 * When setting in world space, converts properly using parent's world matrix.
 */
export function setObjectPosition(
  object: Object3D,
  newPosition: Vector3Components,
  space: CoordinateSpace,
): void {
  const target = new Vector3(newPosition.x, newPosition.y, newPosition.z);

  if (space === "world" && object.parent) {
    object.parent.updateWorldMatrix(true, false);
    object.parent.worldToLocal(target);
  }

  object.position.copy(target);
  if (object.matrixAutoUpdate) object.updateMatrix();
  object.matrixWorldNeedsUpdate = true;
}

/**
 * Sets rotation of an object in either local or world space.
 * When setting in world space, respects parent's orientation.
 * @param newRotationDegrees rotation in degrees
 */
export function setObjectRotationDegrees(
  object: Object3D,
  newRotationDegrees: Vector3Components,
  space: CoordinateSpace,
): void {
  const targetEuler = new Euler(
    MathUtils.degToRad(newRotationDegrees.x),
    MathUtils.degToRad(newRotationDegrees.y),
    MathUtils.degToRad(newRotationDegrees.z),
    object.rotation.order,
  );

  if (space === "world" && object.parent) {
    object.parent.updateWorldMatrix(true, false);
    const parentWorldQuat = new Quaternion();
    object.parent.getWorldQuaternion(parentWorldQuat);

    const targetWorldQuat = new Quaternion().setFromEuler(targetEuler);
    // localQuat = parentWorldQuat^-1 * targetWorldQuat
    const localQuat = parentWorldQuat.clone().invert().multiply(targetWorldQuat);
    object.quaternion.copy(localQuat);
    object.rotation.setFromQuaternion(object.quaternion, object.rotation.order);
  } else {
    object.rotation.copy(targetEuler);
    object.quaternion.setFromEuler(object.rotation);
  }

  if (object.matrixAutoUpdate) object.updateMatrix();
  object.matrixWorldNeedsUpdate = true;
}

/**
 * Sets scale of an object in either local or world space.
 * When setting in world space, scales relative to parent's world scale.
 */
export function setObjectScale(
  object: Object3D,
  newScale: Vector3Components,
  space: CoordinateSpace,
): void {
  const target = new Vector3(
    Math.abs(newScale.x) < MIN_SCALE_MAGNITUDE ? MIN_SCALE_MAGNITUDE : newScale.x,
    Math.abs(newScale.y) < MIN_SCALE_MAGNITUDE ? MIN_SCALE_MAGNITUDE : newScale.y,
    Math.abs(newScale.z) < MIN_SCALE_MAGNITUDE ? MIN_SCALE_MAGNITUDE : newScale.z,
  );

  if (space === "world" && object.parent) {
    object.parent.updateWorldMatrix(true, false);
    const parentWorldScale = new Vector3();
    const parentMatrix = object.parent.matrixWorld;
    parentWorldScale.setFromMatrixScale(parentMatrix);

    // Prevent division by zero
    target.x = Math.abs(parentWorldScale.x) > EPSILON ? target.x / parentWorldScale.x : target.x;
    target.y = Math.abs(parentWorldScale.y) > EPSILON ? target.y / parentWorldScale.y : target.y;
    target.z = Math.abs(parentWorldScale.z) > EPSILON ? target.z / parentWorldScale.z : target.z;
  }

  object.scale.copy(target);
  if (object.matrixAutoUpdate) object.updateMatrix();
  object.matrixWorldNeedsUpdate = true;
}

/**
 * Applies a single-axis change in the specified space and property.
 */
export function applyAxisTransform(
  object: Object3D,
  property: TransformProperty,
  axis: TransformAxis,
  value: number,
  space: CoordinateSpace,
): boolean {
  const validation = validateTransformValue(property, value);
  if (!validation.valid) return false;

  const current = getObjectTransform(object, space);

  if (property === "position") {
    const updated = { ...current.position, [axis]: validation.value };
    setObjectPosition(object, updated, space);
  } else if (property === "rotation") {
    const updated = { ...current.rotationDegrees, [axis]: validation.value };
    setObjectRotationDegrees(object, updated, space);
  } else if (property === "scale") {
    const updated = { ...current.scale, [axis]: validation.value };
    setObjectScale(object, updated, space);
  }

  object.updateWorldMatrix(true, true);
  return true;
}
