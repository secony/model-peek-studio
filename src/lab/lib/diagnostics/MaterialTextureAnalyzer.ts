import type { Material, Object3D, Texture } from "three";
import type { MaterialDetail, MaterialTextureMetrics, TextureDetail } from "./types";

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function analyzeMaterialsAndTextures(
  materialsMap: Map<string, { material: Material; refCount: number; objects: Object3D[] }>,
  texturesMap: Map<string, { texture: Texture; refCount: number }>,
): MaterialTextureMetrics {
  const materialTypeCounts: Record<string, number> = {};
  let sharedMaterialsCount = 0;
  let sharedTexturesCount = 0;
  let missingTexturesCount = 0;
  let texturesWithNonPowerOfTwo = 0;
  let estimatedTextureMemoryBytes = 0;

  const materials: MaterialDetail[] = [];
  const textures: TextureDetail[] = [];

  // Analyze Textures
  for (const { texture, refCount } of texturesMap.values()) {
    if (refCount > 1) {
      sharedTexturesCount++;
    }

    const image = texture.image as { width?: number; height?: number } | undefined;
    const width = image?.width || 0;
    const height = image?.height || 0;

    const isPot = isPowerOfTwo(width) && isPowerOfTwo(height);
    if (!isPot && width > 0 && height > 0) {
      texturesWithNonPowerOfTwo++;
    }

    if (!image || (width === 0 && height === 0)) {
      missingTexturesCount++;
    }

    // Uncompressed RGBA8 estimate: width * height * 4 bytes
    // Mipmaps add ~33% (1/4 + 1/16 + 1/64 ...)
    const mipmapFactor = texture.generateMipmaps !== false ? 1.333 : 1.0;
    const estimatedGpuMemoryBytes = Math.round(width * height * 4 * mipmapFactor);
    estimatedTextureMemoryBytes += estimatedGpuMemoryBytes;

    textures.push({
      uuid: texture.uuid,
      name: texture.name || "Texture",
      width,
      height,
      isPowerOfTwo: isPot,
      format: (texture as any).format?.toString(),
      type: (texture as any).type?.toString(),
      wrapS: texture.wrapS,
      wrapT: texture.wrapT,
      hasMipmaps: texture.generateMipmaps !== false,
      referenceCount: refCount,
      estimatedGpuMemoryBytes,
    });
  }

  // Analyze Materials
  for (const { material, refCount } of materialsMap.values()) {
    const type = material.type || "Material";
    materialTypeCounts[type] = (materialTypeCounts[type] || 0) + 1;

    if (refCount > 1) {
      sharedMaterialsCount++;
    }

    // Collect texture map keys on material
    const textureUuids: string[] = [];
    const matObj = material as unknown as Record<string, unknown>;
    for (const key of Object.keys(matObj)) {
      const val = matObj[key];
      if (val && typeof val === "object" && (val as Record<string, unknown>)["isTexture"] === true) {
        textureUuids.push((val as Texture).uuid);
      }
    }

    materials.push({
      uuid: material.uuid,
      name: material.name || "Material",
      type,
      transparent: material.transparent,
      wireframe: (material as any).wireframe === true,
      side: material.side,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      textureMapCount: textureUuids.length,
      textureUuids,
      referenceCount: refCount,
    });
  }

  return {
    materialTypeCounts,
    sharedMaterialsCount,
    sharedTexturesCount,
    missingTexturesCount,
    texturesWithNonPowerOfTwo,
    estimatedTextureMemoryBytes,
    materials,
    textures,
  };
}
