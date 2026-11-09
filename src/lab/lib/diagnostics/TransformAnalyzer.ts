import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import type { TransformAnomalyDetail, TransformMetrics } from "./types";

const EXTREME_POSITION_THRESHOLD = 5000;
const EXTREME_SCALE_HIGH_THRESHOLD = 1000;
const EXTREME_SCALE_LOW_THRESHOLD = 1e-4;

function hasNonFiniteVector(v: Vector3): boolean {
  return !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z);
}

function hasNonFiniteQuaternion(q: Quaternion): boolean {
  return !Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.z) || !Number.isFinite(q.w);
}

function hasNonFiniteMatrix(m: Matrix4): boolean {
  return m.elements.some((el) => !Number.isFinite(el));
}

/**
 * Checks whether matrix is an exact TRS (Translation-Rotation-Scale) matrix
 * without shear deformation.
 */
function isExactTrsMatrix(matrix: Matrix4): boolean {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const recomposed = new Matrix4();

  matrix.decompose(position, quaternion, scale);
  recomposed.compose(position, quaternion, scale);

  return matrix.elements.every((value, index) => {
    const recomposedValue = recomposed.elements[index];
    return recomposedValue !== undefined && Math.abs(value - recomposedValue) < 1e-4;
  });
}

export function analyzeTransforms(root: Object3D): TransformMetrics {
  const details: TransformAnomalyDetail[] = [];
  let nanInfinityCount = 0;
  let zeroScaleCount = 0;
  let shearSuspectCount = 0;
  let extremeValueCount = 0;

  root.traverse((object) => {
    // 1. Check NaN / Infinity
    const hasNaN =
      hasNonFiniteVector(object.position) ||
      hasNonFiniteVector(object.scale) ||
      hasNonFiniteQuaternion(object.quaternion) ||
      hasNonFiniteMatrix(object.matrix) ||
      hasNonFiniteMatrix(object.matrixWorld);

    if (hasNaN) {
      nanInfinityCount++;
      details.push({
        objectUuid: object.uuid,
        objectName: object.name || object.type,
        issue: "nan_infinity",
        description: "Objeto possui coordenadas NaN ou Infinity em sua transformação.",
        evidence: `pos: [${object.position.x}, ${object.position.y}, ${object.position.z}], scl: [${object.scale.x}, ${object.scale.y}, ${object.scale.z}]`,
      });
      return; // Skip further checks if corrupted with NaN
    }

    // 2. Check scale close to zero
    const isZeroScale =
      Math.abs(object.scale.x) < EXTREME_SCALE_LOW_THRESHOLD ||
      Math.abs(object.scale.y) < EXTREME_SCALE_LOW_THRESHOLD ||
      Math.abs(object.scale.z) < EXTREME_SCALE_LOW_THRESHOLD;

    if (isZeroScale) {
      zeroScaleCount++;
      details.push({
        objectUuid: object.uuid,
        objectName: object.name || object.type,
        issue: "zero_scale",
        description: "Objeto possui escala igual ou próxima a zero em um ou mais eixos.",
        evidence: `escala: [${object.scale.x.toFixed(5)}, ${object.scale.y.toFixed(5)}, ${object.scale.z.toFixed(5)}]`,
      });
    }

    // 3. Check shear deformation (due to non-uniform parent scale + rotation)
    if (object.parent && object.parent !== root) {
      object.updateWorldMatrix(true, false);
      if (!isExactTrsMatrix(object.matrixWorld)) {
        shearSuspectCount++;
        details.push({
          objectUuid: object.uuid,
          objectName: object.name || object.type,
          issue: "suspect_shear",
          description: "Distorção por cisalhamento (shear) detectada na matriz de mundo do objeto.",
          evidence: "Matriz decomposta não recombina ortogonalmente devido a escala não-uniforme combinada a rotação em ancestrais.",
        });
      }
    }

    // 4. Extreme values
    const isExtremePosition =
      Math.abs(object.position.x) > EXTREME_POSITION_THRESHOLD ||
      Math.abs(object.position.y) > EXTREME_POSITION_THRESHOLD ||
      Math.abs(object.position.z) > EXTREME_POSITION_THRESHOLD;

    const isExtremeScaleHigh =
      Math.abs(object.scale.x) > EXTREME_SCALE_HIGH_THRESHOLD ||
      Math.abs(object.scale.y) > EXTREME_SCALE_HIGH_THRESHOLD ||
      Math.abs(object.scale.z) > EXTREME_SCALE_HIGH_THRESHOLD;

    if (isExtremePosition || isExtremeScaleHigh) {
      extremeValueCount++;
      details.push({
        objectUuid: object.uuid,
        objectName: object.name || object.type,
        issue: "extreme_value",
        description: "Transformação com magnitude extrema que pode causar perda de precisão z-buffer ou artefatos visuais.",
        evidence: `pos: [${object.position.x.toFixed(1)}, ${object.position.y.toFixed(1)}, ${object.position.z.toFixed(1)}], scl: [${object.scale.x.toFixed(1)}, ${object.scale.y.toFixed(1)}, ${object.scale.z.toFixed(1)}]`,
      });
    }
  });

  return {
    anomalousTransformsCount: details.length,
    nanInfinityCount,
    zeroScaleCount,
    shearSuspectCount,
    extremeValueCount,
    details,
  };
}
