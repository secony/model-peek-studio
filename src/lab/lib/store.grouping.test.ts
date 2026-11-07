import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import { isOrganizationGroup, useLab } from "./store";

function addTestModel(root: Object3D) {
  useLab.getState().addModel({
    id: `model-${root.uuid}`,
    fileName: "group-test.glb",
    format: "glb",
    fileSize: 1,
    root,
  });
}

function worldMatrix(object: Object3D) {
  object.updateWorldMatrix(true, true);
  return object.matrixWorld.clone();
}

function expectMatricesClose(actual: Matrix4, expected: Matrix4) {
  actual.elements.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.elements[index]!, 8);
  });
}

describe("hierarchy grouping", () => {
  beforeEach(() => useLab.getState().clearScene());

  it("adds and removes objects from multi-selection while retaining an active object", () => {
    const root = new Group();
    const first = new Group();
    const second = new Group();
    root.add(first, second);
    addTestModel(root);

    useLab.getState().select(first);
    useLab.getState().toggleSelection(second);
    expect(useLab.getState().selected).toBe(second);
    expect(useLab.getState().selectedObjects).toEqual([first, second]);

    useLab.getState().toggleSelection(second);
    expect(useLab.getState().selected).toBe(first);
    expect(useLab.getState().selectedObjects).toEqual([first]);
    useLab.getState().toggleSelection(first);
    expect(useLab.getState().selected).toBeNull();
    expect(useLab.getState().selectedObjects).toEqual([]);
  });

  it("keeps remaining selections coherent when a selected subtree is removed", () => {
    const root = new Group();
    const first = new Group();
    const second = new Group();
    root.add(first, second);
    addTestModel(root);
    useLab.getState().select(first);
    useLab.getState().toggleSelection(second);

    useLab.getState().removeObject(second);

    expect(useLab.getState().selected).toBe(first);
    expect(useLab.getState().selectedObjects).toEqual([first]);
    expect(second.parent).toBeNull();
  });

  it("groups siblings under a transformed parent without changing their world matrices", () => {
    const root = new Group();
    root.position.set(4, -3, 2);
    root.rotation.set(0.2, -0.35, 0.7);
    root.scale.set(1.5, 0.8, 2);
    const first = new Group();
    first.position.set(-2, 1, 0.5);
    first.rotation.set(0.3, 0.4, -0.2);
    first.scale.set(1, 2, 0.5);
    const second = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    second.position.set(3, -1, 2);
    second.rotation.set(-0.1, 0.5, 0.4);
    root.add(first, second);
    addTestModel(root);
    const firstWorld = worldMatrix(first);
    const secondWorld = worldMatrix(second);
    useLab.getState().select(first);
    useLab.getState().toggleSelection(second);

    const group = useLab.getState().groupSelection()!;

    expect(isOrganizationGroup(group)).toBe(true);
    expect(group.parent).toBe(root);
    expect(group.children).toEqual([first, second]);
    expect(useLab.getState().selected).toBe(group);
    expect(useLab.getState().selectedObjects).toEqual([group]);
    expectMatricesClose(worldMatrix(first), firstWorld);
    expectMatricesClose(worldMatrix(second), secondWorld);
  });

  it("rejects a selection containing an object and its descendant", () => {
    const root = new Group();
    const left = new Group();
    const right = new Group();
    const nested = new Group();
    root.add(left, right);
    left.add(nested);
    addTestModel(root);

    useLab.getState().select(left);
    useLab.getState().toggleSelection(right);
    expect(useLab.getState().canGroupSelection()).toBe(true);
    expect(useLab.getState().groupSelection()).not.toBeNull();

    useLab.getState().select(left);
    useLab.getState().toggleSelection(nested);
    expect(useLab.getState().canGroupSelection()).toBe(false);
    expect(useLab.getState().groupSelection()).toBeNull();
  });

  it("groups separately imported model roots and keeps each root mounted once in the stable scene root", () => {
    const sceneRoot = useLab.getState().sceneRoot;
    const firstRoot = new Group();
    firstRoot.position.set(-4, 1, 2);
    firstRoot.rotation.set(0.2, 0.6, -0.1);
    firstRoot.scale.setScalar(1.4);
    firstRoot.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    const secondRoot = new Group();
    secondRoot.position.set(5, -2, 1);
    secondRoot.rotation.set(-0.4, 0.1, 0.3);
    secondRoot.scale.setScalar(0.7);
    secondRoot.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    addTestModel(firstRoot);
    addTestModel(secondRoot);
    const firstWorld = worldMatrix(firstRoot);
    const secondWorld = worldMatrix(secondRoot);
    const modelIds = useLab.getState().models.map((model) => model.id);

    useLab.getState().select(firstRoot);
    useLab.getState().toggleSelection(secondRoot);
    const group = useLab.getState().groupSelection()!;

    expect(group.parent).toBe(sceneRoot);
    expect(group.children).toEqual([firstRoot, secondRoot]);
    expect(useLab.getState().models.map((model) => model.id)).toEqual(modelIds);
    expect(sceneRoot.children).toEqual([group]);
    expectMatricesClose(worldMatrix(firstRoot), firstWorld);
    expectMatricesClose(worldMatrix(secondRoot), secondWorld);
    for (const root of [firstRoot, secondRoot]) {
      let occurrences = 0;
      sceneRoot.traverse((object) => {
        if (object === root) occurrences++;
      });
      expect(occurrences).toBe(1);
    }
  });

  it("groups safe internal objects from different imported models and can remove one model afterward", () => {
    const firstRoot = new Group();
    firstRoot.position.set(-3, 0, 1);
    firstRoot.rotation.y = 0.35;
    firstRoot.scale.setScalar(1.2);
    const firstPart = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    firstPart.position.set(0.5, 1, 0);
    firstRoot.add(firstPart);
    const secondRoot = new Group();
    secondRoot.position.set(4, 2, -1);
    secondRoot.rotation.y = -0.2;
    secondRoot.scale.setScalar(0.8);
    const secondPart = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    secondPart.position.set(-1, 0, 0.5);
    secondRoot.add(secondPart);
    const firstId = `model-${firstRoot.uuid}`;
    const secondId = `model-${secondRoot.uuid}`;
    addTestModel(firstRoot);
    addTestModel(secondRoot);
    const firstWorld = worldMatrix(firstPart);
    const secondWorld = worldMatrix(secondPart);

    useLab.getState().select(firstPart);
    useLab.getState().toggleSelection(secondPart);
    const group = useLab.getState().groupSelection()!;

    expect(group.parent).toBe(useLab.getState().sceneRoot);
    expect(group.children).toEqual([firstPart, secondPart]);
    expectMatricesClose(worldMatrix(firstPart), firstWorld);
    expectMatricesClose(worldMatrix(secondPart), secondWorld);
    useLab.getState().removeModel(firstId);
    expect(useLab.getState().models.map((model) => model.id)).toEqual([secondId]);
    expect(firstPart.parent).toBeNull();
    expect(secondPart.parent).toBe(group);
    expect(group.parent).toBe(useLab.getState().sceneRoot);
  });

  it("ungroups cross-model objects back into their original parents while preserving world matrices", () => {
    const firstRoot = new Group();
    firstRoot.position.set(-2, 1, 0);
    firstRoot.rotation.y = 0.3;
    firstRoot.scale.setScalar(1.25);
    const firstPart = new Group();
    firstPart.position.set(1, 0, 2);
    firstRoot.add(firstPart);
    const secondRoot = new Group();
    secondRoot.position.set(3, -1, 1);
    secondRoot.rotation.y = -0.4;
    secondRoot.scale.setScalar(0.75);
    const secondPart = new Group();
    secondPart.position.set(-1, 2, 0);
    secondRoot.add(secondPart);
    addTestModel(firstRoot);
    addTestModel(secondRoot);
    useLab.getState().select(firstPart);
    useLab.getState().toggleSelection(secondPart);
    const group = useLab.getState().groupSelection()!;

    group.position.add(new Vector3(1, -0.5, 2));
    group.rotation.y = 0.2;
    group.scale.setScalar(1.3);
    firstPart.position.x += 0.6;
    firstPart.rotation.z += 0.15;
    const firstAfterGroupTransform = worldMatrix(firstPart);
    const secondAfterGroupTransform = worldMatrix(secondPart);
    useLab.getState().select(group);

    expect(useLab.getState().ungroupSelected()).toBe(true);
    expect(firstPart.parent).toBe(firstRoot);
    expect(secondPart.parent).toBe(secondRoot);
    expectMatricesClose(worldMatrix(firstPart), firstAfterGroupTransform);
    expectMatricesClose(worldMatrix(secondPart), secondAfterGroupTransform);
    expect(useLab.getState().selectedObjects).toEqual([firstPart, secondPart]);
  });

  it("removes one grouped model without disposing shared resources still used by another", () => {
    const sharedGeometry = new BoxGeometry();
    const sharedMaterial = new MeshBasicMaterial();
    const firstRoot = new Group();
    firstRoot.add(new Mesh(sharedGeometry, sharedMaterial));
    const secondRoot = new Group();
    secondRoot.add(new Mesh(sharedGeometry, sharedMaterial));
    const firstId = `model-${firstRoot.uuid}`;
    const secondId = `model-${secondRoot.uuid}`;
    addTestModel(firstRoot);
    addTestModel(secondRoot);
    useLab.getState().select(firstRoot);
    useLab.getState().toggleSelection(secondRoot);
    const group = useLab.getState().groupSelection()!;
    const geometryDispose = vi.spyOn(sharedGeometry, "dispose");
    const materialDispose = vi.spyOn(sharedMaterial, "dispose");

    useLab.getState().removeModel(firstId);
    expect(useLab.getState().models.map((model) => model.id)).toEqual([secondId]);
    expect(firstRoot.parent).toBeNull();
    expect(secondRoot.parent).toBe(group);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    useLab.getState().removeModel(secondId);
    expect(group.parent).toBeNull();
    expect(useLab.getState().sceneRoot.children).toEqual([]);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("removing an organization group removes its model records and disposes its resources", () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const firstRoot = new Group();
    firstRoot.add(new Mesh(geometry, material));
    const secondRoot = new Group();
    secondRoot.add(new Mesh(geometry, material));
    addTestModel(firstRoot);
    addTestModel(secondRoot);
    useLab.getState().select(firstRoot);
    useLab.getState().toggleSelection(secondRoot);
    const group = useLab.getState().groupSelection()!;
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    useLab.getState().removeObject(group);

    expect(useLab.getState().models).toEqual([]);
    expect(useLab.getState().sceneRoot.children).toEqual([]);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("duplicates a model root inside a group without mounting another scene root", () => {
    const firstRoot = new Group();
    const secondRoot = new Group();
    addTestModel(firstRoot);
    addTestModel(secondRoot);
    useLab.getState().select(firstRoot);
    useLab.getState().toggleSelection(secondRoot);
    const group = useLab.getState().groupSelection()!;
    useLab.getState().select(firstRoot);

    const copy = useLab.getState().duplicateSelected()!;

    expect(copy.parent).toBe(group);
    expect(group.children).toContain(firstRoot);
    expect(group.children).toContain(secondRoot);
    expect(group.children).toContain(copy);
    expect(useLab.getState().sceneRoot.children).toEqual([group]);
    expect(useLab.getState().models).toHaveLength(3);
  });

  it("ungroups without changing child world transforms or disposing child resources", () => {
    const root = new Group();
    root.position.set(3, 1, -2);
    root.rotation.y = 0.4;
    root.scale.set(1.5, 0.8, 2);
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const first = new Mesh(geometry, material);
    first.position.set(-1, 2, 0);
    first.rotation.z = 0.25;
    const second = new Group();
    second.position.set(2, -1, 1);
    root.add(first, second);
    addTestModel(root);
    useLab.getState().select(first);
    useLab.getState().toggleSelection(second);
    const group = useLab.getState().groupSelection()!;

    group.position.add(new Vector3(1, 2, -1));
    group.rotation.set(0.2, -0.3, 0.5);
    group.scale.setScalar(1.4);
    const firstWorld = worldMatrix(first);
    const secondWorld = worldMatrix(second);
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    useLab.getState().select(group);

    expect(useLab.getState().ungroupSelected()).toBe(true);

    expect(group.parent).toBeNull();
    expect(first.parent).toBe(root);
    expect(second.parent).toBe(root);
    expectMatricesClose(worldMatrix(first), firstWorld);
    expectMatricesClose(worldMatrix(second), secondWorld);
    expect(useLab.getState().selected).toBe(first);
    expect(useLab.getState().selectedObjects).toEqual([first, second]);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it("refuses to ungroup if the resulting local matrix would require shear", () => {
    const root = new Group();
    const first = new Group();
    const second = new Group();
    first.rotation.z = 0.4;
    root.add(first, second);
    addTestModel(root);
    useLab.getState().select(first);
    useLab.getState().toggleSelection(second);
    const group = useLab.getState().groupSelection()!;
    group.scale.set(2, 1, 1);
    group.updateMatrixWorld(true);
    useLab.getState().select(group);

    expect(useLab.getState().ungroupSelected()).toBe(false);
    expect(group.parent).toBe(root);
    expect(group.children).toEqual([first, second]);
  });

  it("renames without changing identity and rejects blank names", () => {
    const root = new Group();
    root.name = "Original";
    addTestModel(root);
    const uuid = root.uuid;
    const revision = useLab.getState().revision;

    expect(useLab.getState().renameObject(root, "  Novo nome  ")).toBe(true);
    expect(root.name).toBe("Novo nome");
    expect(root.uuid).toBe(uuid);
    expect(useLab.getState().revision).toBe(revision + 1);
    expect(useLab.getState().renameObject(root, "  ")).toBe(false);
    expect(root.name).toBe("Novo nome");
  });

  it("keeps duplicated objects' shared resources alive through grouping and removal", () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const original = new Mesh(geometry, material);
    root.add(original);
    addTestModel(root);
    useLab.getState().select(original);
    const duplicate = useLab.getState().duplicateSelected() as Mesh;
    useLab.getState().toggleSelection(original);
    const group = useLab.getState().groupSelection()!;
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    expect(group.children).toContain(original);
    expect(group.children).toContain(duplicate);
    useLab.getState().removeObject(duplicate);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    useLab.getState().removeObject(original);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
