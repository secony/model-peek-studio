import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";

export interface ObjectTransformSnapshot {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly rotationOrder: Euler["order"];
  readonly scale: readonly [number, number, number];
  readonly matrix: readonly number[];
  readonly matrixAutoUpdate: boolean;
}

export function captureTransformSnapshot(object: Object3D): ObjectTransformSnapshot {
  if (object.matrixAutoUpdate) object.updateMatrix();
  return {
    position: [object.position.x, object.position.y, object.position.z],
    quaternion: [
      object.quaternion.x,
      object.quaternion.y,
      object.quaternion.z,
      object.quaternion.w,
    ],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    rotationOrder: object.rotation.order,
    scale: [object.scale.x, object.scale.y, object.scale.z],
    matrix: [...object.matrix.elements],
    matrixAutoUpdate: object.matrixAutoUpdate,
  };
}

export function applyTransformSnapshot(object: Object3D, snapshot: ObjectTransformSnapshot) {
  object.position.set(...snapshot.position);
  object.quaternion.set(...snapshot.quaternion);
  object.rotation.order = snapshot.rotationOrder;
  object.rotation.set(...snapshot.rotation, snapshot.rotationOrder);
  object.quaternion.set(...snapshot.quaternion);
  object.scale.set(...snapshot.scale);
  object.matrixAutoUpdate = snapshot.matrixAutoUpdate;
  object.matrix.fromArray([...snapshot.matrix]);
  object.matrixWorldNeedsUpdate = true;
  object.updateWorldMatrix(true, false);
}

export function sameTransformSnapshot(
  first: ObjectTransformSnapshot,
  second: ObjectTransformSnapshot,
) {
  return (
    first.matrixAutoUpdate === second.matrixAutoUpdate &&
    first.rotationOrder === second.rotationOrder &&
    first.position.every((value, index) => value === second.position[index]) &&
    first.quaternion.every((value, index) => value === second.quaternion[index]) &&
    first.rotation.every((value, index) => value === second.rotation[index]) &&
    first.scale.every((value, index) => value === second.scale[index]) &&
    first.matrix.every((value, index) => value === second.matrix[index])
  );
}

export function transformSnapshotWithProperty(
  snapshot: ObjectTransformSnapshot,
  property: "position" | "rotation" | "scale",
  axisIndex: number,
  value: number,
): ObjectTransformSnapshot {
  const next = {
    ...snapshot,
    position: [...snapshot.position] as [number, number, number],
    quaternion: [...snapshot.quaternion] as [number, number, number, number],
    rotation: [...snapshot.rotation] as [number, number, number],
    scale: [...snapshot.scale] as [number, number, number],
    matrix: [...snapshot.matrix],
  };
  next[property][axisIndex] = value;
  const euler = new Euler(...next.rotation, next.rotationOrder);
  const quaternion = new Quaternion().setFromEuler(euler);
  next.quaternion = [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
  next.matrix = new Matrix4()
    .compose(new Vector3(...next.position), quaternion, new Vector3(...next.scale))
    .toArray();
  return next;
}
