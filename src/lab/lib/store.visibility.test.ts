import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { isEffectivelyVisible } from "./scene-utils";
import { useLab } from "./store";

function addRoot(root: Group) {
  useLab.getState().addModel({
    id: `visibility-${root.uuid}`,
    fileName: "visibility.glb",
    format: "glb",
    fileSize: 1,
    root,
  });
}

describe("object visibility", () => {
  beforeEach(() => useLab.getState().clearScene());

  it("toggles local visibility without removing the object or its resources", () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const child = new Mesh(geometry, material);
    root.add(child);
    addRoot(root);
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    expect(useLab.getState().toggleObjectVisibility(child)).toBe(true);
    expect(child.visible).toBe(false);
    expect(child.parent).toBe(root);
    expect(useLab.getState().models[0]?.root).toBe(root);
    expect(isEffectivelyVisible(child)).toBe(false);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    useLab.getState().toggleObjectVisibility(child);
    expect(child.visible).toBe(true);
    expect(isEffectivelyVisible(child)).toBe(true);
  });

  it("hides a group and restores descendants according to their own visibility", () => {
    const root = new Group();
    const group = new Group();
    const visibleChild = new Group();
    const explicitlyHiddenChild = new Group();
    explicitlyHiddenChild.visible = false;
    root.add(group);
    group.add(visibleChild, explicitlyHiddenChild);
    addRoot(root);

    useLab.getState().toggleObjectVisibility(group);
    expect(isEffectivelyVisible(visibleChild)).toBe(false);
    expect(isEffectivelyVisible(explicitlyHiddenChild)).toBe(false);

    useLab.getState().toggleObjectVisibility(group);
    expect(isEffectivelyVisible(visibleChild)).toBe(true);
    expect(explicitlyHiddenChild.visible).toBe(false);
    expect(isEffectivelyVisible(explicitlyHiddenChild)).toBe(false);
  });

  it("clears selected descendants when an ancestor becomes hidden", () => {
    const root = new Group();
    const parent = new Group();
    const child = new Group();
    root.add(parent);
    parent.add(child);
    addRoot(root);
    useLab.getState().select(child);

    useLab.getState().toggleObjectVisibility(parent);

    expect(useLab.getState().selected).toBeNull();
    expect(useLab.getState().selectedObjects).toEqual([]);
  });

  it("keeps visible selections and supports grouping after hiding another selected object", () => {
    const root = new Group();
    const first = new Group();
    const second = new Group();
    const third = new Group();
    root.add(first, second, third);
    addRoot(root);
    useLab.getState().select(first);
    useLab.getState().toggleSelection(second);

    useLab.getState().toggleObjectVisibility(first);
    expect(useLab.getState().selected).toBe(second);
    expect(useLab.getState().selectedObjects).toEqual([second]);

    useLab.getState().toggleObjectVisibility(first);
    useLab.getState().select(first);
    useLab.getState().toggleSelection(third);
    const group = useLab.getState().groupSelection();
    expect(group?.children).toEqual([first, third]);
  });

  it("rejects selecting an object hidden by one of its ancestors", () => {
    const root = new Group();
    const parent = new Group();
    const child = new Group();
    parent.visible = false;
    root.add(parent);
    parent.add(child);
    addRoot(root);

    useLab.getState().select(child);
    useLab.getState().toggleSelection(child);

    expect(useLab.getState().selected).toBe(root);
    expect(useLab.getState().selectedObjects).toEqual([root]);
  });
});
