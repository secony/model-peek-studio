import { create } from "zustand";
import { Group, Matrix4, Object3D, Quaternion, SkinnedMesh, Vector3 } from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { ModelFormat } from "./loaders";
import { disposeObjects, isEffectivelyVisible } from "./scene-utils";
import { HistoryManager } from "./history/history-manager";
import type { HistoryCommand } from "./history/types";
import {
  applyTransformSnapshot,
  captureTransformSnapshot,
  sameTransformSnapshot,
  transformSnapshotWithProperty,
  type ObjectTransformSnapshot,
} from "./history/transform-snapshot";
import type {
  CoordinateSpace,
  SnappingConfig,
  TransformAxis,
  TransformMode,
  TransformProperty,
} from "./transform/types";
import { DEFAULT_SNAPPING_CONFIG } from "./transform/snapping";
import { TransformEngine } from "./transform/TransformEngine";
import { applyAxisTransform } from "./transform/math";

export type {
  CoordinateSpace,
  SnappingConfig,
  TransformAxis,
  TransformMode,
  TransformProperty,
};

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
let nextDuplicateId = 0;
const ORGANIZATION_GROUP_FLAG = "__modelPeekStudioGroup";
const ORGANIZATION_ORIGINS_FLAG = "__modelPeekStudioGroupOrigins";
const MODEL_OWNER_FLAG = "__modelPeekStudioModelId";

interface GroupOrigin {
  parentUuid: string;
  index: number;
}

interface ActiveTransformManipulation {
  id: number;
  object: Object3D;
  before: ObjectTransformSnapshot;
}

export type TransformManipulationId = number;

interface SelectionSnapshot {
  selected: Object3D | null;
  selectedObjects: Object3D[];
}

function sameSelection(first: SelectionSnapshot, second: SelectionSnapshot) {
  return (
    first.selected === second.selected &&
    first.selectedObjects.length === second.selectedObjects.length &&
    first.selectedObjects.every((object, index) => object === second.selectedObjects[index])
  );
}

export function isOrganizationGroup(object: Object3D | null): object is Group {
  return object instanceof Group && object.userData[ORGANIZATION_GROUP_FLAG] === true;
}

export function getModelOwnerId(object: Object3D) {
  const ownerId: unknown = object.userData[MODEL_OWNER_FLAG];
  return typeof ownerId === "string" ? ownerId : null;
}

function containsObject(root: Object3D, object: Object3D | null) {
  if (!object) return false;
  let contains = false;
  root.traverse((candidate) => {
    if (candidate === object) contains = true;
  });
  return contains;
}

function markModelOwner(root: Object3D, modelId: string) {
  root.traverse((object) => {
    object.userData[MODEL_OWNER_FLAG] = modelId;
  });
}

function findOwnedRoots(sceneRoot: Group, modelId: string) {
  const roots: Object3D[] = [];
  sceneRoot.traverse((object) => {
    if (
      object !== sceneRoot &&
      getModelOwnerId(object) === modelId &&
      getModelOwnerId(object.parent ?? sceneRoot) !== modelId
    ) {
      roots.push(object);
    }
  });
  return roots;
}

function insertChildAt(parent: Object3D, child: Object3D, index: number) {
  if (child.parent) child.removeFromParent();
  parent.add(child);
  const appendedIndex = parent.children.indexOf(child);
  parent.children.splice(appendedIndex, 1);
  parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, child);
}

function insertModelAt(models: LoadedModel[], model: LoadedModel, index: number) {
  const next = models.filter((candidate) => candidate.id !== model.id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, model);
  return next;
}

function removeModelRecord(models: LoadedModel[], model: LoadedModel) {
  return models.filter((candidate) => candidate.id !== model.id);
}

function removeFromSelection(
  removedRoot: Object3D,
  previousSelection: SelectionSnapshot,
  sceneRoot: Group,
  get: () => LabState,
  set: LabStoreSetter,
) {
  const current = get();
  const currentSelectedWasRemoved =
    current.selected !== null && containsObject(removedRoot, current.selected);
  const isRestorable = (object: Object3D) =>
    containsObject(sceneRoot, object) && isEffectivelyVisible(object);
  let selectedObjects = current.selectedObjects.filter(
    (object) => !containsObject(removedRoot, object) && isRestorable(object),
  );
  let selected =
    current.selected &&
    !containsObject(removedRoot, current.selected) &&
    isRestorable(current.selected)
      ? current.selected
      : null;

  if (currentSelectedWasRemoved) {
    selectedObjects = previousSelection.selectedObjects.filter(isRestorable);
    selected =
      previousSelection.selected && isRestorable(previousSelection.selected)
        ? previousSelection.selected
        : (selectedObjects.at(-1) ?? null);
  } else if (!selected) {
    selected = selectedObjects.at(-1) ?? null;
  }
  set({ selected, selectedObjects });
}

const retainedHistoryRoots = new Map<Object3D, number>();

function retainHistoryRoot(root: Object3D) {
  retainedHistoryRoots.set(root, (retainedHistoryRoots.get(root) ?? 0) + 1);
}

function releaseHistoryRoot(root: Object3D, sceneRoot: Group) {
  const retainCount = retainedHistoryRoots.get(root) ?? 0;
  if (retainCount > 1) {
    retainedHistoryRoots.set(root, retainCount - 1);
    return;
  }
  retainedHistoryRoots.delete(root);
  // An applied command no longer owns the live scene resource lifecycle.
  if (containsObject(sceneRoot, root)) return;
  disposeObjects([root], [sceneRoot, ...retainedHistoryRoots.keys()]);
}

function findObjectByUuid(root: Object3D, uuid: string): Object3D | null {
  let match: Object3D | null = null;
  root.traverse((object) => {
    if (object.uuid === uuid) match = object;
  });
  return match;
}

function getGroupOrigins(group: Group): GroupOrigin[] | null {
  const value: unknown = group.userData[ORGANIZATION_ORIGINS_FLAG];
  if (
    !Array.isArray(value) ||
    !value.every(
      (origin): origin is GroupOrigin =>
        typeof origin === "object" &&
        origin !== null &&
        typeof origin.parentUuid === "string" &&
        Number.isInteger(origin.index) &&
        origin.index >= 0,
    )
  ) {
    return null;
  }
  return value;
}

function remapClonedGroupOrigins(source: Object3D, clone: Object3D) {
  const clonedUuids = new Map<string, string>();
  const pairSubtrees = (sourceObject: Object3D, clonedObject: Object3D) => {
    clonedUuids.set(sourceObject.uuid, clonedObject.uuid);
    sourceObject.children.forEach((child, index) => {
      const clonedChild = clonedObject.children[index];
      if (clonedChild) pairSubtrees(child, clonedChild);
    });
  };
  pairSubtrees(source, clone);
  clone.traverse((object) => {
    if (!isOrganizationGroup(object)) return;
    const origins = getGroupOrigins(object);
    if (!origins) return;
    object.userData[ORGANIZATION_ORIGINS_FLAG] = origins.map((origin) => ({
      ...origin,
      parentUuid: clonedUuids.get(origin.parentUuid) ?? origin.parentUuid,
    }));
  });
}

interface HierarchySnapshot {
  object: Object3D;
  parent: Object3D;
  index: number;
  depth: number;
}

function sceneDepth(object: Object3D, sceneRoot: Group) {
  let depth = 0;
  for (let current: Object3D | null = object; current && current !== sceneRoot; current = current.parent) {
    depth += 1;
  }
  return depth;
}

function pruneEmptyOrganizationGroups(start: Object3D | null, sceneRoot: Group) {
  const removed: Group[] = [];
  let current = start;
  while (
    current &&
    current !== sceneRoot &&
    isOrganizationGroup(current) &&
    current.children.length === 0
  ) {
    const parent = current.parent;
    if (!parent) break;
    current.removeFromParent();
    removed.push(current);
    current = parent;
  }
  return removed;
}

function removeSceneObjects(
  requested: Object3D[],
  explicitModelIds: Set<string>,
  get: () => LabState,
  set: LabStoreSetter,
) {
  const state = get();
  const { sceneRoot } = state;
  if (state.isManipulating) return false;

  const candidates: Object3D[] = [];
  const modelIds = new Set(explicitModelIds);
  for (const requestedObject of requested) {
    if (
      requestedObject === sceneRoot ||
      !containsObject(sceneRoot, requestedObject) ||
      candidates.includes(requestedObject)
    ) {
      continue;
    }

    const directModel = state.models.find((model) => model.root === requestedObject);
    if (directModel) {
      modelIds.add(directModel.id);
      candidates.push(...findOwnedRoots(sceneRoot, directModel.id));
      continue;
    }

    candidates.push(requestedObject);
    const containedModels = state.models.filter((model) => containsObject(requestedObject, model.root));
    containedModels.forEach((model) => modelIds.add(model.id));
    if (isOrganizationGroup(requestedObject)) {
      containedModels.forEach((model) => {
        findOwnedRoots(sceneRoot, model.id)
          .filter((root) => !containsObject(requestedObject, root))
          .forEach((root) => candidates.push(root));
      });
    }
  }

  const roots = [...new Set(candidates)].filter(
    (candidate) =>
      !candidates.some((other) => other !== candidate && containsObject(other, candidate)),
  );
  if (roots.length === 0) return false;

  get().invalidateHistory();
  const parents = roots.map((root) => root.parent);
  roots.forEach((root) => root.removeFromParent());
  disposeObjects(roots, [sceneRoot, ...retainedHistoryRoots.keys()]);
  const prunedGroups: Group[] = [];
  parents.forEach((parent) => {
    prunedGroups.push(...pruneEmptyOrganizationGroups(parent, sceneRoot));
  });
  disposeObjects(prunedGroups, [sceneRoot, ...retainedHistoryRoots.keys()]);

  const removedRoots = new Set([...roots, ...prunedGroups]);
  const current = get();
  const selectedObjects = current.selectedObjects.filter(
    (object) => ![...removedRoots].some((root) => containsObject(root, object)),
  );
  const selected =
    current.selected && ![...removedRoots].some((root) => containsObject(root, current.selected))
      ? current.selected
      : (selectedObjects.at(-1) ?? null);

  set((latest) => ({
    models: latest.models.filter(
      (model) => !modelIds.has(model.id) && !roots.some((root) => containsObject(root, model.root)),
    ),
    selected,
    selectedObjects,
    revision: latest.revision + 1,
  }));
  return true;
}

function commonSceneParent(objects: Object3D[], sceneRoot: Group) {
  if (objects.length < 2 || objects.some((object) => !containsObject(sceneRoot, object)))
    return null;
  if (
    objects.some((object, index) =>
      objects.some(
        (other, otherIndex) =>
          index !== otherIndex && (containsObject(object, other) || containsObject(other, object)),
      ),
    )
  ) {
    return null;
  }

  const ancestors: Object3D[] = [];
  for (let ancestor = objects[0]?.parent ?? null; ancestor; ancestor = ancestor.parent) {
    ancestors.push(ancestor);
    if (ancestor === sceneRoot) break;
  }
  return (
    ancestors.find((ancestor) => objects.every((object) => containsObject(ancestor, object))) ??
    null
  );
}

function isExactTrsMatrix(matrix: Matrix4) {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const recomposed = new Matrix4();
  matrix.decompose(position, quaternion, scale);
  recomposed.compose(position, quaternion, scale);
  return matrix.elements.every((value, index) => {
    const recomposedValue = recomposed.elements[index];
    return recomposedValue !== undefined && Math.abs(value - recomposedValue) < 1e-8;
  });
}

function resolveGroupParent(selectedObjects: Object3D[], sceneRoot: Group) {
  return commonSceneParent(selectedObjects, sceneRoot);
}

interface LabState {
  sceneRoot: Group;
  models: LoadedModel[];
  activeImports: Record<string, ImportOperation>;
  sceneGeneration: number;
  selected: Object3D | null;
  selectedObjects: Object3D[];
  /** Bumped whenever an Object3D is mutated in place so panels re-read it. */
  revision: number;
  /** Bumped to request the camera to re-frame the scene. */
  fitToken: number;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  projection: Projection;
  loading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isManipulating: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  transformMode: TransformMode;
  coordinateSpace: CoordinateSpace;
  snappingEnabled: boolean;
  snappingConfig: SnappingConfig;
  setTransformMode: (mode: TransformMode) => void;
  setCoordinateSpace: (space: CoordinateSpace) => void;
  toggleSnapping: () => void;
  setSnappingConfig: (config: Partial<SnappingConfig>) => void;
  addModel: (m: LoadedModel) => void;
  removeModel: (id: string) => void;
  removeObject: (object: Object3D) => void;
  removeObjects: (objects: Object3D[]) => void;
  duplicateSelected: () => Object3D | null;
  toggleObjectVisibility: (object: Object3D) => boolean;
  toggleSelection: (object: Object3D) => void;
  canGroupSelection: () => boolean;
  groupSelection: () => Group | null;
  ungroupSelected: () => boolean;
  renameObject: (object: Object3D, name: string) => boolean;
  setObjectTransform: (
    object: Object3D,
    property: TransformProperty,
    axis: TransformAxis,
    value: number,
    space?: CoordinateSpace,
  ) => boolean;
  undo: () => boolean;
  redo: () => boolean;
  beginTransformManipulation: (
    object: Object3D,
    initialSnapshot?: ObjectTransformSnapshot,
  ) => TransformManipulationId | null;
  commitTransformManipulation: (id: TransformManipulationId) => boolean;
  cancelTransformManipulation: (id: TransformManipulationId) => boolean;
  invalidateHistory: () => void;
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

type LabStoreSetter = (
  partial: Partial<LabState> | ((state: LabState) => Partial<LabState>),
) => void;

const history = new HistoryManager();
let activeTransformManipulation: ActiveTransformManipulation | null = null;
let nextTransformManipulationId = 0;

function publishHistoryState(
  set: LabStoreSetter,
  revisionChanged = false,
  isManipulating = activeTransformManipulation !== null,
) {
  const state = history.state;
  set((current) => {
    if (
      !revisionChanged &&
      current.isManipulating === isManipulating &&
      current.canUndo === (state.canUndo && !isManipulating) &&
      current.canRedo === (state.canRedo && !isManipulating) &&
      current.undoLabel === state.undoLabel &&
      current.redoLabel === state.redoLabel
    ) {
      return current;
    }
    return {
      canUndo: state.canUndo && !isManipulating,
      canRedo: state.canRedo && !isManipulating,
      isManipulating,
      undoLabel: state.undoLabel,
      redoLabel: state.redoLabel,
      ...(revisionChanged ? { revision: current.revision + 1 } : {}),
    };
  });
}

function executeHistoryCommand(set: LabStoreSetter, command: HistoryCommand) {
  if (activeTransformManipulation) return false;
  const previousState = history.state;
  let executed = false;
  try {
    history.execute(command);
    executed = true;
    return true;
  } finally {
    const currentState = history.state;
    const changed =
      executed ||
      currentState.cursor !== previousState.cursor ||
      currentState.entryCount !== previousState.entryCount;
    publishHistoryState(set, changed);
  }
}

function moveHistory(set: LabStoreSetter, direction: "undo" | "redo") {
  if (activeTransformManipulation) return false;
  let changed = false;
  try {
    changed = direction === "undo" ? history.undo() : history.redo();
    return changed;
  } finally {
    publishHistoryState(set, changed);
  }
}

function selectionSnapshot(get: () => LabState): SelectionSnapshot {
  const state = get();
  return { selected: state.selected, selectedObjects: [...state.selectedObjects] };
}

function applyVisibility(
  object: Object3D,
  visible: boolean,
  get: () => LabState,
  set: LabStoreSetter,
  transition?: { expected: SelectionSnapshot; next: SelectionSnapshot },
): SelectionSnapshot {
  object.visible = visible;
  const current = get();
  const currentSelection: SelectionSnapshot = {
    selected: current.selected,
    selectedObjects: current.selectedObjects,
  };
  let selectedObjects = current.selectedObjects.filter(isEffectivelyVisible);
  let selected =
    current.selected && isEffectivelyVisible(current.selected)
      ? current.selected
      : (selectedObjects.at(-1) ?? null);

  if (transition && sameSelection(currentSelection, transition.expected)) {
    const isRestorable = (candidate: Object3D | null) =>
      candidate !== null &&
      containsObject(current.sceneRoot, candidate) &&
      isEffectivelyVisible(candidate);
    selectedObjects = transition.next.selectedObjects.filter(isRestorable);
    selected = isRestorable(transition.next.selected)
      ? transition.next.selected
      : (selectedObjects.at(-1) ?? null);
  }

  if (
    selected !== current.selected ||
    selectedObjects.length !== current.selectedObjects.length ||
    selectedObjects.some((candidate, index) => candidate !== current.selectedObjects[index])
  ) {
    set({ selected, selectedObjects });
  }
  return selectionSnapshot(get);
}

export const useLab = create<LabState>((set, get) => ({
  sceneRoot: new Group(),
  models: [],
  activeImports: {},
  sceneGeneration: 0,
  selected: null,
  selectedObjects: [],
  revision: 0,
  fitToken: 0,
  showGrid: true,
  showAxes: true,
  wireframe: false,
  projection: "perspective",
  loading: false,
  canUndo: history.canUndo,
  canRedo: history.canRedo,
  isManipulating: false,
  undoLabel: history.undoLabel,
  redoLabel: history.redoLabel,
  transformMode: "translate",
  coordinateSpace: "local",
  snappingEnabled: false,
  snappingConfig: { ...DEFAULT_SNAPPING_CONFIG },
  setTransformMode: (mode) => set({ transformMode: mode }),
  setCoordinateSpace: (space) => set({ coordinateSpace: space }),
  toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),
  setSnappingConfig: (config) =>
    set((s) => ({ snappingConfig: { ...s.snappingConfig, ...config } })),
  addModel: (m) => {
    get().invalidateHistory();
    const { sceneRoot } = get();
    markModelOwner(m.root, m.id);
    sceneRoot.add(m.root);
    set((s) => ({
      models: [...s.models, m],
      selected: m.root,
      selectedObjects: [m.root],
      fitToken: s.fitToken + 1,
    }));
  },
  removeModel: (id) => {
    const state = get();
    const model = state.models.find((candidate) => candidate.id === id);
    if (!model) return;
    const roots = findOwnedRoots(state.sceneRoot, id);
    removeSceneObjects(roots.length ? roots : [model.root], new Set([id]), get, set);
  },
  removeObject: (object) => removeSceneObjects([object], new Set(), get, set),
  removeObjects: (objects) => removeSceneObjects(objects, new Set(), get, set),
  duplicateSelected: () => {
    const state = get();
    if (state.isManipulating) return null;
    const selected = state.selected;
    if (!selected) return null;
    const sourceModel = state.models.find((model) => model.root === selected);
    const parent = selected.parent;
    if (!sourceModel && !parent) return null;

    const skinnedMeshes: SkinnedMesh[] = [];
    selected.traverse((node) => {
      if ((node as SkinnedMesh).isSkinnedMesh) skinnedMeshes.push(node as SkinnedMesh);
    });
    if (skinnedMeshes.length > 0) {
      const subtree = new Set<Object3D>();
      selected.traverse((node) => subtree.add(node));
      const hasExternalBone = skinnedMeshes.some((mesh) =>
        mesh.skeleton.bones.some((bone) => !subtree.has(bone)),
      );
      if (hasExternalBone) return null;
    }

    const copy = skinnedMeshes.length > 0 ? cloneSkinned(selected) : selected.clone(true);
    copy.position.x += 0.25;
    const duplicateParent = parent ?? state.sceneRoot;
    const parentIndex = duplicateParent.children.length;
    const previousSelection = selectionSnapshot(get);
    let duplicateModel: LoadedModel | null = null;
    const modelIndex = state.models.length;

    if (sourceModel) {
      let id: string;
      do {
        id = `${sourceModel.id}-copy-${++nextDuplicateId}`;
      } while (state.models.some((model) => model.id === id));
      remapClonedGroupOrigins(selected, copy);
      markModelOwner(copy, id);
      duplicateModel = {
        ...sourceModel,
        id,
        fileName: `Cópia de ${sourceModel.fileName}`,
        root: copy,
      };
    }

    const modelRecord = duplicateModel;
    let applied = false;
    const command: HistoryCommand = {
      label: `Duplicar ${selected.name || selected.type}`,
      redo: () => {
        insertChildAt(duplicateParent, copy, parentIndex);
        if (modelRecord) {
          set((current) => ({ models: insertModelAt(current.models, modelRecord, modelIndex) }));
        }
        set({ selected: copy, selectedObjects: [copy] });
        applied = true;
      },
      undo: () => {
        copy.removeFromParent();
        if (modelRecord) {
          set((current) => ({ models: removeModelRecord(current.models, modelRecord) }));
        }
        removeFromSelection(copy, previousSelection, state.sceneRoot, get, set);
        applied = false;
      },
      dispose: () => releaseHistoryRoot(copy, state.sceneRoot),
    };

    try {
      const executed = executeHistoryCommand(set, command);
      if (!executed) {
        disposeObjects([copy], [state.sceneRoot]);
        return null;
      }
      retainHistoryRoot(copy);
      return copy;
    } catch (error) {
      if (!applied) {
        disposeObjects([copy], [state.sceneRoot]);
        throw error;
      }
      retainHistoryRoot(copy);
      console.error("A duplicação foi aplicada, mas a limpeza do histórico falhou.", error);
      return copy;
    }
  },
  toggleObjectVisibility: (object) => {
    const state = get();
    if (!containsObject(state.sceneRoot, object)) return false;
    const beforeVisible = object.visible;
    const afterVisible = !beforeVisible;
    const beforeSelection = selectionSnapshot(get);
    let afterSelection: SelectionSnapshot | null = null;
    const label = `${afterVisible ? "Mostrar" : "Ocultar"} ${object.name || object.type}`;

    return executeHistoryCommand(set, {
      label,
      redo: () => {
        const transition = afterSelection
          ? { expected: beforeSelection, next: afterSelection }
          : undefined;
        const result = applyVisibility(object, afterVisible, get, set, transition);
        afterSelection ??= result;
      },
      undo: () => {
        applyVisibility(
          object,
          beforeVisible,
          get,
          set,
          afterSelection ? { expected: afterSelection, next: beforeSelection } : undefined,
        );
      },
      dispose: () => {},
    });
  },
  toggleSelection: (object) =>
    set((state) => {
      if (!isEffectivelyVisible(object)) return state;
      const exists = state.selectedObjects.includes(object);
      const selectedObjects = exists
        ? state.selectedObjects.filter((candidate) => candidate !== object)
        : [...state.selectedObjects, object];
      const selected = exists
        ? state.selected === object
          ? (selectedObjects.at(-1) ?? null)
          : state.selected
        : object;
      return { selected, selectedObjects };
    }),
  canGroupSelection: () => resolveGroupParent(get().selectedObjects, get().sceneRoot) !== null,
  groupSelection: () => {
    if (get().isManipulating) return null;
    const { selectedObjects, sceneRoot } = get();
    const parent = resolveGroupParent(selectedObjects, sceneRoot);
    if (!parent) return null;

    parent.updateWorldMatrix(true, true);
    if (Math.abs(parent.matrixWorld.determinant()) < 1e-12) return null;
    const parentInverse = parent.matrixWorld.clone().invert();
    const childMatrices = selectedObjects.map((object) =>
      parentInverse.clone().multiply(object.matrixWorld),
    );
    if (childMatrices.some((matrix) => !isExactTrsMatrix(matrix))) return null;

    const traversalOrder = new Map<Object3D, number>();
    let order = 0;
    sceneRoot.traverse((object) => traversalOrder.set(object, order++));
    const orderedObjects = [...selectedObjects].sort(
      (first, second) => (traversalOrder.get(first) ?? 0) - (traversalOrder.get(second) ?? 0),
    );
    const matrixByObject = new Map(
      selectedObjects.map((object, index) => [object, childMatrices[index]]),
    );
    const center = new Vector3();
    orderedObjects.forEach((object) => {
      const matrix = matrixByObject.get(object);
      if (matrix) center.add(new Vector3().setFromMatrixPosition(matrix));
    });
    center.divideScalar(orderedObjects.length);

    const directBranches = orderedObjects.map((object) => {
      let branch = object;
      while (branch.parent && branch.parent !== parent) branch = branch.parent;
      return branch.parent === parent ? branch : null;
    });
    if (directBranches.some((branch) => !branch)) return null;
    const insertionIndex = Math.min(
      ...directBranches.map((branch) => parent.children.indexOf(branch!)),
    );

    get().invalidateHistory();
    const group = new Group();
    group.name = "Grupo";
    group.userData[ORGANIZATION_GROUP_FLAG] = true;
    group.userData[ORGANIZATION_ORIGINS_FLAG] = orderedObjects.map((object) => ({
      parentUuid: object.parent!.uuid,
      index: object.parent!.children.indexOf(object),
    }));
    group.position.copy(center);

    orderedObjects.forEach((object) => object.removeFromParent());
    parent.add(group);
    const groupIndex = parent.children.indexOf(group);
    parent.children.splice(groupIndex, 1);
    parent.children.splice(Math.min(insertionIndex, parent.children.length), 0, group);

    orderedObjects.forEach((object) => {
      const matrix = matrixByObject.get(object)!;
      matrix.decompose(object.position, object.quaternion, object.scale);
      object.position.sub(center);
      object.matrixAutoUpdate = true;
      object.updateMatrix();
      group.add(object);
    });
    group.updateWorldMatrix(true, true);
    set({ selected: group, selectedObjects: [group] });
    get().touch();
    return group;
  },
  ungroupSelected: () => {
    if (get().isManipulating) return false;
    const group = get().selected;
    if (!isOrganizationGroup(group)) return false;
    const { sceneRoot } = get();
    group.updateWorldMatrix(true, true);
    const children = [...group.children];
    const origins = getGroupOrigins(group);
    if (!origins || origins.length !== children.length) return false;
    const parentByChild = new Map<Object3D, Object3D>();
    const localMatrixByChild = new Map<Object3D, Matrix4>();
    for (const [index, child] of children.entries()) {
      const origin = origins[index];
      if (!origin) return false;
      const parent = findObjectByUuid(sceneRoot, origin.parentUuid);
      if (!parent || containsObject(child, parent)) return false;
      parent.updateWorldMatrix(true, false);
      if (Math.abs(parent.matrixWorld.determinant()) < 1e-12) return false;
      const localMatrix = parent.matrixWorld.clone().invert().multiply(child.matrixWorld);
      if (!isExactTrsMatrix(localMatrix)) return false;
      parentByChild.set(child, parent);
      localMatrixByChild.set(child, localMatrix);
    }

    const parentOrder = new Map<Object3D, number>();
    let traversalIndex = 0;
    sceneRoot.traverse((object) => parentOrder.set(object, traversalIndex++));
    const entries = children
      .map((child, index) => ({
        child,
        parent: parentByChild.get(child)!,
        matrix: localMatrixByChild.get(child)!,
        origin: origins[index]!,
      }))
      .sort(
        (first, second) =>
          (parentOrder.get(first.parent) ?? 0) - (parentOrder.get(second.parent) ?? 0) ||
          first.origin.index - second.origin.index,
      );

    get().invalidateHistory();
    group.removeFromParent();
    entries.forEach(({ child, parent, matrix, origin }) => {
      child.removeFromParent();
      matrix.decompose(child.position, child.quaternion, child.scale);
      child.matrixAutoUpdate = true;
      child.updateMatrix();
      parent.add(child);
      const appendedIndex = parent.children.indexOf(child);
      parent.children.splice(appendedIndex, 1);
      parent.children.splice(Math.min(origin.index, parent.children.length), 0, child);
    });

    set({ selected: children[0] ?? null, selectedObjects: children });
    get().touch();
    return true;
  },
  renameObject: (object, name) => {
    if (!containsObject(get().sceneRoot, object)) return false;
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    const beforeName = object.name;
    if (beforeName === normalizedName) return true;
    return executeHistoryCommand(set, {
      label: "Renomear objeto",
      redo: () => {
        object.name = normalizedName;
      },
      undo: () => {
        object.name = beforeName;
      },
      dispose: () => {},
    });
  },
  setObjectTransform: (object, property, axis, value, space) => {
    const targetSpace = space ?? get().coordinateSpace;
    if (
      !containsObject(get().sceneRoot, object) ||
      get().selected !== object ||
      !isEffectivelyVisible(object) ||
      !Number.isFinite(value)
    ) {
      return false;
    }
    const before = captureTransformSnapshot(object);
    let after: ObjectTransformSnapshot;
    if (targetSpace === "local") {
      const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      after = transformSnapshotWithProperty(before, property, axisIndex, value);
    } else {
      const success = applyAxisTransform(object, property, axis, value, "world");
      if (!success) {
        applyTransformSnapshot(object, before);
        return false;
      }
      after = captureTransformSnapshot(object);
      applyTransformSnapshot(object, before);
    }

    if (sameTransformSnapshot(before, after)) return false;
    const propertyLabel =
      property === "position" ? "posição" : property === "rotation" ? "rotação" : "escala";
    const spaceLabel = targetSpace === "world" ? " (Global)" : "";
    return executeHistoryCommand(set, {
      label: `Alterar ${propertyLabel} ${axis.toUpperCase()}${spaceLabel}`,
      redo: () => applyTransformSnapshot(object, after),
      undo: () => applyTransformSnapshot(object, before),
      dispose: () => {},
    });
  },
  undo: () => moveHistory(set, "undo"),
  redo: () => moveHistory(set, "redo"),
  beginTransformManipulation: (object, initialSnapshot) => {
    const state = get();
    if (
      activeTransformManipulation ||
      !containsObject(state.sceneRoot, object) ||
      !isEffectivelyVisible(object)
    ) {
      return null;
    }
    const id = ++nextTransformManipulationId;
    activeTransformManipulation = {
      id,
      object,
      before: initialSnapshot ?? captureTransformSnapshot(object),
    };
    publishHistoryState(set, false, true);
    return id;
  },
  commitTransformManipulation: (id) => {
    const active = activeTransformManipulation;
    if (!active || active.id !== id) return false;
    const after = captureTransformSnapshot(active.object);
    const changed = !sameTransformSnapshot(active.before, after);
    let committed = false;
    try {
      if (!changed) return false;
      history.execute({
        label: `Transformar ${active.object.name || active.object.type}`,
        redo: () => applyTransformSnapshot(active.object, after),
        undo: () => applyTransformSnapshot(active.object, active.before),
        dispose: () => {},
      });
      committed = true;
      return true;
    } catch {
      applyTransformSnapshot(active.object, active.before);
      return false;
    } finally {
      activeTransformManipulation = null;
      publishHistoryState(set, changed, false);
      if (!committed && changed) {
        set((current) => ({ revision: current.revision + 1 }));
      }
    }
  },
  cancelTransformManipulation: (id) => {
    const active = activeTransformManipulation;
    if (!active || active.id !== id) return false;
    const changed = !sameTransformSnapshot(active.before, captureTransformSnapshot(active.object));
    try {
      if (changed) applyTransformSnapshot(active.object, active.before);
      return true;
    } finally {
      activeTransformManipulation = null;
      publishHistoryState(set, changed, false);
    }
  },
  // Non-reversible structural barriers: direct addModel, group/ungroup and clear.
  // Import, duplicate, and removal now retain resource roots through history commands.
  invalidateHistory: () => {
    const active = activeTransformManipulation;
    let restoredTransform = false;
    if (active) {
      restoredTransform = !sameTransformSnapshot(
        active.before,
        captureTransformSnapshot(active.object),
      );
      if (restoredTransform) applyTransformSnapshot(active.object, active.before);
      activeTransformManipulation = null;
    }
    try {
      history.clear();
    } finally {
      publishHistoryState(set, restoredTransform, false);
    }
  },
  clearScene: () => {
    get().invalidateHistory();
    const { sceneRoot, activeImports } = get();
    const roots = [...sceneRoot.children];
    set((s) => ({ sceneGeneration: s.sceneGeneration + 1 }));
    Object.values(activeImports).forEach((operation) => operation.controller.abort());
    disposeObjects(roots);
    set((s) => ({ models: [], selected: null, selectedObjects: [], fitToken: s.fitToken + 1 }));
  },
  select: (o) =>
    set(
      o === null
        ? { selected: null, selectedObjects: [] }
        : isEffectivelyVisible(o)
          ? { selected: o, selectedObjects: [o] }
          : {},
    ),
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

    const activeManipulation = activeTransformManipulation;
    if (activeManipulation) get().cancelTransformManipulation(activeManipulation.id);
    const { sceneRoot, models } = get();
    const sceneIndex = sceneRoot.children.length;
    const modelIndex = models.length;
    const previousSelection = selectionSnapshot(get);
    markModelOwner(model.root, model.id);
    let applied = false;
    const command: HistoryCommand = {
      label: `Importar ${model.fileName}`,
      redo: () => {
        insertChildAt(sceneRoot, model.root, sceneIndex);
        set((current) => ({
          models: insertModelAt(current.models, model, modelIndex),
          selected: model.root,
          selectedObjects: [model.root],
          fitToken: current.fitToken + 1,
        }));
        applied = true;
      },
      undo: () => {
        model.root.removeFromParent();
        set((current) => ({ models: removeModelRecord(current.models, model) }));
        removeFromSelection(model.root, previousSelection, sceneRoot, get, set);
        set((current) => ({ fitToken: current.fitToken + 1 }));
        applied = false;
      },
      dispose: () => releaseHistoryRoot(model.root, sceneRoot),
    };

    try {
      const added = executeHistoryCommand(set, command);
      if (!added) {
        disposeObjects([model.root], [sceneRoot]);
        return false;
      }
      retainHistoryRoot(model.root);
      return true;
    } catch (error) {
      if (!applied) {
        disposeObjects([model.root], [sceneRoot]);
        throw error;
      }
      retainHistoryRoot(model.root);
      console.error("A importação foi aplicada, mas a limpeza do histórico falhou.", error);
      return true;
    }
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
