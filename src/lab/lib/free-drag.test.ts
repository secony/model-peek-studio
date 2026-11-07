import { describe, expect, it } from "vitest";
import { Bone, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Ray, Vector3 } from "three";
import {
  cancelFreeDragSession,
  canStartFreeDrag,
  createFreeDragSession,
  finishFreeDragSession,
  moveFreeDragSession,
} from "./free-drag";

function rayThrough(point: Vector3) {
  return new Ray(new Vector3(point.x, point.y, point.z + 10), new Vector3(0, 0, -1));
}

function cameraFacingNegativeZ() {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe("free drag math and lifecycle", () => {
  it("moves in the camera-parallel plane while preserving depth", () => {
    const object = new Group();
    const camera = cameraFacingNegativeZ();
    const session = createFreeDragSession(object, camera, rayThrough(new Vector3(1, 1, 0)), null)!;

    expect(moveFreeDragSession(session, rayThrough(new Vector3(3, 4, 0)))).toBe(true);
    expect(object.position.toArray()).toEqual([2, 3, 0]);
    expect(object.getWorldPosition(new Vector3()).z).toBe(0);
  });

  it("converts the target world position into local space under a transformed parent", () => {
    const parent = new Group();
    parent.position.set(5, -2, 0);
    parent.rotation.z = Math.PI / 2;
    parent.scale.set(2, 1, 1);
    const object = new Group();
    object.position.set(1, 0, 0);
    parent.add(object);
    parent.updateMatrixWorld(true);
    const initialWorld = object.getWorldPosition(new Vector3());
    const session = createFreeDragSession(
      object,
      cameraFacingNegativeZ(),
      rayThrough(initialWorld),
      null,
    )!;

    const desiredWorld = initialWorld.clone().add(new Vector3(2, 3, 0));
    moveFreeDragSession(session, rayThrough(desiredWorld));

    const actualWorld = object.getWorldPosition(new Vector3());
    expect(actualWorld.x).toBeCloseTo(7);
    expect(actualWorld.y).toBeCloseTo(3);
    expect(actualWorld.z).toBeCloseTo(0);
    expect(object.position.x).toBeCloseTo(2.5);
    expect(object.position.y).toBeCloseTo(-2);
  });

  it("starts only on the selected object or its descendants and not during gizmo dragging", () => {
    const selected = new Group();
    const child = new Mesh();
    selected.add(child);
    const other = new Bone();

    expect(canStartFreeDrag(true, false, selected, child)).toBe(true);
    expect(canStartFreeDrag(true, false, selected, other)).toBe(false);
    expect(canStartFreeDrag(true, true, selected, child)).toBe(false);
    expect(canStartFreeDrag(false, false, selected, child)).toBe(false);
  });

  it("prevents free dragging when the selected object or a hit child is effectively hidden", () => {
    const selected = new Group();
    const child = new Mesh();
    selected.add(child);
    selected.visible = false;
    expect(canStartFreeDrag(true, false, selected, child)).toBe(false);
    expect(
      createFreeDragSession(selected, cameraFacingNegativeZ(), rayThrough(new Vector3()), null),
    ).toBeNull();

    selected.visible = true;
    child.visible = false;
    expect(canStartFreeDrag(true, false, selected, child)).toBe(false);
  });

  it("disables camera controls during dragging and restores their original state on release", () => {
    const object = new Group();
    const controls = { enabled: true };
    const session = createFreeDragSession(
      object,
      cameraFacingNegativeZ(),
      rayThrough(new Vector3()),
      controls,
    )!;

    expect(controls.enabled).toBe(false);
    moveFreeDragSession(session, rayThrough(new Vector3(1, 0, 0)));
    expect(finishFreeDragSession(session)).toBe(true);
    expect(controls.enabled).toBe(true);
  });

  it("rolls back position and restores controls when the drag is cancelled", () => {
    const object = new Group();
    const controls = { enabled: false };
    const session = createFreeDragSession(
      object,
      cameraFacingNegativeZ(),
      rayThrough(new Vector3()),
      controls,
    )!;
    moveFreeDragSession(session, rayThrough(new Vector3(2, 1, 0)));

    expect(cancelFreeDragSession(session)).toBe(true);
    expect(object.position.toArray()).toEqual([0, 0, 0]);
    expect(controls.enabled).toBe(false);
  });

  it("finishes without changing position when the pointer does not move", () => {
    const object = new Mesh(undefined, new MeshBasicMaterial());
    const session = createFreeDragSession(
      object,
      cameraFacingNegativeZ(),
      rayThrough(new Vector3()),
      null,
    )!;
    expect(finishFreeDragSession(session)).toBe(false);
  });
});
