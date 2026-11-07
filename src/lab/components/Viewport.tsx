import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  TransformControls,
} from "@react-three/drei";
import { Copy, Hand, Move3D, Rotate3D, Scaling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BoxHelper,
  Color,
  OrthographicCamera as OrthoCam,
  PerspectiveCamera as PerspCam,
  Vector2,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useLab } from "../lib/store";
import {
  cancelFreeDragSession,
  canStartFreeDrag,
  createFreeDragSession,
  finishFreeDragSession,
  moveFreeDragSession,
  type FreeDragSession,
} from "../lib/free-drag";
import { getBounds, isEffectivelyVisible, setWireframe } from "../lib/scene-utils";

const DEFAULT_TARGET = new Vector3(0, 0, 0);
const DEFAULT_DIR = new Vector3(1, 0.8, 1).normalize();

export type TransformMode = "translate" | "rotate" | "scale";

const TRANSFORM_TOOLS = [
  { mode: "translate", label: "Mover", icon: Move3D },
  { mode: "rotate", label: "Rotacionar", icon: Rotate3D },
  { mode: "scale", label: "Escalar", icon: Scaling },
] as const satisfies ReadonlyArray<{
  mode: TransformMode;
  label: string;
  icon: typeof Move3D;
}>;

function Models({
  freeMoveEnabled,
  transformDraggingRef,
  suppressClickPointerRef,
}: {
  freeMoveEnabled: boolean;
  transformDraggingRef: MutableRefObject<boolean>;
  suppressClickPointerRef: MutableRefObject<number | null>;
}) {
  const models = useLab((s) => s.models);
  const sceneRoot = useLab((s) => s.sceneRoot);
  const wireframe = useLab((s) => s.wireframe);
  const select = useLab((s) => s.select);
  const selected = useLab((s) => s.selected);
  const touch = useLab((s) => s.touch);
  const { camera, gl, raycaster, controls } = useThree();
  const dragSessionRef = useRef<FreeDragSession | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const endDrag = (cancel: boolean) => {
      const session = dragSessionRef.current;
      const pointerId = pointerIdRef.current;
      if (!session) return;
      const changed = cancel ? cancelFreeDragSession(session) : finishFreeDragSession(session);
      if (!cancel && changed && pointerId !== null) {
        suppressClickPointerRef.current = pointerId;
      }
      if (cancel ? changed : true) touch();
      dragSessionRef.current = null;
      pointerIdRef.current = null;
      try {
        if (pointerId !== null && gl.domElement.hasPointerCapture(pointerId)) {
          gl.domElement.releasePointerCapture(pointerId);
        }
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== pointerIdRef.current) return;
      if (
        useLab.getState().selected !== session.object ||
        session.object.parent !== session.parent
      ) {
        endDrag(true);
        return;
      }
      const bounds = gl.domElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      raycaster.setFromCamera(
        new Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      if (!moveFreeDragSession(session, raycaster.ray)) endDrag(true);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (event.pointerId !== pointerIdRef.current || !session) return;
      if (
        useLab.getState().selected !== session.object ||
        session.object.parent !== session.parent
      ) {
        endDrag(true);
      } else {
        endDrag(false);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerIdRef.current) endDrag(true);
    };
    const handleLostPointerCapture = (event: PointerEvent) => {
      if (event.pointerId === pointerIdRef.current) endDrag(true);
    };
    const handleWindowBlur = () => endDrag(true);

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    gl.domElement.addEventListener("lostpointercapture", handleLostPointerCapture);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      gl.domElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
      window.removeEventListener("blur", handleWindowBlur);
      endDrag(true);
    };
  }, [camera, gl, raycaster, suppressClickPointerRef, touch]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    suppressClickPointerRef.current = null;
    if (
      event.button !== 0 ||
      !selected ||
      !canStartFreeDrag(freeMoveEnabled, transformDraggingRef.current, selected, event.object)
    ) {
      return;
    }
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    event.nativeEvent.stopPropagation();
    const orbitControls = controls as OrbitControlsImpl | null;
    const session = createFreeDragSession(selected, camera, event.ray, orbitControls ?? null);
    if (!session) return;
    dragSessionRef.current = session;
    pointerIdRef.current = event.pointerId;
    try {
      gl.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointer listeners continue the drag when capture is unavailable.
    }
  };

  useEffect(() => setWireframe([sceneRoot], wireframe), [models, sceneRoot, wireframe]);
  return (
    <primitive
      object={sceneRoot}
      onPointerDown={handlePointerDown}
      onClick={(e: ThreeEvent<PointerEvent>) => {
        if (suppressClickPointerRef.current === e.pointerId) {
          suppressClickPointerRef.current = null;
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        select(e.object);
      }}
    />
  );
}

function SelectionHighlight() {
  const selected = useLab((s) => s.selected);
  const scene = useThree((s) => s.scene);
  const helper = useRef<BoxHelper | null>(null);
  useEffect(() => {
    if (!selected) return;
    const h = new BoxHelper(selected, new Color("#f5a524"));
    h.raycast = () => {};
    scene.add(h);
    helper.current = h;
    return () => {
      scene.remove(h);
      h.geometry.dispose();
      h.material.dispose();
      helper.current = null;
    };
  }, [selected, scene]);
  useFrame(() => helper.current?.update());
  return null;
}

export function SelectionTransform({
  mode,
  transformDraggingRef,
}: {
  mode: TransformMode;
  transformDraggingRef: MutableRefObject<boolean>;
}) {
  const selected = useLab((s) => s.selected);
  const touch = useLab((s) => s.touch);

  useEffect(
    () => () => {
      transformDraggingRef.current = false;
    },
    [selected, transformDraggingRef],
  );

  if (!selected || !isEffectivelyVisible(selected)) return null;

  return (
    <TransformControls
      object={selected}
      mode={mode}
      onMouseDown={() => {
        transformDraggingRef.current = true;
      }}
      onMouseUp={() => {
        transformDraggingRef.current = false;
        touch();
      }}
    />
  );
}

export function TransformToolbar({
  mode,
  onModeChange,
  freeMoveEnabled,
  onToggleFreeMove,
}: {
  mode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
  freeMoveEnabled: boolean;
  onToggleFreeMove: () => void;
}) {
  const hasSelection = useLab((s) => s.selected !== null);
  const duplicateSelected = useLab((s) => s.duplicateSelected);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
      <div
        aria-label="Ferramentas de transformação"
        className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-panel/95 p-1 shadow-lg backdrop-blur"
        role="toolbar"
      >
        {TRANSFORM_TOOLS.map(({ mode: toolMode, label, icon: Icon }) => (
          <Button
            key={toolMode}
            aria-label={label}
            aria-pressed={mode === toolMode}
            className={
              mode === toolMode
                ? "h-8 border border-primary/30 bg-primary/15 px-2.5 text-primary hover:bg-primary/20"
                : "h-8 px-2.5 text-muted-foreground"
            }
            disabled={!hasSelection}
            onClick={() => onModeChange(toolMode)}
            size="sm"
            title={label}
            variant={mode === toolMode ? "secondary" : "ghost"}
          >
            <Icon aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
        <Button
          aria-label="Duplicar objeto selecionado"
          className="h-8 px-2.5 text-muted-foreground"
          disabled={!hasSelection}
          onClick={() => {
            if (duplicateSelected()) toast.success("Objeto duplicado");
            else
              toast.error("Não foi possível duplicar", {
                description:
                  "Para copiar um objeto articulado, selecione o grupo que contém toda a estrutura do esqueleto.",
              });
          }}
          size="sm"
          title="Duplicar objeto selecionado"
          variant="ghost"
        >
          <Copy aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Duplicar</span>
        </Button>
        <Button
          aria-label="Movimentação livre"
          aria-pressed={freeMoveEnabled}
          className={
            freeMoveEnabled
              ? "h-8 border border-primary/30 bg-primary/15 px-2.5 text-primary hover:bg-primary/20"
              : "h-8 px-2.5 text-muted-foreground"
          }
          disabled={!hasSelection}
          onClick={onToggleFreeMove}
          size="sm"
          title={freeMoveEnabled ? "Desativar movimentação livre" : "Ativar movimentação livre"}
          variant={freeMoveEnabled ? "secondary" : "ghost"}
        >
          <Hand aria-hidden="true" />
          <span className="hidden sm:inline">Livre</span>
        </Button>
      </div>
    </div>
  );
}

/** Frames all loaded models whenever fitToken changes. */
function CameraRig() {
  const fitToken = useLab((s) => s.fitToken);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    const sceneRoot = useLab.getState().sceneRoot;
    const box = getBounds([sceneRoot]);
    const target = box ? box.getCenter(new Vector3()) : DEFAULT_TARGET.clone();
    const radius = box ? Math.max(box.getSize(new Vector3()).length() / 2, 0.01) : 5;
    if ((camera as PerspCam).isPerspectiveCamera) {
      const fov = ((camera as PerspCam).fov * Math.PI) / 180;
      const dist = (radius / Math.sin(fov / 2)) * 1.6;
      camera.position.copy(target).addScaledVector(DEFAULT_DIR, dist);
      camera.near = dist / 1000;
      camera.far = dist * 100;
    } else {
      const ortho = camera as OrthoCam;
      camera.position.copy(target).addScaledVector(DEFAULT_DIR, radius * 4);
      ortho.zoom = Math.min(size.width, size.height) / (radius * 2.4);
      ortho.near = -radius * 100;
      ortho.far = radius * 100;
    }
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, camera, controls]);
  return null;
}

export function Viewport() {
  const { showGrid, showAxes, projection } = useLab();
  const select = useLab((s) => s.select);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [freeMoveEnabled, setFreeMoveEnabled] = useState(false);
  const transformDraggingRef = useRef(false);
  const suppressClickPointerRef = useRef<number | null>(null);
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        onPointerMissed={() => select(null)}
        gl={{ antialias: true }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#14161a"]} />
        {projection === "perspective" ? (
          <PerspectiveCamera makeDefault fov={45} position={[6, 5, 6]} />
        ) : (
          <OrthographicCamera makeDefault position={[6, 5, 6]} zoom={60} />
        )}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
        <CameraRig key={projection} />
        <hemisphereLight args={["#dfe6f0", "#2a2c30", 0.6]} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Environment resolution={128}>
          <Lightformer intensity={1.5} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer
            intensity={0.8}
            position={[-5, 1, -1]}
            rotation-y={Math.PI / 2}
            scale={[20, 1, 1]}
          />
        </Environment>
        {showGrid && (
          <Grid
            infiniteGrid
            cellSize={0.1}
            sectionSize={1}
            cellColor="#2b2f36"
            sectionColor="#3d434d"
            fadeDistance={60}
            followCamera={false}
          />
        )}
        {showAxes && <axesHelper args={[1.5]} />}
        <Models
          freeMoveEnabled={freeMoveEnabled}
          transformDraggingRef={transformDraggingRef}
          suppressClickPointerRef={suppressClickPointerRef}
        />
        <SelectionHighlight />
        <SelectionTransform mode={transformMode} transformDraggingRef={transformDraggingRef} />
      </Canvas>
      <TransformToolbar
        mode={transformMode}
        onModeChange={setTransformMode}
        freeMoveEnabled={freeMoveEnabled}
        onToggleFreeMove={() => setFreeMoveEnabled((enabled) => !enabled)}
      />
    </>
  );
}
