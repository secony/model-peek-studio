import { create } from "zustand";
import type { Object3D } from "three";
import type { ModelFormat } from "./loaders";
import { disposeObject } from "./scene-utils";

export interface LoadedModel {
  id: string;
  fileName: string;
  format: ModelFormat;
  fileSize: number;
  /** Wrapper group added to the scene; the parsed file content lives inside. */
  root: Object3D;
}

export type Projection = "perspective" | "orthographic";

interface LabState {
  models: LoadedModel[];
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
  setLoading: (v: boolean) => void;
  toggle: (k: "showGrid" | "showAxes" | "wireframe") => void;
  setProjection: (p: Projection) => void;
}

export const useLab = create<LabState>((set, get) => ({
  models: [],
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
    disposeObject(m.root);
    set((s) => ({
      models: s.models.filter((x) => x.id !== id),
      selected: selectedInside ? null : s.selected,
    }));
  },
  clearScene: () => {
    get().models.forEach((m) => disposeObject(m.root));
    set((s) => ({ models: [], selected: null, fitToken: s.fitToken + 1 }));
  },
  select: (o) => set({ selected: o }),
  touch: () => set((s) => ({ revision: s.revision + 1 })),
  fit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
  setLoading: (v) => set({ loading: v }),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<LabState>),
  setProjection: (p) => set((s) => ({ projection: p, fitToken: s.fitToken + 1 })),
}));
