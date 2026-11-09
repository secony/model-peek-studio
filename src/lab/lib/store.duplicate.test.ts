import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Bone,
  Group,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import { useLab } from "./store";

describe("object duplication", () => {
  beforeEach(() => {
    useLab.getState().clearScene();
  });

  it("duplicates a selected mesh as an independent sibling with shared render resources", () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.position.set(1, 2, 3);
    root.add(mesh);
    useLab.getState().addModel({
      id: "mesh-model",
      fileName: "mesh.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    useLab.getState().select(mesh);

    const revision = useLab.getState().revision;
    const copy = useLab.getState().duplicateSelected() as Mesh;

    expect(copy).toBeInstanceOf(Mesh);
    expect(copy.parent).toBe(root);
    expect(copy.uuid).not.toBe(mesh.uuid);
    expect(copy.geometry).toBe(mesh.geometry);
    expect(copy.material).toBe(mesh.material);
    expect(copy.position).not.toBe(mesh.position);
    expect(copy.rotation).not.toBe(mesh.rotation);
    expect(copy.scale).not.toBe(mesh.scale);
    expect(copy.position.toArray()).toEqual([1.25, 2, 3]);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(useLab.getState().selected).toBe(copy);
    expect(useLab.getState().revision).toBe(revision + 1);
    expect(useLab.getState().canUndo).toBe(true);
  });

  it("undoes and redoes the same duplicate at its original parent and sibling index", () => {
    const root = new Group();
    const before = new Group();
    const original = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const after = new Group();
    original.name = "Original com metadados";
    original.userData["customTag"] = { nested: ["preservado"] };
    root.add(before, original, after);
    useLab.getState().addModel({
      id: "duplicate-undo-model",
      fileName: "duplicate.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    useLab.getState().select(original);

    const copy = useLab.getState().duplicateSelected() as Mesh;
    const uuid = copy.uuid;
    const index = root.children.indexOf(copy);
    const modelRecords = useLab.getState().models;
    const geometryDispose = vi.spyOn(copy.geometry, "dispose");
    const materialDispose = vi.spyOn(copy.material as MeshBasicMaterial, "dispose");
    expect(copy.userData["customTag"]).toEqual({ nested: ["preservado"] });
    expect(useLab.getState().selected).toBe(copy);

    expect(useLab.getState().undo()).toBe(true);
    expect(copy.parent).toBeNull();
    expect(useLab.getState().selected).toBe(original);
    expect(useLab.getState().models).toBe(modelRecords);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    expect(useLab.getState().redo()).toBe(true);
    expect(copy.uuid).toBe(uuid);
    expect(copy.parent).toBe(root);
    expect(root.children.indexOf(copy)).toBe(index);
    expect(copy.userData["customTag"]).toEqual({ nested: ["preservado"] });
    expect(useLab.getState().selected).toBe(copy);
    expect(useLab.getState().models).toBe(modelRecords);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it("restores a duplicate model record and disposes its unique skeleton only when an undone branch is discarded", () => {
    const root = new Group();
    const bone = new Bone();
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    skinned.bind(new Skeleton([bone]));
    root.add(bone, skinned);
    useLab.getState().addModel({
      id: "duplicate-retained-rig",
      fileName: "rig.glb",
      format: "glb",
      fileSize: 12,
      root,
    });

    const copy = useLab.getState().duplicateSelected() as Group;
    const copyModel = useLab.getState().models.at(-1)!;
    const copyMesh = copy.children.find(
      (child) => (child as SkinnedMesh).isSkinnedMesh,
    ) as SkinnedMesh;
    const skeletonDispose = vi.spyOn(copyMesh.skeleton, "dispose");
    const geometryDispose = vi.spyOn(copyMesh.geometry, "dispose");
    const materialDispose = vi.spyOn(copyMesh.material as MeshBasicMaterial, "dispose");
    expect(copyModel).toMatchObject({
      id: expect.stringContaining("duplicate-retained-rig-copy-"),
      fileName: "Cópia de rig.glb",
      format: "glb",
      fileSize: 12,
      root: copy,
    });

    expect(useLab.getState().undo()).toBe(true);
    expect(useLab.getState().models).toHaveLength(1);
    expect(skeletonDispose).not.toHaveBeenCalled();
    expect(useLab.getState().redo()).toBe(true);
    expect(useLab.getState().models.at(-1)).toBe(copyModel);
    expect(copyModel.root).toBe(copy);
    expect(useLab.getState().selected).toBe(copy);
    expect(skeletonDispose).not.toHaveBeenCalled();
    expect(useLab.getState().undo()).toBe(true);
    expect(useLab.getState().selected).toBe(root);
    useLab.getState().renameObject(root, "Nova ramificação");

    expect(skeletonDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(copy.parent).toBeNull();
    expect(useLab.getState().canRedo).toBe(false);
  });

  it("does not dispose an applied duplicate when its history entry is cleared", () => {
    const root = new Group();
    const bone = new Bone();
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    skinned.bind(new Skeleton([bone]));
    root.add(bone, skinned);
    useLab.getState().addModel({
      id: "duplicate-applied-rig",
      fileName: "rig.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    const copy = useLab.getState().duplicateSelected() as Group;
    const copyMesh = copy.children.find(
      (child) => (child as SkinnedMesh).isSkinnedMesh,
    ) as SkinnedMesh;
    const skeletonDispose = vi.spyOn(copyMesh.skeleton, "dispose");

    useLab.getState().invalidateHistory();
    expect(copy.parent).toBe(useLab.getState().sceneRoot);
    expect(skeletonDispose).not.toHaveBeenCalled();

    useLab.getState().removeModel(useLab.getState().models.at(-1)!.id);
    expect(skeletonDispose).toHaveBeenCalledOnce();
  });

  it("duplicates group descendants and gives every cloned object a new UUID", () => {
    const root = new Group();
    const original = new Group();
    const child = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    original.add(child);
    root.add(original);
    useLab.getState().addModel({
      id: "group-model",
      fileName: "group.gltf",
      format: "gltf",
      fileSize: 1,
      root,
    });
    useLab.getState().select(original);

    const copy = useLab.getState().duplicateSelected() as Group;
    const copiedChild = copy.children[0] as Mesh;

    expect(copy.parent).toBe(root);
    expect(copiedChild).toBeInstanceOf(Mesh);
    expect(copy.uuid).not.toBe(original.uuid);
    expect(copiedChild.uuid).not.toBe(child.uuid);
    expect(copiedChild.geometry).toBe(child.geometry);
    expect(copiedChild.material).toBe(child.material);
    expect(useLab.getState().selected).toBe(copy);
  });

  it("preserves shared resources when either duplicated model root is removed", () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    const root = new Group();
    root.add(new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    useLab.getState().addModel({
      id: "shared-model",
      fileName: "shared.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    useLab.getState().select(root);
    const copy = useLab.getState().duplicateSelected() as Group;
    const copyModel = useLab.getState().models.find((model) => model.root === copy)!;

    useLab.getState().removeModel("shared-model");
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    expect(copy.children).toHaveLength(1);

    useLab.getState().removeModel(copyModel.id);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it("preserves shared resources when either duplicated child is removed", () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const root = new Group();
    const original = new Mesh(geometry, material);
    root.add(original);
    useLab.getState().addModel({
      id: "child-model",
      fileName: "child.stl",
      format: "stl",
      fileSize: 1,
      root,
    });
    useLab.getState().select(original);
    const copy = useLab.getState().duplicateSelected() as Mesh;
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    useLab.getState().removeObject(copy);
    expect(copy.parent).toBeNull();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    const remainingObject = root.children[0]!;
    useLab.getState().removeObject(remainingObject);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("refuses to clone a skinned mesh whose bones are outside the selected subtree", () => {
    const root = new Group();
    const bone = new Bone();
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    skinned.bind(new Skeleton([bone]));
    root.add(bone, skinned);
    useLab.getState().addModel({
      id: "rig-model",
      fileName: "rig.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    useLab.getState().select(skinned);
    expect(useLab.getState().duplicateSelected()).toBeNull();
  });

  it("duplicates a complete skinned rig with an independent skeleton", () => {
    const root = new Group();
    const bone = new Bone();
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    skinned.bind(new Skeleton([bone]));
    root.add(bone, skinned);
    useLab.getState().addModel({
      id: "complete-rig",
      fileName: "rig.glb",
      format: "glb",
      fileSize: 1,
      root,
    });
    useLab.getState().select(root);

    const copy = useLab.getState().duplicateSelected() as Group;
    const copiedMesh = copy.children.find(
      (child) => (child as SkinnedMesh).isSkinnedMesh,
    ) as SkinnedMesh;
    const originalSkeletonDispose = vi.spyOn(skinned.skeleton, "dispose");
    const copiedSkeletonDispose = vi.spyOn(copiedMesh.skeleton, "dispose");

    expect(copiedMesh).toBeInstanceOf(SkinnedMesh);
    expect(copiedMesh.skeleton).not.toBe(skinned.skeleton);
    expect(copiedMesh.skeleton.bones[0]).toBe(copy.children[0]);
    expect(copiedMesh.geometry).toBe(skinned.geometry);
    expect(copiedMesh.material).toBe(skinned.material);

    const copyModel = useLab.getState().models.find((model) => model.root === copy)!;
    useLab.getState().removeModel("complete-rig");
    expect(originalSkeletonDispose).toHaveBeenCalledOnce();
    expect(copiedSkeletonDispose).not.toHaveBeenCalled();
    useLab.getState().removeModel(copyModel.id);
    expect(copiedSkeletonDispose).toHaveBeenCalledOnce();
  });
});
