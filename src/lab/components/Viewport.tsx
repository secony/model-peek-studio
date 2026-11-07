import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  TransformControls,
} from "@react-three/drei";
import { Move3D, Rotate3D, Scaling } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BoxHelper,
  Color,
  OrthographicCamera as OrthoCam,
  PerspectiveCamera as PerspCam,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useLab } from "../lib/store";
import { getBounds, setWireframe } from "../lib/scene-utils";

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

function Models() {
  const models = useLab((s) => s.models);
  const wireframe = useLab((s) => s.wireframe);
  const select = useLab((s) => s.select);
  useEffect(
    () =>
      setWireframe(
        models.map((m) => m.root),
        wireframe,
      ),
    [models, wireframe],
  );
  return (
    <>
      {models.map((m) => (
        <primitive
          key={m.id}
          object={m.root}
          onClick={(e: { stopPropagation: () => void; object: import("three").Object3D }) => {
            e.stopPropagation();
            select(e.object);
          }}
        />
      ))}
    </>
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

export function SelectionTransform({ mode }: { mode: TransformMode }) {
  const selected = useLab((s) => s.selected);
  const touch = useLab((s) => s.touch);

  if (!selected) return null;

  return <TransformControls object={selected} mode={mode} onMouseUp={touch} />;
}

export function TransformToolbar({
  mode,
  onModeChange,
}: {
  mode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
}) {
  const hasSelection = useLab((s) => s.selected !== null);

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
    const models = useLab.getState().models;
    const box = getBounds(models.map((m) => m.root));
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
  return (
    <>
      <Canvas shadows dpr={[1, 2]} onPointerMissed={() => select(null)} gl={{ antialias: true }}>
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
        <Models />
        <SelectionHighlight />
        <SelectionTransform mode={transformMode} />
      </Canvas>
      <TransformToolbar mode={transformMode} onModeChange={setTransformMode} />
    </>
  );
}
