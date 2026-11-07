import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export type ModelFormat = "glb" | "gltf" | "stl";
export const ACCEPTED_EXTENSIONS = [".glb", ".gltf", ".stl"];

export class ModelLoadError extends Error {}

export function detectFormat(fileName: string): ModelFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "glb" || ext === "gltf" || ext === "stl" ? ext : null;
}

async function parseGltf(data: ArrayBuffer | string): Promise<Object3D> {
  const gltf = await new GLTFLoader().parseAsync(data, "");
  return gltf.scene;
}

function assertSelfContainedGltf(text: string) {
  let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ModelLoadError("O arquivo .gltf não é um JSON válido.");
  }
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some(
    (r) => r.uri && !r.uri.startsWith("data:"),
  );
  if (external)
    throw new ModelLoadError(
      "Este .gltf referencia arquivos externos (.bin ou texturas) que o navegador não consegue acessar. Exporte como .glb autocontido.",
    );
}

function parseStl(buffer: ArrayBuffer): Object3D {
  const geometry = new STLLoader().parse(buffer);
  if (!geometry.attributes.position?.count) throw new ModelLoadError("O STL não contém geometria.");
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.2, roughness: 0.55 }),
  );
  mesh.name = "Malha STL";
  return mesh;
}

/** Parses a local file into a wrapper group, resting on the ground and centered on XZ. */
export async function loadModelFile(file: File): Promise<{ root: Group; format: ModelFormat }> {
  const format = detectFormat(file.name);
  if (!format)
    throw new ModelLoadError(`Formato não suportado: "${file.name}". Use .glb, .gltf ou .stl.`);

  let content: Object3D;
  try {
    if (format === "gltf") {
      const text = await file.text();
      assertSelfContainedGltf(text);
      content = await parseGltf(text);
    } else {
      const buffer = await file.arrayBuffer();
      content = format === "glb" ? await parseGltf(buffer) : parseStl(buffer);
    }
  } catch (e) {
    if (e instanceof ModelLoadError) throw e;
    throw new ModelLoadError(
      `Não foi possível ler "${file.name}". O arquivo pode estar corrompido ou não ser um ${format.toUpperCase()} válido.`,
    );
  }

  content.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  const root = new Group();
  root.name = file.name.replace(/\.[^.]+$/, "");
  root.add(content);

  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) throw new ModelLoadError("O arquivo foi lido, mas não contém objetos visíveis.");
  const center = box.getCenter(new Vector3());
  content.position.sub(new Vector3(center.x, box.min.y, center.z));
  return { root, format };
}
