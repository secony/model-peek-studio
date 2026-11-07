import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { disposeObject } from "./scene-utils";

export type ModelFormat = "glb" | "gltf" | "stl";
export const ACCEPTED_EXTENSIONS = [".glb", ".gltf", ".stl"];

export class ModelLoadError extends Error {}

export function detectFormat(fileName: string): ModelFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "glb" || ext === "gltf" || ext === "stl" ? ext : null;
}

function createAbortError(): DOMException {
  return new DOMException("A importação foi cancelada.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function readFile(file: File, signal: AbortSignal | undefined, kind: "text"): Promise<string>;
function readFile(
  file: File,
  signal: AbortSignal | undefined,
  kind: "arrayBuffer",
): Promise<ArrayBuffer>;
function readFile(
  file: File,
  signal: AbortSignal | undefined,
  kind: "text" | "arrayBuffer",
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const reader = new FileReader();
    let settled = false;

    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      settle(() => reject(createAbortError()));
    };

    reader.onload = () => {
      const result = reader.result;
      if (kind === "text") {
        if (typeof result !== "string") {
          settle(() => reject(new Error("Formato de leitura de arquivo inesperado.")));
          return;
        }
        settle(() => resolve(result));
        return;
      }

      if (!(result instanceof ArrayBuffer)) {
        settle(() => reject(new Error("Formato de leitura de arquivo inesperado.")));
        return;
      }
      settle(() => resolve(result));
    };
    reader.onerror = () =>
      settle(() => reject(reader.error ?? new Error("Falha ao ler o arquivo.")));
    reader.onabort = () => settle(() => reject(createAbortError()));
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      if (signal?.aborted) {
        onAbort();
      } else if (kind === "text") {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

async function parseGltf(data: ArrayBuffer | string, signal?: AbortSignal): Promise<Object3D> {
  throwIfAborted(signal);
  const gltf = await new GLTFLoader().parseAsync(data, "");
  if (signal?.aborted) {
    disposeObject(gltf.scene);
    throw createAbortError();
  }
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
  let material: MeshStandardMaterial | undefined;
  try {
    if (!geometry.attributes["position"]?.count) {
      throw new ModelLoadError("O STL não contém geometria.");
    }
    geometry.computeVertexNormals();
    material = new MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.2, roughness: 0.55 });
    const mesh = new Mesh(geometry, material);
    mesh.name = "Malha STL";
    return mesh;
  } catch (error) {
    geometry.dispose();
    material?.dispose();
    throw error;
  }
}

/** Parses a local file into a wrapper group, resting on the ground and centered on XZ. */
export async function loadModelFile(
  file: File,
  signal?: AbortSignal,
): Promise<{ root: Group; format: ModelFormat }> {
  throwIfAborted(signal);
  const format = detectFormat(file.name);
  if (!format)
    throw new ModelLoadError(`Formato não suportado: "${file.name}". Use .glb, .gltf ou .stl.`);

  let content: Object3D;
  try {
    if (format === "gltf") {
      const text = await readFile(file, signal, "text");
      assertSelfContainedGltf(text);
      content = await parseGltf(text, signal);
    } else {
      const buffer = await readFile(file, signal, "arrayBuffer");
      throwIfAborted(signal);
      content = format === "glb" ? await parseGltf(buffer, signal) : parseStl(buffer);
    }
  } catch (error) {
    if (
      error instanceof ModelLoadError ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error;
    }
    throw new ModelLoadError(
      `Não foi possível ler "${file.name}". O arquivo pode estar corrompido ou não ser um ${format.toUpperCase()} válido.`,
    );
  }

  let root: Group | undefined;
  try {
    throwIfAborted(signal);
    content.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    root = new Group();
    root.name = file.name.replace(/\.[^.]+$/, "");
    root.add(content);

    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) {
      throw new ModelLoadError("O arquivo foi lido, mas não contém objetos visíveis.");
    }
    const center = box.getCenter(new Vector3());
    content.position.sub(new Vector3(center.x, box.min.y, center.z));
    throwIfAborted(signal);
    return { root, format };
  } catch (error) {
    disposeObject(root ?? content);
    throw error;
  }
}
