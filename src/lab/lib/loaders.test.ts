import { BufferGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

const loaderState = vi.hoisted(() => ({
  stlGeometry: null as unknown,
  gltfScene: null as unknown,
}));

vi.mock("three/examples/jsm/loaders/STLLoader.js", () => ({
  STLLoader: class {
    parse() {
      return loaderState.stlGeometry;
    }
  },
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    async parseAsync() {
      return { scene: loaderState.gltfScene };
    }
  },
}));

import { loadModelFile } from "./loaders";

describe("loadModelFile resource cleanup", () => {
  it("disposes STL geometry when post-parse validation fails", async () => {
    const geometry = new BufferGeometry();
    const dispose = vi.spyOn(geometry, "dispose");
    loaderState.stlGeometry = geometry;
    const file = new File(["invalid STL"], "empty.stl");

    await expect(loadModelFile(file)).rejects.toThrow("STL");

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a parsed scene when later bounds validation fails", async () => {
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();
    const scene = new Group();
    scene.add(new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    loaderState.gltfScene = scene;
    const file = new File([new Uint8Array([0])], "empty.glb");

    await expect(loadModelFile(file)).rejects.toThrow("visíveis");

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
