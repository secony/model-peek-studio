import { beforeEach, describe, expect, it } from "vitest";
import { Euler, Group, MathUtils, Mesh, MeshBasicMaterial, BoxGeometry, Vector3 } from "three";
import {
  TransformEngine,
  applyAxisTransform,
  getLocalTransform,
  getObjectTransform,
  getWorldTransform,
  setObjectPosition,
  setObjectRotationDegrees,
  setObjectScale,
  snapRotationDegrees,
  snapRotationRadians,
  snapScale,
  snapValue,
  validateTransformValue,
  MIN_SCALE_MAGNITUDE,
} from "./index";
import { useLab } from "../store";

describe("Transform Engine - Math & Coordinate Spaces", () => {
  it("matches local and world transforms for an unparented root object", () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.position.set(1, 2, 3);
    mesh.rotation.set(0.1, 0.2, 0.3);
    mesh.scale.set(2, 2, 2);

    const local = getLocalTransform(mesh);
    const world = getWorldTransform(mesh);

    expect(local.position.x).toBeCloseTo(world.position.x);
    expect(local.position.y).toBeCloseTo(world.position.y);
    expect(local.position.z).toBeCloseTo(world.position.z);
    expect(local.rotationDegrees.x).toBeCloseTo(world.rotationDegrees.x);
    expect(local.rotationDegrees.y).toBeCloseTo(world.rotationDegrees.y);
    expect(local.rotationDegrees.z).toBeCloseTo(world.rotationDegrees.z);
    expect(local.scale.x).toBeCloseTo(world.scale.x);
  });

  it("converts position correctly under a rotated parent (90 degrees around Y)", () => {
    const parent = new Group();
    const child = new Group();
    parent.rotation.y = Math.PI / 2; // 90° Y: world +X is parent's local -Z
    parent.add(child);
    parent.updateWorldMatrix(true, true);

    // Setting world position to (10, 0, 0)
    setObjectPosition(child, { x: 10, y: 0, z: 0 }, "world");
    child.updateWorldMatrix(true, true);

    const world = getWorldTransform(child);
    expect(world.position.x).toBeCloseTo(10);
    expect(world.position.y).toBeCloseTo(0);
    expect(world.position.z).toBeCloseTo(0);

    // Due to 90° Y rotation in right-handed Three.js, world +X maps to local +Z
    expect(child.position.z).toBeCloseTo(10);
    expect(child.position.x).toBeCloseTo(0);
  });

  it("converts rotation correctly under a rotated parent", () => {
    const parent = new Group();
    const child = new Group();
    parent.rotation.y = Math.PI / 2; // 90° Y
    parent.add(child);
    parent.updateWorldMatrix(true, true);

    // Set child's world rotation to 90° Y
    setObjectRotationDegrees(child, { x: 0, y: 90, z: 0 }, "world");
    child.updateWorldMatrix(true, true);

    const world = getWorldTransform(child);
    expect(world.rotationDegrees.y).toBeCloseTo(90);
    // Since parent is already at 90°, child's local rotation should be 0°
    expect(MathUtils.radToDeg(child.rotation.y)).toBeCloseTo(0);
  });

  it("converts scale correctly under a scaled parent", () => {
    const parent = new Group();
    const child = new Group();
    parent.scale.set(2, 4, 8);
    parent.add(child);
    parent.updateWorldMatrix(true, true);

    // Set child world scale to (2, 4, 8)
    setObjectScale(child, { x: 2, y: 4, z: 8 }, "world");
    child.updateWorldMatrix(true, true);

    const world = getWorldTransform(child);
    expect(world.scale.x).toBeCloseTo(2);
    expect(world.scale.y).toBeCloseTo(4);
    expect(world.scale.z).toBeCloseTo(8);

    // Child's local scale should be (1, 1, 1)
    expect(child.scale.x).toBeCloseTo(1);
    expect(child.scale.y).toBeCloseTo(1);
    expect(child.scale.z).toBeCloseTo(1);
  });

  it("handles deep hierarchy with multiple rotated and scaled ancestors", () => {
    const grandParent = new Group();
    const parent = new Group();
    const child = new Group();

    grandParent.position.set(5, 0, 0);
    grandParent.rotation.y = Math.PI / 4; // 45°
    grandParent.scale.set(2, 2, 2);

    parent.position.set(0, 3, 0);
    parent.rotation.x = Math.PI / 6; // 30°

    grandParent.add(parent);
    parent.add(child);
    grandParent.updateWorldMatrix(true, true);

    // Move child to target world position
    setObjectPosition(child, { x: 12, y: 7, z: -4 }, "world");
    child.updateWorldMatrix(true, true);

    const world = getWorldTransform(child);
    expect(world.position.x).toBeCloseTo(12);
    expect(world.position.y).toBeCloseTo(7);
    expect(world.position.z).toBeCloseTo(-4);
  });

  it("validates and prevents degenerate / zero scale", () => {
    const valZero = validateTransformValue("scale", 0);
    expect(valZero.valid).toBe(false);
    expect(valZero.value).toBe(MIN_SCALE_MAGNITUDE);

    const valNeg = validateTransformValue("scale", -0.000001);
    expect(valNeg.valid).toBe(false);

    const valValid = validateTransformValue("scale", 1.5);
    expect(valValid.valid).toBe(true);
    expect(valValid.value).toBe(1.5);

    const valNaN = validateTransformValue("position", NaN);
    expect(valNaN.valid).toBe(false);
  });
});

describe("Transform Engine - Snapping", () => {
  it("snaps single numbers accurately without floating-point drift", () => {
    expect(snapValue(0.49, 0.5)).toBe(0.5);
    expect(snapValue(0.24, 0.5)).toBe(0);
    expect(snapValue(1.04, 0.1)).toBe(1);
    expect(snapValue(1.06, 0.1)).toBe(1.1);
  });

  it("snaps rotation in degrees and radians", () => {
    expect(snapRotationDegrees(14, 15)).toBe(15);
    expect(snapRotationDegrees(44, 45)).toBe(45);
    expect(snapRotationDegrees(92, 90)).toBe(90);

    const rad = MathUtils.degToRad(16);
    const snappedRad = snapRotationRadians(rad, 15);
    expect(MathUtils.radToDeg(snappedRad)).toBeCloseTo(15);
  });

  it("snaps scale without collapsing to zero", () => {
    expect(snapScale(1.04, 0.1)).toBe(1.0);
    expect(snapScale(0.01, 0.5)).toBe(MIN_SCALE_MAGNITUDE);
  });
});

describe("Transform Engine - Interaction Lifecycle & History Transactions", () => {
  let engine: TransformEngine;

  beforeEach(() => {
    engine = new TransformEngine();
  });

  it("manages interaction state and ignores no-op gestures", () => {
    const obj = new Group();
    expect(engine.isManipulating).toBe(false);

    const id = engine.begin(obj);
    expect(id).not.toBeNull();
    expect(engine.isManipulating).toBe(true);

    // Commit without changing anything -> should be no-op (return null)
    const commitResult = engine.commit(id!);
    expect(commitResult).toBeNull();
    expect(engine.isManipulating).toBe(false);
  });

  it("creates a complete transaction payload upon meaningful transformation", () => {
    const obj = new Group();
    obj.name = "TesteObjeto";
    engine.setMode("translate");

    const id = engine.begin(obj)!;
    obj.position.set(5, 0, 0);

    const transaction = engine.commit(id);
    expect(transaction).not.toBeNull();
    expect(transaction!.label).toBe("Mover TesteObjeto");
    expect(transaction!.before.position).toEqual([0, 0, 0]);
    expect(transaction!.after.position).toEqual([5, 0, 0]);
  });

  it("cancels an active manipulation and rolls back transform", () => {
    const obj = new Group();
    obj.position.set(1, 1, 1);

    const id = engine.begin(obj)!;
    obj.position.set(9, 9, 9);

    const cancelled = engine.cancel(id);
    expect(cancelled).toBe(true);
    expect(obj.position.toArray()).toEqual([1, 1, 1]);
    expect(engine.isManipulating).toBe(false);
  });

  it("performs direct numeric transformations with undoable snapshot payloads", () => {
    const obj = new Group();
    const result = engine.applyNumeric(obj, "position", "x", 10, "local");

    expect(result).not.toBeNull();
    expect(result!.label).toContain("posição X");
    expect(obj.position.x).toBe(10);

    // Reject no-op edit with identical value
    const noOpResult = engine.applyNumeric(obj, "position", "x", 10, "local");
    expect(noOpResult).toBeNull();
  });
});

describe("Transform Engine - Store Integration & Undo/Redo", () => {
  beforeEach(() => {
    useLab.getState().clearScene();
  });

  it("allows switching transform modes and coordinate spaces in store", () => {
    const store = useLab.getState();
    expect(store.transformMode).toBe("translate");
    expect(store.coordinateSpace).toBe("local");

    store.setTransformMode("rotate");
    expect(useLab.getState().transformMode).toBe("rotate");

    store.setCoordinateSpace("world");
    expect(useLab.getState().coordinateSpace).toBe("world");

    expect(store.snappingEnabled).toBe(false);
    store.toggleSnapping();
    expect(useLab.getState().snappingEnabled).toBe(true);

    store.setSnappingConfig({ translation: 2.0 });
    expect(useLab.getState().snappingConfig.translation).toBe(2.0);
  });

  it("applies world space transform with undo/redo under a rotated parent", () => {
    const parent = new Group();
    const child = new Group();
    parent.rotation.y = Math.PI / 2;
    parent.add(child);

    useLab.getState().addModel({
      id: "test-model-rot",
      fileName: "rot.glb",
      format: "glb",
      fileSize: 10,
      root: parent,
    });
    useLab.getState().select(child);

    // Move child in world space X to 5
    const success = useLab.getState().setObjectTransform(child, "position", "x", 5, "world");
    expect(success).toBe(true);
    expect(useLab.getState().undoLabel).toContain("Alterar posição X (Global)");

    const worldTransform = getWorldTransform(child);
    expect(worldTransform.position.x).toBeCloseTo(5);

    // Undo should restore child back to (0,0,0)
    useLab.getState().undo();
    expect(getWorldTransform(child).position.x).toBeCloseTo(0);

    // Redo should reapply (5,0,0)
    useLab.getState().redo();
    expect(getWorldTransform(child).position.x).toBeCloseTo(5);
  });

  it("preserves child orientation and hierarchy during rotation undo/redo", () => {
    const parent = new Group();
    const child = new Group();
    parent.add(child);

    useLab.getState().addModel({
      id: "test-hierarchy",
      fileName: "h.glb",
      format: "glb",
      fileSize: 10,
      root: parent,
    });
    useLab.getState().select(parent);

    // Rotate parent 45° (passed in radians to setObjectTransform)
    useLab.getState().setObjectTransform(parent, "rotation", "y", MathUtils.degToRad(45), "local");
    expect(MathUtils.radToDeg(parent.rotation.y)).toBeCloseTo(45);

    useLab.getState().undo();
    expect(MathUtils.radToDeg(parent.rotation.y)).toBeCloseTo(0);

    useLab.getState().redo();
    expect(MathUtils.radToDeg(parent.rotation.y)).toBeCloseTo(45);
  });
});
