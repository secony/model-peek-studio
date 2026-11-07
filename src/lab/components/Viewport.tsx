import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { BoxHelper, Color, OrthographicCamera as OrthoCam, PerspectiveCamera as PerspCam, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useLab } from "../lib/store";
import { getBounds, setWireframe } from "../lib/scene-utils";

const DEFAULT_TARGET = new Vector3(0, 0, 0);
const DEFAULT_DIR = new Vector3(1, 0.8, 1).normalize();

function Models() {
  const models = useLab((s) => s.models);
  const wireframe = useLab((s) => s.wireframe);
  const select = useLab((s) => s.select);
  useEffect(() => setWireframe(models.map((m) => m.root), wireframe), [models, wireframe]);
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
      helper.current = null;
    };
  }, [selected, scene]);
  useFrame(() => helper.current?.update());
  return null;
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
  return (
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
      <directionalLight position={[8, 12, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <Environment resolution={128}>
        <Lightformer intensity={1.5} position={[0, 5, 0]} scale={[10, 10, 1]} />
        <Lightformer intensity={0.8} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
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
    </Canvas>
  );
}
