import type { Object3D } from "three";
import type {
  CoordinateSpace,
  SnappingConfig,
  TransformAxis,
  TransformMode,
  TransformProperty,
  TransformState,
} from "./types";
import { DEFAULT_SNAPPING_CONFIG } from "./snapping";
import { applyAxisTransform, getObjectTransform, validateTransformValue } from "./math";
import {
  applyTransformSnapshot,
  captureTransformSnapshot,
  sameTransformSnapshot,
  type ObjectTransformSnapshot,
} from "../history/transform-snapshot";

export interface ActiveSession {
  id: number;
  object: Object3D;
  mode: TransformMode;
  space: CoordinateSpace;
  before: ObjectTransformSnapshot;
}

export class TransformEngine {
  private state: TransformState;
  private activeSession: ActiveSession | null = null;
  private nextSessionId = 0;

  constructor(initialState?: Partial<TransformState>) {
    this.state = {
      mode: initialState?.mode ?? "translate",
      space: initialState?.space ?? "local",
      snapping: initialState?.snapping ?? false,
      snappingConfig: { ...DEFAULT_SNAPPING_CONFIG, ...initialState?.snappingConfig },
    };
  }

  // --- State Getters & Setters ---

  public getState(): Readonly<TransformState> {
    return this.state;
  }

  public get mode(): TransformMode {
    return this.state.mode;
  }

  public setMode(mode: TransformMode): void {
    this.state.mode = mode;
  }

  public get space(): CoordinateSpace {
    return this.state.space;
  }

  public setSpace(space: CoordinateSpace): void {
    this.state.space = space;
  }

  public get isSnappingEnabled(): boolean {
    return this.state.snapping;
  }

  public toggleSnapping(): boolean {
    this.state.snapping = !this.state.snapping;
    return this.state.snapping;
  }

  public setSnapping(enabled: boolean): void {
    this.state.snapping = enabled;
  }

  public get snappingConfig(): Readonly<SnappingConfig> {
    return this.state.snappingConfig;
  }

  public setSnappingConfig(config: Partial<SnappingConfig>): void {
    this.state.snappingConfig = { ...this.state.snappingConfig, ...config };
  }

  public get isManipulating(): boolean {
    return this.activeSession !== null;
  }

  public get currentSession(): Readonly<ActiveSession> | null {
    return this.activeSession;
  }

  // --- Interaction Lifecycle ---

  /**
   * Starts an interactive manipulation (e.g. gizmo drag or free movement drag).
   */
  public begin(object: Object3D, initialSnapshot?: ObjectTransformSnapshot): number | null {
    if (this.activeSession) {
      // Previous session uncommitted; cancel it first to avoid corrupt state
      this.cancel(this.activeSession.id);
    }

    const id = ++this.nextSessionId;
    this.activeSession = {
      id,
      object,
      mode: this.state.mode,
      space: this.state.space,
      before: initialSnapshot ?? captureTransformSnapshot(object),
    };
    return id;
  }

  /**
   * Commits the active manipulation.
   * Returns a transaction payload if the transform genuinely changed, or null if no-op / invalid.
   */
  public commit(sessionId: number): {
    object: Object3D;
    before: ObjectTransformSnapshot;
    after: ObjectTransformSnapshot;
    label: string;
  } | null {
    const session = this.activeSession;
    if (!session || session.id !== sessionId) return null;

    const after = captureTransformSnapshot(session.object);
    const changed = !sameTransformSnapshot(session.before, after);

    this.activeSession = null;

    if (!changed) return null;

    const modeLabels: Record<TransformMode, string> = {
      translate: "Mover",
      rotate: "Rotacionar",
      scale: "Escalar",
    };
    const label = `${modeLabels[session.mode]} ${session.object.name || session.object.type}`;

    return {
      object: session.object,
      before: session.before,
      after,
      label,
    };
  }

  /**
   * Cancels the active manipulation and restores the object to its initial state.
   */
  public cancel(sessionId: number): boolean {
    const session = this.activeSession;
    if (!session || session.id !== sessionId) return false;

    applyTransformSnapshot(session.object, session.before);
    this.activeSession = null;
    return true;
  }

  // --- Numeric Direct Modification ---

  /**
   * Applies a numeric transform change on an object in the given or current space.
   * Computes before and after snapshots.
   */
  public applyNumeric(
    object: Object3D,
    property: TransformProperty,
    axis: TransformAxis,
    value: number,
    space: CoordinateSpace = this.state.space,
  ): {
    before: ObjectTransformSnapshot;
    after: ObjectTransformSnapshot;
    label: string;
  } | null {
    if (this.activeSession) return null;

    const validation = validateTransformValue(property, value);
    if (!validation.valid) return null;

    const before = captureTransformSnapshot(object);
    const success = applyAxisTransform(object, property, axis, validation.value, space);
    if (!success) return null;

    const after = captureTransformSnapshot(object);
    if (sameTransformSnapshot(before, after)) return null;

    const propNames: Record<TransformProperty, string> = {
      position: "posição",
      rotation: "rotação",
      scale: "escala",
    };
    const spaceLabel = space === "world" ? "Global" : "Local";
    const label = `Alterar ${propNames[property]} ${axis.toUpperCase()} (${spaceLabel})`;

    return { before, after, label };
  }
}
