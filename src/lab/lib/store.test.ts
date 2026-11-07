import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from "three";
import { useLab } from "./store";

describe("clearScene resource disposal", () => {
  beforeEach(() => {
    useLab.getState().clearScene();
  });

  it("disposes shared and exclusive resources once and detaches every model root", () => {
    const sharedGeometry = new BoxGeometry();
    const sharedTexture = new Texture();
    const sharedMaterial = new MeshBasicMaterial({ map: sharedTexture });
    const exclusiveGeometryA = new BoxGeometry();
    const exclusiveGeometryB = new BoxGeometry();
    const exclusiveTextureA = new Texture();
    const exclusiveTextureB = new Texture();
    const exclusiveMaterialA = new MeshBasicMaterial({ map: exclusiveTextureA });
    const exclusiveMaterialB = new MeshBasicMaterial({ map: exclusiveTextureB });
    const resources = [
      sharedGeometry,
      sharedMaterial,
      sharedTexture,
      exclusiveGeometryA,
      exclusiveGeometryB,
      exclusiveMaterialA,
      exclusiveMaterialB,
      exclusiveTextureA,
      exclusiveTextureB,
    ];
    const disposeSpies = resources.map((resource) => vi.spyOn(resource, "dispose"));
    const parentA = new Group();
    const parentB = new Group();
    const rootA = new Group();
    const rootB = new Group();

    rootA.add(
      new Mesh(sharedGeometry, sharedMaterial),
      new Mesh(exclusiveGeometryA, exclusiveMaterialA),
    );
    rootB.add(
      new Mesh(sharedGeometry, sharedMaterial),
      new Mesh(exclusiveGeometryB, exclusiveMaterialB),
    );
    parentA.add(rootA);
    parentB.add(rootB);

    useLab.getState().addModel({
      id: "model-a",
      fileName: "a.glb",
      format: "glb",
      fileSize: 1,
      root: rootA,
    });
    useLab.getState().addModel({
      id: "model-b",
      fileName: "b.glb",
      format: "glb",
      fileSize: 1,
      root: rootB,
    });
    useLab.getState().select(rootA);
    const previousFitToken = useLab.getState().fitToken;

    useLab.getState().clearScene();

    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(rootA.parent).toBeNull();
    expect(rootB.parent).toBeNull();
    expect(parentA.children).not.toContain(rootA);
    expect(parentB.children).not.toContain(rootB);
    expect(useLab.getState().models).toEqual([]);
    expect(useLab.getState().selected).toBeNull();
    expect(useLab.getState().fitToken).toBe(previousFitToken + 1);
  });
});
