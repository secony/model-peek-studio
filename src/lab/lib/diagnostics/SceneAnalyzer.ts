import {
  Camera,
  Group,
  Light,
  Mesh,
  Object3D,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import type { SceneStatistics } from "./types";

function extractTexturesFromMaterial(material: Material, textures: Set<Texture>) {
  const seen = new WeakSet<object>([material]);

  function scan(value: unknown) {
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (obj["isTexture"] === true) {
      textures.add(value as Texture);
      return;
    }
    if (seen.has(obj)) return;
    seen.add(obj);

    if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null
    ) {
      Object.values(obj).forEach(scan);
    }
  }

  Object.values(material).forEach(scan);
}

export function analyzeScene(root: Object3D): {
  statistics: SceneStatistics;
  geometriesMap: Map<string, { geometry: BufferGeometry; refCount: number; objects: Object3D[] }>;
  materialsMap: Map<string, { material: Material; refCount: number; objects: Object3D[] }>;
  texturesMap: Map<string, { texture: Texture; refCount: number }>;
} {
  let totalObjects = 0;
  const typeCounts: Record<string, number> = {};
  let meshCount = 0;
  let groupCount = 0;
  let lightCount = 0;
  let cameraCount = 0;
  let visibleCount = 0;
  let hiddenCount = 0;
  let maxHierarchyDepth = 0;

  const geometriesMap = new Map<
    string,
    { geometry: BufferGeometry; refCount: number; objects: Object3D[] }
  >();
  const materialsMap = new Map<
    string,
    { material: Material; refCount: number; objects: Object3D[] }
  >();
  const texturesMap = new Map<string, { texture: Texture; refCount: number }>();

  let geometryReferences = 0;
  let materialReferences = 0;
  let textureReferences = 0;

  function traverseNode(node: Object3D, depth: number) {
    totalObjects++;
    maxHierarchyDepth = Math.max(maxHierarchyDepth, depth);

    const type = node.type || "Object3D";
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    if (node.visible) {
      visibleCount++;
    } else {
      hiddenCount++;
    }

    if (node instanceof Mesh || (node as Mesh).isMesh) {
      meshCount++;
      const mesh = node as Mesh;
      if (mesh.geometry && mesh.geometry.isBufferGeometry) {
        geometryReferences++;
        const geo = mesh.geometry;
        const entry = geometriesMap.get(geo.uuid) || {
          geometry: geo,
          refCount: 0,
          objects: [],
        };
        entry.refCount++;
        entry.objects.push(node);
        geometriesMap.set(geo.uuid, entry);
      }

      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!mat) continue;
          materialReferences++;
          const entry = materialsMap.get(mat.uuid) || {
            material: mat,
            refCount: 0,
            objects: [],
          };
          entry.refCount++;
          entry.objects.push(node);
          materialsMap.set(mat.uuid, entry);

          const matTextures = new Set<Texture>();
          extractTexturesFromMaterial(mat, matTextures);
          for (const tex of matTextures) {
            textureReferences++;
            const texEntry = texturesMap.get(tex.uuid) || { texture: tex, refCount: 0 };
            texEntry.refCount++;
            texturesMap.set(tex.uuid, texEntry);
          }
        }
      }
    } else if (node instanceof Group || (node as Group).isGroup) {
      groupCount++;
    } else if (node instanceof Light || (node as Light).isLight) {
      lightCount++;
    } else if (node instanceof Camera || (node as Camera).isCamera) {
      cameraCount++;
    }

    for (const child of node.children) {
      traverseNode(child, depth + 1);
    }
  }

  // If root has children, traverse from root (depth 0)
  traverseNode(root, 0);

  const statistics: SceneStatistics = {
    totalObjects,
    typeCounts,
    meshCount,
    groupCount,
    lightCount,
    cameraCount,
    visibleCount,
    hiddenCount,
    maxHierarchyDepth,
    distinctGeometries: geometriesMap.size,
    geometryReferences,
    distinctMaterials: materialsMap.size,
    materialReferences,
    distinctTextures: texturesMap.size,
    textureReferences,
  };

  return {
    statistics,
    geometriesMap,
    materialsMap,
    texturesMap,
  };
}
