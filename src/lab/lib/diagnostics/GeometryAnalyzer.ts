import { Box3, Vector3, type BufferAttribute, type BufferGeometry, type Object3D } from "three";
import type { GeometryDetail, GeometryMetrics } from "./types";

function checkAttributeHasNaN(attr: BufferAttribute): boolean {
  const array = attr.array;
  // Sample check up to 3000 elements for performance on huge buffers, plus endpoints
  const len = array.length;
  const step = Math.max(1, Math.floor(len / 1000));
  for (let i = 0; i < len; i += step) {
    if (!Number.isFinite(array[i])) return true;
  }
  // Check last element
  if (len > 0 && !Number.isFinite(array[len - 1])) return true;
  return false;
}

export function analyzeGeometries(
  geometriesMap: Map<string, { geometry: BufferGeometry; refCount: number; objects: Object3D[] }>,
): GeometryMetrics {
  let totalVerticesStored = 0;
  let totalVerticesRendered = 0;
  let totalTriangles = 0;
  let indexedGeometriesCount = 0;
  let nonIndexedGeometriesCount = 0;
  let emptyGeometriesCount = 0;
  let degenerateGeometriesCount = 0;
  let missingNormalsCount = 0;
  let estimatedGeometryMemoryBytes = 0;

  const details: GeometryDetail[] = [];

  for (const { geometry, refCount } of geometriesMap.values()) {
    const posAttr = geometry.attributes["position"] as BufferAttribute | undefined;
    const normAttr = geometry.attributes["normal"] as BufferAttribute | undefined;
    const uvAttr = geometry.attributes["uv"] as BufferAttribute | undefined;
    const colorAttr = geometry.attributes["color"] as BufferAttribute | undefined;
    const index = geometry.index;

    const verticesStored = posAttr ? posAttr.count : 0;
    const isIndexed = index !== null && index !== undefined;

    let triangles = 0;
    let verticesUsed = 0;

    if (isIndexed) {
      indexedGeometriesCount++;
      triangles = Math.floor(index.count / 3);
      verticesUsed = index.count;
    } else {
      nonIndexedGeometriesCount++;
      triangles = Math.floor(verticesStored / 3);
      verticesUsed = verticesStored;
    }

    const hasNormals = normAttr !== undefined && normAttr.count > 0;
    const hasUvs = uvAttr !== undefined && uvAttr.count > 0;
    const hasColors = colorAttr !== undefined && colorAttr.count > 0;

    if (!hasNormals) {
      missingNormalsCount++;
    }

    const isEmpty = verticesStored === 0 || triangles === 0;
    if (isEmpty) {
      emptyGeometriesCount++;
    }

    // Check degeneration: NaNs in position, or non-empty with zero-volume when vertex count >= 4
    let isDegenerate = false;
    if (posAttr && checkAttributeHasNaN(posAttr)) {
      isDegenerate = true;
    }

    // Calculate approximate memory in bytes
    let memoryBytes = 0;
    for (const key of Object.keys(geometry.attributes)) {
      const attr = geometry.attributes[key] as BufferAttribute | undefined;
      if (attr && attr.array) {
        memoryBytes += attr.array.byteLength || attr.count * attr.itemSize * 4;
      }
    }
    if (index && index.array) {
      memoryBytes += index.array.byteLength || index.count * 2;
    }

    // Compute bounding box if not available
    let boundingBox: GeometryDetail["boundingBox"] = undefined;
    try {
      if (!geometry.boundingBox && posAttr && posAttr.count > 0) {
        geometry.computeBoundingBox();
      }
      if (geometry.boundingBox) {
        const min = geometry.boundingBox.min;
        const max = geometry.boundingBox.max;
        const size = new Vector3().subVectors(max, min);
        boundingBox = {
          min: [min.x, min.y, min.z],
          max: [max.x, max.y, max.z],
          size: [size.x, size.y, size.z],
        };

        // If bounding box has zero volume for complex mesh, it is degenerate
        if (triangles > 4 && size.x < 1e-7 && size.y < 1e-7 && size.z < 1e-7) {
          isDegenerate = true;
        }
      }
    } catch {
      // Ignore bounding box computation errors
    }

    if (isDegenerate && !isEmpty) {
      degenerateGeometriesCount++;
    }

    totalVerticesStored += verticesStored;
    totalVerticesRendered += verticesUsed * refCount;
    totalTriangles += triangles * refCount;
    estimatedGeometryMemoryBytes += memoryBytes;

    details.push({
      uuid: geometry.uuid,
      name: geometry.name || "Geometry",
      verticesStored,
      verticesUsed,
      triangles,
      isIndexed,
      hasNormals,
      hasUvs,
      hasColors,
      isEmpty,
      isDegenerate,
      referenceCount: refCount,
      memoryBytes,
      boundingBox,
    });
  }

  return {
    totalVerticesStored,
    totalVerticesRendered,
    totalTriangles,
    indexedGeometriesCount,
    nonIndexedGeometriesCount,
    emptyGeometriesCount,
    degenerateGeometriesCount,
    missingNormalsCount,
    estimatedGeometryMemoryBytes,
    details,
  };
}
