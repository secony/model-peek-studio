import { Matrix4, Plane, Vector3, type Camera, type Object3D, type Ray } from "three";
import { isEffectivelyVisible } from "./scene-utils";
import {
  applyTransformSnapshot,
  captureTransformSnapshot,
  type ObjectTransformSnapshot,
} from "./history/transform-snapshot";

export interface FreeDragControls {
  enabled: boolean;
}

export interface FreeDragSession {
  object: Object3D;
  parent: Object3D | null;
  plane: Plane;
  startIntersection: Vector3;
  startWorldPosition: Vector3;
  startLocalPosition: Vector3;
  startLocalMatrix: Matrix4;
  startTransform: ObjectTransformSnapshot;
  controls: FreeDragControls | null;
  controlsWereEnabled: boolean;
  didMove: boolean;
}

export function canStartFreeDrag(
  enabled: boolean,
  transformIsDragging: boolean,
  selected: Object3D | null,
  hitObject: Object3D,
) {
  if (
    !enabled ||
    transformIsDragging ||
    !selected ||
    !isEffectivelyVisible(selected) ||
    !isEffectivelyVisible(hitObject)
  )
    return false;
  for (let object: Object3D | null = hitObject; object; object = object.parent) {
    if (object === selected) return true;
  }
  return false;
}

export function createFreeDragSession(
  object: Object3D,
  camera: Camera,
  startRay: Ray,
  controls: FreeDragControls | null,
): FreeDragSession | null {
  if (!isEffectivelyVisible(object)) return null;
  object.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  const startWorldPosition = object.getWorldPosition(new Vector3());
  const planeNormal = camera.getWorldDirection(new Vector3());
  const plane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, startWorldPosition);
  const startIntersection = startRay.intersectPlane(plane, new Vector3());
  if (!startIntersection) return null;

  const session: FreeDragSession = {
    object,
    parent: object.parent,
    plane,
    startIntersection,
    startWorldPosition,
    startLocalPosition: object.position.clone(),
    startLocalMatrix: object.matrix.clone(),
    startTransform: captureTransformSnapshot(object),
    controls,
    controlsWereEnabled: controls?.enabled ?? false,
    didMove: false,
  };
  if (controls) controls.enabled = false;
  return session;
}

export function moveFreeDragSession(session: FreeDragSession, ray: Ray) {
  if (session.object.parent !== session.parent) return false;
  const intersection = ray.intersectPlane(session.plane, new Vector3());
  if (!intersection) return false;

  const worldPosition = session.startWorldPosition
    .clone()
    .add(intersection.sub(session.startIntersection));
  const localPosition = session.parent ? session.parent.worldToLocal(worldPosition) : worldPosition;
  if (session.object.position.distanceToSquared(localPosition) > 1e-12) {
    session.didMove = true;
    session.object.position.copy(localPosition);
    if (session.object.matrixAutoUpdate) session.object.updateMatrix();
    else session.object.matrix.copy(session.startLocalMatrix).setPosition(localPosition);
    session.object.matrixWorldNeedsUpdate = true;
  }
  return true;
}

export function finishFreeDragSession(session: FreeDragSession) {
  if (session.controls) session.controls.enabled = session.controlsWereEnabled;
  return session.didMove;
}

export function cancelFreeDragSession(session: FreeDragSession) {
  const changed = session.didMove;
  if (changed) {
    applyTransformSnapshot(session.object, session.startTransform);
  }
  if (session.controls) session.controls.enabled = session.controlsWereEnabled;
  return changed;
}
