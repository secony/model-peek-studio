import type { Object3D } from "three";
import type {
  DiagnosticFinding,
  GeometryMetrics,
  MaterialTextureMetrics,
  PerformanceMetrics,
  SceneStatistics,
  TransformMetrics,
} from "./types";

export interface RuleEvaluationContext {
  root: Object3D;
  statistics: SceneStatistics;
  geometry: GeometryMetrics;
  materialsTextures: MaterialTextureMetrics;
  transforms: TransformMetrics;
  performance?: PerformanceMetrics;
  geometriesMap: Map<string, { objects: Object3D[] }>;
  materialsMap: Map<string, { objects: Object3D[] }>;
}

export function evaluateDiagnosticRules(context: RuleEvaluationContext): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const { statistics, geometry, materialsTextures, transforms, performance, geometriesMap, materialsMap } =
    context;

  // --- 1. Geometry Rules ---

  for (const geo of geometry.details) {
    const associatedObjects = geometriesMap.get(geo.uuid)?.objects || [];
    const firstObj = associatedObjects[0];

    if (geo.isEmpty) {
      findings.push({
        id: `GEOM_EMPTY_${geo.uuid}`,
        category: "geometry",
        severity: "warning",
        title: "Geometria Vazia",
        description: `A geometria '${geo.name}' não possui vértices ou triângulos renderizáveis.`,
        objectUuid: firstObj?.uuid,
        objectName: firstObj?.name || firstObj?.type,
        resourceId: geo.uuid,
        evidence: `Vértices: ${geo.verticesStored}, Triângulos: ${geo.triangles}, Referências: ${geo.referenceCount}`,
        recommendation: "Remova a malha vazia da cena para evitar overhead inútil de renderização.",
      });
    }

    if (geo.isDegenerate) {
      findings.push({
        id: `GEOM_DEGENERATE_${geo.uuid}`,
        category: "geometry",
        severity: "critical",
        title: "Geometria Degenerada ou Inválida",
        description: `A geometria '${geo.name}' possui valores inválidos (NaN/Infinity) ou dimensões volumétricas colapsadas.`,
        objectUuid: firstObj?.uuid,
        objectName: firstObj?.name || firstObj?.type,
        resourceId: geo.uuid,
        evidence: "Valores numéricos de vértices corrompidos ou colapso dimensional detectado.",
        recommendation: "Exporte novamente o modelo ou limpe a malha em um software de modelagem 3D.",
      });
    }

    if (!geo.hasNormals && !geo.isEmpty) {
      findings.push({
        id: `GEOM_MISSING_NORMALS_${geo.uuid}`,
        category: "geometry",
        severity: "warning",
        title: "Normais Ausentes",
        description: `A geometria '${geo.name}' não possui atributo de normais de vértices.`,
        objectUuid: firstObj?.uuid,
        objectName: firstObj?.name || firstObj?.type,
        resourceId: geo.uuid,
        evidence: "Atributo 'normal' ausente na BufferGeometry.",
        recommendation: "Gere normais usando computeVertexNormals() ou habilite a exportação de normais no seu software 3D.",
      });
    }

    if (geo.triangles > 150000) {
      findings.push({
        id: `GEOM_HIGH_POLY_${geo.uuid}`,
        category: "geometry",
        severity: "info",
        title: "Alta Densidade de Polígonos",
        description: `A geometria '${geo.name}' possui densidade poligonal muito alta (${geo.triangles.toLocaleString("pt-BR")} triângulos).`,
        objectUuid: firstObj?.uuid,
        objectName: firstObj?.name || firstObj?.type,
        resourceId: geo.uuid,
        evidence: `${geo.triangles.toLocaleString("pt-BR")} triângulos em uma única geometria.`,
        recommendation: "Considere aplicar técnicas de decimação (simplificação de malha) ou geração de LOD.",
      });
    }
  }

  // --- 2. Texture & Material Rules ---

  for (const tex of materialsTextures.textures) {
    if (!tex.isPowerOfTwo && tex.width > 0 && tex.height > 0) {
      findings.push({
        id: `TEX_NON_POT_${tex.uuid}`,
        category: "textures",
        severity: "info",
        title: "Textura Não-Potência de Dois (NPOT)",
        description: `A textura '${tex.name}' possui dimensões ${tex.width}×${tex.height}, que não são potências de dois.`,
        resourceId: tex.uuid,
        evidence: `Dimensões: ${tex.width}×${tex.height}`,
        recommendation: "Redimensione para potências de dois (ex: 512×512, 1024×1024, 2048×2048) para melhor compressão e mipmapping em GPUs.",
      });
    }

    if (tex.width === 0 && tex.height === 0) {
      findings.push({
        id: `TEX_MISSING_IMAGE_${tex.uuid}`,
        category: "textures",
        severity: "warning",
        title: "Imagem de Textura Ausente ou Não Carregada",
        description: `A textura '${tex.name}' não possui dados de imagem carregados.`,
        resourceId: tex.uuid,
        evidence: "Textura com largura e altura nulas.",
        recommendation: "Verifique os caminhos dos arquivos ou a integridade do arquivo GLTF/GLB importado.",
      });
    }

    if (tex.estimatedGpuMemoryBytes > 32 * 1024 * 1024) {
      // > 32 MB
      findings.push({
        id: `TEX_HIGH_MEMORY_${tex.uuid}`,
        category: "textures",
        severity: "info",
        title: "Grande Consumo de Memória de Textura",
        description: `A textura '${tex.name}' consome aproximadamente ${(tex.estimatedGpuMemoryBytes / (1024 * 1024)).toFixed(1)} MB de VRAM na GPU.`,
        resourceId: tex.uuid,
        evidence: `Dimensões: ${tex.width}×${tex.height}, Mipmaps: ${tex.hasMipmaps ? "Sim" : "Não"}`,
        recommendation: "Avalie se a resolução é estritamente necessária ou reduza para economizar memória de vídeo.",
      });
    }
  }

  // Double-sided transparent materials warning
  for (const mat of materialsTextures.materials) {
    if (mat.transparent && mat.side === 2) {
      // 2 === THREE.DoubleSide
      const associatedObjects = materialsMap.get(mat.uuid)?.objects || [];
      const firstObj = associatedObjects[0];

      findings.push({
        id: `MAT_TRANSPARENT_DOUBLE_SIDED_${mat.uuid}`,
        category: "materials",
        severity: "warning",
        title: "Material Transparente com Face Dupla",
        description: `O material '${mat.name}' é transparente e possui renderização em face dupla (DoubleSide).`,
        objectUuid: firstObj?.uuid,
        objectName: firstObj?.name || firstObj?.type,
        resourceId: mat.uuid,
        evidence: "transparent = true e side = DoubleSide",
        recommendation: "Materiais transparentes em face dupla podem causar artefatos severos de ordenação de profundidade (alpha sorting).",
      });
    }
  }

  // --- 3. Transformation Rules ---

  for (const anomaly of transforms.details) {
    if (anomaly.issue === "nan_infinity") {
      findings.push({
        id: `TRANSFORM_NAN_${anomaly.objectUuid}`,
        category: "transformations",
        severity: "critical",
        title: "Coordenadas Corrompidas (NaN/Infinity)",
        description: anomaly.description,
        objectUuid: anomaly.objectUuid,
        objectName: anomaly.objectName,
        evidence: anomaly.evidence,
        recommendation: "Redefina a posição ou escala do objeto através do painel de propriedades para restaurar valores válidos.",
      });
    } else if (anomaly.issue === "zero_scale") {
      findings.push({
        id: `TRANSFORM_ZERO_SCALE_${anomaly.objectUuid}`,
        category: "transformations",
        severity: "warning",
        title: "Escala Nula ou Colapsada",
        description: anomaly.description,
        objectUuid: anomaly.objectUuid,
        objectName: anomaly.objectName,
        evidence: anomaly.evidence,
        recommendation: "Defina a escala para pelo menos 0.001 em todos os eixos para evitar perda de orientação e matrizes invertíveis.",
      });
    } else if (anomaly.issue === "suspect_shear") {
      findings.push({
        id: `TRANSFORM_SHEAR_${anomaly.objectUuid}`,
        category: "transformations",
        severity: "warning",
        title: "Distorção por Cisalhamento (Shear)",
        description: anomaly.description,
        objectUuid: anomaly.objectUuid,
        objectName: anomaly.objectName,
        evidence: anomaly.evidence,
        recommendation: "Evite combinar escala não-uniforme no grupo pai com rotações em objetos filhos.",
      });
    } else if (anomaly.issue === "extreme_value") {
      findings.push({
        id: `TRANSFORM_EXTREME_${anomaly.objectUuid}`,
        category: "transformations",
        severity: "info",
        title: "Transformação com Magnitude Extrema",
        description: anomaly.description,
        objectUuid: anomaly.objectUuid,
        objectName: anomaly.objectName,
        evidence: anomaly.evidence,
        recommendation: "Mantenha os objetos centralizados e próximos à origem para evitar problemas de precisão no z-buffer.",
      });
    }
  }

  // --- 4. Hierarchy & Scene Structure Rules ---

  if (statistics.maxHierarchyDepth > 15) {
    findings.push({
      id: "HIERARCHY_EXCESSIVE_DEPTH",
      category: "hierarchy",
      severity: "warning",
      title: "Hierarquia com Profundidade Excessiva",
      description: `A cena possui uma profundidade de hierarquia de ${statistics.maxHierarchyDepth} níveis.`,
      evidence: `Profundidade máxima: ${statistics.maxHierarchyDepth} níveis`,
      recommendation: "Considere nivelar nós desnecessários para reduzir custo de propagação de matrizes mundiais.",
    });
  }

  if (statistics.meshCount > 0 && statistics.distinctMaterials > statistics.meshCount * 0.9 && statistics.meshCount > 20) {
    findings.push({
      id: "SCENE_FEW_SHARED_MATERIALS",
      category: "materials",
      severity: "info",
      title: "Baixo Compartilhamento de Materiais",
      description: `Existem ${statistics.distinctMaterials} materiais distintos para ${statistics.meshCount} malhas.`,
      evidence: `Proporção de materiais distintos por malha: ${((statistics.distinctMaterials / statistics.meshCount) * 100).toFixed(0)}%`,
      recommendation: "Compartilhe materiais idênticos entre malhas para permitir melhor batching de renderização.",
    });
  }

  // --- 5. Performance Rules (if performance metrics available) ---

  if (performance && performance.drawCalls > 300) {
    findings.push({
      id: "PERF_HIGH_DRAW_CALLS",
      category: "performance",
      severity: "warning",
      title: "Alto Número de Draw Calls",
      description: `A cena está gerando ${performance.drawCalls} draw calls por quadro de renderização.`,
      evidence: `Draw calls medidas: ${performance.drawCalls}`,
      recommendation: "Mescle malhas estáticas ou utilize instanced meshes (InstancedMesh) para reduzir chamadas de renderização.",
    });
  }

  if (performance && performance.fps < 30 && performance.drawCalls > 0) {
    findings.push({
      id: "PERF_LOW_FRAMERATE",
      category: "performance",
      severity: "critical",
      title: "Taxa de Quadros Baixa",
      description: `A taxa de renderização observada é de ${performance.fps} FPS (${performance.frameTimeMs} ms/frame).`,
      evidence: `FPS médio: ${performance.fps}`,
      recommendation: "Verifique a densidade poligonal, número de luzes com sombra e quantidade de draw calls.",
    });
  }

  return findings;
}
