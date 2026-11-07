import {
  Box3,
  Mesh,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";

interface DisposableResources {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
  textures: Set<Texture>;
}

function collectMaterialTextures(value: unknown, textures: Set<Texture>, seen: WeakSet<object>) {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (object["isTexture"] === true) {
    textures.add(value as Texture);
    return;
  }
  if (seen.has(object)) return;
  seen.add(object);

  // Material properties and shader uniforms git diff -- src/lab/lib/store.test.tsmay contain textures in nested objects or arrays.
  if (Array.isArray(value)) {
    value.forEach((item) => collectMaterialTextures(item, textures, seen));
  } else if (
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null
  ) {
    Object.values(object).forEach((item) => collectMaterialTextures(item, textures, seen));
  }
}

function collectResources(roots: Object3D[]): DisposableResources {
  const resources: DisposableResources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };

  roots.forEach((root) =>
    root.traverse((object) => {
      const candidate = object as Object3D & {
        geometry?: BufferGeometry;
        material?: Material | Material[];
      };
      if (candidate.geometry?.isBufferGeometry) resources.geometries.add(candidate.geometry);
      if (!candidate.material) return;

      const materials = Array.isArray(candidate.material)
        ? candidate.material
        : [candidate.material];
      materials.forEach((material) => {
        resources.materials.add(material);
        const seen = new WeakSet<object>([material]);
        Object.values(material).forEach((value) =>
          collectMaterialTextures(value, resources.textures, seen),
        );
      });
    }),
  );

  return resources;
}

function disposeResources(resources: DisposableResources, retained?: DisposableResources) {
  resources.geometries.forEach((geometry) => {
    if (!retained?.geometries.has(geometry)) geometry.dispose();
  });
  resources.materials.forEach((material) => {
    if (!retained?.materials.has(material)) material.dispose();
  });
  resources.textures.forEach((texture) => {
    if (!retained?.textures.has(texture)) texture.dispose();
  });
}

/** Removes multiple subtrees and disposes their shared resources once. */
export function disposeObjects(roots: Object3D[]) {
  const resources = collectResources(roots);
  roots.forEach((root) => root.removeFromParent());
  disposeResources(resources);
}

/** Removes a subtree and disposes its resources unless they are still used by retained roots. */
export function disposeObject(root: Object3D, retainedRoots: Object3D[] = []) {
  const resources = collectResources([root]);
  const retained = collectResources(retainedRoots);
  root.removeFromParent();
  disposeResources(resources, retained);
}

export function getBounds(objects: Object3D[]): Box3 | null {
  const box = new Box3();
  objects.forEach((o) => {
    o.updateWorldMatrix(true, true);
    box.expandByObject(o);
  });
  return box.isEmpty() ? null : box;
}

export function getSize(o: Object3D): Vector3 | null {
  const b = getBounds([o]);
  return b ? b.getSize(new Vector3()) : null;
}

export function countStats(o: Object3D) {
  let meshes = 0;
  let triangles = 0;
  o.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh || !m.geometry) return;
    meshes++;
    const g = m.geometry;
    triangles += (g.index ? g.index.count : (g.attributes["position"]?.count ?? 0)) / 3;
  });
  return { meshes, triangles: Math.round(triangles) };
}

export function setWireframe(objects: Object3D[], on: boolean) {
  objects.forEach((root) =>
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        if (mat && "wireframe" in mat) (mat as Material & { wireframe: boolean }).wireframe = on;
      });
    }),
  );
}

export function formatNumber(n: number, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}
