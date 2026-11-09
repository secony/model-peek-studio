import { act, renderHook } from "@testing-library/react";
import {
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadModelFile } from "./loaders";
import { useImportFiles } from "./use-import";
import { useLab } from "./store";

vi.mock("./loaders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./loaders")>();
  return { ...actual, loadModelFile: vi.fn() };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockedLoadModelFile = vi.mocked(loadModelFile);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeLoadedRoot() {
  return new Group();
}

describe("useImportFiles", () => {
  beforeEach(() => {
    act(() => useLab.getState().clearScene());
    mockedLoadModelFile.mockReset();
  });

  it("tracks simultaneous operations independently until the last one finishes", async () => {
    const first = deferred<Awaited<ReturnType<typeof loadModelFile>>>();
    const second = deferred<Awaited<ReturnType<typeof loadModelFile>>>();
    const firstRoot = makeLoadedRoot();
    const secondRoot = makeLoadedRoot();
    mockedLoadModelFile.mockImplementation((file) =>
      file.name === "first.glb" ? first.promise : second.promise,
    );
    const { result } = renderHook(() => useImportFiles());
    let firstImport!: Promise<void>;
    let secondImport!: Promise<void>;

    act(() => {
      firstImport = result.current([new File([], "first.glb")]);
      secondImport = result.current([new File([], "second.glb")]);
    });
    expect(useLab.getState().loading).toBe(true);
    expect(Object.keys(useLab.getState().activeImports)).toHaveLength(2);

    await act(async () => {
      first.resolve({ root: firstRoot, format: "glb" });
      await firstImport;
    });
    expect(useLab.getState().loading).toBe(true);
    expect(useLab.getState().models.map((model) => model.root)).toEqual([firstRoot]);
    expect(useLab.getState().canUndo).toBe(true);
    expect(useLab.getState().renameObject(firstRoot, "Renamed while second is pending")).toBe(true);

    await act(async () => {
      second.resolve({ root: secondRoot, format: "glb" });
      await secondImport;
    });
    expect(useLab.getState().loading).toBe(false);
    expect(useLab.getState().activeImports).toEqual({});
    expect(useLab.getState().models.map((model) => model.root)).toEqual([firstRoot, secondRoot]);
    expect(useLab.getState().selected).toBe(secondRoot);

    expect(useLab.getState().undo()).toBe(true);
    expect(useLab.getState().models.map((model) => model.root)).toEqual([firstRoot]);
    expect(useLab.getState().undo()).toBe(true);
    expect(firstRoot.name).not.toBe("Renamed while second is pending");
    expect(useLab.getState().undo()).toBe(true);
    expect(useLab.getState().models).toEqual([]);
    expect(useLab.getState().redo()).toBe(true);
    expect(useLab.getState().redo()).toBe(true);
    expect(firstRoot.name).toBe("Renamed while second is pending");
    expect(useLab.getState().redo()).toBe(true);
    expect(useLab.getState().models.map((model) => model.root)).toEqual([firstRoot, secondRoot]);
    expect(mockedLoadModelFile).toHaveBeenCalledTimes(2);
  });

  it("invalidates and disposes a result that resolves after clearScene", async () => {
    const pending = deferred<Awaited<ReturnType<typeof loadModelFile>>>();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const root = new Group();
    root.add(new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    mockedLoadModelFile.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useImportFiles());
    let importPromise!: Promise<void>;

    act(() => {
      importPromise = result.current([new File([], "stale.glb")]);
    });
    const signal = mockedLoadModelFile.mock.calls[0]?.[1];
    expect(signal).toBeDefined();

    act(() => useLab.getState().clearScene());
    expect(signal?.aborted).toBe(true);
    expect(useLab.getState().loading).toBe(true);

    await act(async () => {
      pending.resolve({ root, format: "glb" });
      await importPromise;
    });

    expect(useLab.getState().models).toEqual([]);
    expect(useLab.getState().loading).toBe(false);
    expect(useLab.getState().canUndo).toBe(false);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("finishes the operation after an import error", async () => {
    mockedLoadModelFile.mockRejectedValue(new Error("parse failed"));
    const { result } = renderHook(() => useImportFiles());
    let importPromise!: Promise<void>;

    act(() => {
      importPromise = result.current([new File([], "broken.glb")]);
    });
    expect(useLab.getState().loading).toBe(true);

    await act(async () => importPromise);

    expect(useLab.getState().loading).toBe(false);
    expect(useLab.getState().activeImports).toEqual({});
    expect(useLab.getState().models).toEqual([]);
    expect(useLab.getState().canUndo).toBe(false);
  });

  it("preserves model metadata and selection on successful import", async () => {
    const root = makeLoadedRoot();
    mockedLoadModelFile.mockResolvedValue({ root, format: "glb" });
    const file = new File([new Uint8Array([1, 2, 3])], "sample.glb");
    const { result } = renderHook(() => useImportFiles());

    await act(async () => result.current([file]));

    expect(useLab.getState().models).toEqual([
      expect.objectContaining({
        id: root.uuid,
        fileName: "sample.glb",
        format: "glb",
        fileSize: 3,
        root,
      }),
    ]);
    expect(useLab.getState().selected).toBe(root);
    expect(useLab.getState().loading).toBe(false);
    expect(useLab.getState().canUndo).toBe(true);
  });

  it("retains resources shared by detached import and duplicate commands until the last owner is discarded", async () => {
    const importedRoot = new Group();
    const bone = new Bone();
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    const skinnedMesh = new SkinnedMesh(geometry, material);
    const skeleton = new Skeleton([bone]);
    skinnedMesh.bind(skeleton);
    importedRoot.add(bone, skinnedMesh);
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    mockedLoadModelFile.mockResolvedValueOnce({ root: importedRoot, format: "glb" });
    const { result } = renderHook(() => useImportFiles());

    await act(async () => result.current([new File([], "rig.glb")]));
    const duplicate = useLab.getState().duplicateSelected()!;
    const duplicateMesh = duplicate.children.find(
      (child) => (child as SkinnedMesh).isSkinnedMesh,
    ) as SkinnedMesh;
    const duplicateSkeletonDispose = vi.spyOn(duplicateMesh.skeleton, "dispose");
    expect(useLab.getState().undo()).toBe(true);
    expect(useLab.getState().undo()).toBe(true);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();

    mockedLoadModelFile.mockResolvedValueOnce({ root: new Group(), format: "glb" });
    await act(async () => result.current([new File([], "branch.glb")]));

    expect(duplicateSkeletonDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(importedRoot.parent).toBeNull();
    expect(useLab.getState().models.map((model) => model.fileName)).toEqual(["branch.glb"]);
  });

  it("undoes and redoes an imported instance without reparsing or disposing retained resources", async () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    root.add(new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    mockedLoadModelFile.mockResolvedValue({ root, format: "glb" });
    const baseline = new Group();
    act(() =>
      useLab.getState().addModel({
        id: "baseline-model",
        fileName: "baseline.glb",
        format: "glb",
        fileSize: 1,
        root: baseline,
      }),
    );
    const { result } = renderHook(() => useImportFiles());

    await act(async () => result.current([new File([], "retained.glb")]));
    const importedModel = useLab.getState().models.at(-1)!;
    expect(importedModel.root).toBe(root);
    expect(useLab.getState().selected).toBe(root);
    expect(mockedLoadModelFile).toHaveBeenCalledTimes(1);

    expect(useLab.getState().undo()).toBe(true);
    expect(root.parent).toBeNull();
    expect(useLab.getState().models).toEqual([expect.objectContaining({ id: "baseline-model" })]);
    expect(useLab.getState().selected).toBe(baseline);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();

    expect(useLab.getState().redo()).toBe(true);
    expect(root.parent).toBe(useLab.getState().sceneRoot);
    expect(useLab.getState().models.at(-1)).toBe(importedModel);
    expect(useLab.getState().selected).toBe(root);
    expect(mockedLoadModelFile).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();

    act(() => useLab.getState().clearScene());
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it("disposes an undone import only after its redo branch is discarded", async () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    root.add(new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    mockedLoadModelFile.mockResolvedValue({ root, format: "glb" });
    const baseline = new Group();
    act(() =>
      useLab.getState().addModel({
        id: "branch-baseline",
        fileName: "baseline.glb",
        format: "glb",
        fileSize: 1,
        root: baseline,
      }),
    );
    const { result } = renderHook(() => useImportFiles());
    await act(async () => result.current([new File([], "branch.glb")]));

    expect(useLab.getState().undo()).toBe(true);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    expect(useLab.getState().renameObject(baseline, "New branch")).toBe(true);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(root.parent).toBeNull();
    expect(useLab.getState().canRedo).toBe(false);
  });
});
