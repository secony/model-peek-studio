import { create } from "zustand";
import type { Object3D } from "three";
import type { ModelFormat } from "./loaders";
import { disposeObject, disposeObjects } from "./scene-utils";

export interface LoadedModel {
  id: string;
  fileName: string;
  format: ModelFormat;
  fileSize: number;
  /** Wrapper group added to the scene; the parsed file content lives inside. */
  root: Object3D;
}

export type Projection = "perspective" | "orthographic";

export interface ImportOperation {
  id: string;
  generation: number;
  controller: AbortController;
}

export type ImportOperationToken = Pick<ImportOperation, "id" | "generation">;

let nextImportOperationId = 0;

interface LabState {
  models: LoadedModel[];
  activeImports: Record<string, ImportOperation>;
  sceneGeneration: number;
  selected: Object3D | null;
  /** Bumped whenever an Object3D is mutated in place so panels re-read it. */
  revision: number;
  /** Bumped to request the camera to re-frame the scene. */
  fitToken: number;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  projection: Projection;
  loading: boolean;
  addModel: (m: LoadedModel) => void;
  removeModel: (id: string) => void;
  clearScene: () => void;
  select: (o: Object3D | null) => void;
  touch: () => void;
  fit: () => void;
  beginImport: (controller: AbortController) => ImportOperationToken;
  addImportedModel: (operation: ImportOperationToken, model: LoadedModel) => boolean;
  finishImport: (id: string) => void;
  toggle: (k: "showGrid" | "showAxes" | "wireframe") => void;
  setProjection: (p: Projection) => void;
}

export const useLab = create<LabState>((set, get) => ({
  models: [],
  activeImports: {},
  sceneGeneration: 0,
  selected: null,
  revision: 0,
  fitToken: 0,
  showGrid: true,
  showAxes: true,
  wireframe: false,
  projection: "perspective",
  loading: false,
  addModel: (m) =>
    set((s) => ({ models: [...s.models, m], selected: m.root, fitToken: s.fitToken + 1 })),
  removeModel: (id) => {
    const m = get().models.find((x) => x.id === id);
    if (!m) return;
    let selectedInside = false;
    m.root.traverse((o) => {
      if (o === get().selected) selectedInside = true;
    });
    disposeObject(
      m.root,
      get()
        .models.filter((x) => x.id !== id)
        .map((x) => x.root),
    );
    set((s) => ({
      models: s.models.filter((x) => x.id !== id),
      selected: selectedInside ? null : s.selected,
    }));
  },
  clearScene: () => {
    const models = get().models;
    const activeImports = Object.values(get().activeImports);
    set((s) => ({ sceneGeneration: s.sceneGeneration + 1 }));
    activeImports.forEach((operation) => operation.controller.abort());
    disposeObjects(models.map((model) => model.root));
    set((s) => ({ models: [], selected: null, fitToken: s.fitToken + 1 }));
  },
  select: (o) => set({ selected: o }),
  touch: () => set((s) => ({ revision: s.revision + 1 })),
  fit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
  beginImport: (controller) => {
    const operation: ImportOperation = {
      id: `import-${++nextImportOperationId}`,
      generation: get().sceneGeneration,
      controller,
    };
    set((s) => ({
      activeImports: { ...s.activeImports, [operation.id]: operation },
      loading: true,
    }));
    return { id: operation.id, generation: operation.generation };
  },
  addImportedModel: (operation, model) => {
    const active = get().activeImports[operation.id];
    if (
      !active ||
      active.generation !== operation.generation ||
      get().sceneGeneration !== operation.generation ||
      active.controller.signal.aborted
    ) {
      return false;
    }
    get().addModel(model);
    return true;
  },
  finishImport: (id) =>
    set((s) => {
      if (!s.activeImports[id]) return s;
      const activeImports = { ...s.activeImports };
      delete activeImports[id];
      return { activeImports, loading: Object.keys(activeImports).length > 0 };
    }),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<LabState>),
  setProjection: (p) => set((s) => ({ projection: p, fitToken: s.fitToken + 1 })),
}));
