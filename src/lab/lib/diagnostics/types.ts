import type { Object3D } from "three";

export type DiagnosticSeverity = "critical" | "warning" | "info";

export type DiagnosticCategory =
  | "geometry"
  | "materials"
  | "textures"
  | "transformations"
  | "hierarchy"
  | "performance"
  | "scene_structure";

export interface DiagnosticFinding {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  description: string;
  objectUuid?: string;
  objectName?: string;
  evidence?: string;
  recommendation?: string;
  resourceId?: string;
}

export interface SceneStatistics {
  totalObjects: number;
  typeCounts: Record<string, number>;
  meshCount: number;
  groupCount: number;
  lightCount: number;
  cameraCount: number;
  visibleCount: number;
  hiddenCount: number;
  maxHierarchyDepth: number;
  distinctGeometries: number;
  geometryReferences: number;
  distinctMaterials: number;
  materialReferences: number;
  distinctTextures: number;
  textureReferences: number;
}

export interface GeometryDetail {
  uuid: string;
  name: string;
  verticesStored: number;
  verticesUsed: number;
  triangles: number;
  isIndexed: boolean;
  hasNormals: boolean;
  hasUvs: boolean;
  hasColors: boolean;
  isEmpty: boolean;
  isDegenerate: boolean;
  referenceCount: number;
  memoryBytes: number;
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
}

export interface GeometryMetrics {
  totalVerticesStored: number;
  totalVerticesRendered: number;
  totalTriangles: number;
  indexedGeometriesCount: number;
  nonIndexedGeometriesCount: number;
  emptyGeometriesCount: number;
  degenerateGeometriesCount: number;
  missingNormalsCount: number;
  estimatedGeometryMemoryBytes: number;
  details: GeometryDetail[];
}

export interface TextureDetail {
  uuid: string;
  name: string;
  width: number;
  height: number;
  isPowerOfTwo: boolean;
  format?: string;
  type?: string;
  wrapS?: number;
  wrapT?: number;
  hasMipmaps: boolean;
  referenceCount: number;
  estimatedGpuMemoryBytes: number;
}

export interface MaterialDetail {
  uuid: string;
  name: string;
  type: string;
  transparent: boolean;
  wireframe: boolean;
  side: number;
  depthTest: boolean;
  depthWrite: boolean;
  textureMapCount: number;
  textureUuids: string[];
  referenceCount: number;
}

export interface MaterialTextureMetrics {
  materialTypeCounts: Record<string, number>;
  sharedMaterialsCount: number;
  sharedTexturesCount: number;
  missingTexturesCount: number;
  texturesWithNonPowerOfTwo: number;
  estimatedTextureMemoryBytes: number;
  materials: MaterialDetail[];
  textures: TextureDetail[];
}

export interface TransformAnomalyDetail {
  objectUuid: string;
  objectName: string;
  issue: "nan_infinity" | "zero_scale" | "suspect_shear" | "extreme_value";
  description: string;
  evidence: string;
}

export interface TransformMetrics {
  anomalousTransformsCount: number;
  nanInfinityCount: number;
  zeroScaleCount: number;
  shearSuspectCount: number;
  extremeValueCount: number;
  details: TransformAnomalyDetail[];
}

export interface PerformanceMetrics {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  renderedTriangles: number;
  renderedPoints: number;
  renderedLines: number;
  glGeometries: number;
  glTextures: number;
  shaderPrograms?: number;
  lastSampleTimestamp: number;
}

export interface FullDiagnosticReport {
  timestamp: number;
  sceneRevision: number;
  statistics: SceneStatistics;
  geometry: GeometryMetrics;
  materialsTextures: MaterialTextureMetrics;
  transforms: TransformMetrics;
  performance: PerformanceMetrics;
  findings: DiagnosticFinding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
}
