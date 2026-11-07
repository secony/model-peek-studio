import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from "three";
import { disposeObject } from "./scene-utils";

describe("disposeObject", () => {
  it("disposes geometry and material", () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    disposeObject(new Mesh(geometry, material));

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("disposes textures from multiple material properties and nested uniforms", () => {
    const firstTexture = new Texture();
    const secondTexture = new Texture();
    const thirdTexture = new Texture();
    const material = new MeshBasicMaterial({ map: firstTexture, alphaMap: secondTexture });
    (material as MeshBasicMaterial & { customUniform: { value: Texture } }).customUniform = {
      value: thirdTexture,
    };
    const spies = [firstTexture, secondTexture, thirdTexture].map((texture) =>
      vi.spyOn(texture, "dispose"),
    );

    disposeObject(new Mesh(new BoxGeometry(), material));

    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });

  it("disposes shared resources only once within the subtree", () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const root = new Group();
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));

    disposeObject(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it("keeps resources used by retained roots", () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const root = new Mesh(geometry, material);
    const retained = new Mesh(geometry, material);

    disposeObject(root, [retained]);

    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
  });
});
