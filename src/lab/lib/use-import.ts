import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { loadModelFile, ModelLoadError } from "./loaders";
import { useLab } from "./store";
import { disposeObject } from "./scene-utils";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useImportFiles() {
  const beginImport = useLab((s) => s.beginImport);
  const addImportedModel = useLab((s) => s.addImportedModel);
  const finishImport = useLab((s) => s.finishImport);
  const controllers = useRef(new Set<AbortController>());

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
    },
    [],
  );

  return useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;

      const controller = new AbortController();
      controllers.current.add(controller);
      const operation = beginImport(controller);

      try {
        for (const file of list) {
          if (controller.signal.aborted) break;

          try {
            const { root, format } = await loadModelFile(file, controller.signal);
            const added = addImportedModel(operation, {
              id: root.uuid,
              fileName: file.name,
              format,
              fileSize: file.size,
              root,
            });

            if (!added) {
              const retainedRoots = useLab.getState().models.map((model) => model.root);
              disposeObject(root, retainedRoots);
              continue;
            }

            toast.success(`${file.name} importado`);
          } catch (error) {
            if (isAbortError(error) || controller.signal.aborted) break;
            const msg =
              error instanceof ModelLoadError
                ? error.message
                : `Erro inesperado ao ler ${file.name}.`;
            toast.error("Falha na importação", { description: msg });
          }
        }
      } finally {
        controllers.current.delete(controller);
        finishImport(operation.id);
      }
    },
    [addImportedModel, beginImport, finishImport],
  );
}
