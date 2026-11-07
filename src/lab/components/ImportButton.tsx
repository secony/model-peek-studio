import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_EXTENSIONS } from "../lib/loaders";
import { useImportFiles } from "../lib/use-import";

export function ImportButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const input = useRef<HTMLInputElement>(null);
  const importFiles = useImportFiles();
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => input.current?.click()}>
        <Upload /> Importar
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
