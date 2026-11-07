import { Box3, Mesh, Vector3, type Material, type Object3D } from "three";

export function disposeObject(root: Object3D) {
  root.removeFromParent();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: Material | undefined) => m?.dispose());
  });
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
    triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
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
