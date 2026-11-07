import { useState, type ReactNode } from "react";
import { FileUp } from "lucide-react";
import { useImportFiles } from "../lib/use-import";

/** Wraps an area to accept dropped model files. */
export function DropZone({ children }: { children: ReactNode }) {
  const [over, setOver] = useState(false);
  const importFiles = useImportFiles();
  return (
    <div
      className="relative h-full w-full"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary bg-background/70 backdrop-blur-sm">
          <FileUp className="size-10 text-primary" />
          <p className="font-mono text-sm text-foreground">Solte para importar .glb · .gltf · .stl</p>
        </div>
      )}
    </div>
  );
}
