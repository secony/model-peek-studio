import { useCallback } from "react";
import { toast } from "sonner";
import { loadModelFile, ModelLoadError } from "./loaders";
import { useLab } from "./store";

export function useImportFiles() {
  const addModel = useLab((s) => s.addModel);
  const setLoading = useLab((s) => s.setLoading);
  return useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setLoading(true);
      for (const file of list) {
        try {
          const { root, format } = await loadModelFile(file);
          addModel({ id: root.uuid, fileName: file.name, format, fileSize: file.size, root });
          toast.success(`${file.name} importado`);
        } catch (e) {
          const msg = e instanceof ModelLoadError ? e.message : `Erro inesperado ao ler ${file.name}.`;
          toast.error("Falha na importação", { description: msg });
        }
      }
      setLoading(false);
    },
    [addModel, setLoading],
  );
}
