import { useLab } from "../lib/store";
import { formatNumber, getBounds } from "../lib/scene-utils";
import { Vector3 } from "three";

export function StatusBar() {
  const { models, projection, selected } = useLab();
  useLab((s) => s.revision);
  const box = getBounds(models.map((m) => m.root));
  const size = box?.getSize(new Vector3());
  const last = models[models.length - 1];
  return (
    <footer className="flex h-7 items-center gap-4 border-t border-border bg-panel px-3 font-mono text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-primary" /> Pronto
      </span>
      <span>{models.length} modelo(s)</span>
      {last && (
        <span className="truncate">
          {last.fileName} · {last.format.toUpperCase()}
        </span>
      )}
      {size && (
        <span>
          Cena {formatNumber(size.x)} × {formatNumber(size.y)} × {formatNumber(size.z)}
        </span>
      )}
      {selected && <span className="truncate">Sel: {selected.name || selected.type}</span>}
      <span className="ml-auto hidden md:inline">
        Orbitar: botão esq. · Mover: botão dir. · Zoom: roda
      </span>
      <span className="uppercase">{projection === "perspective" ? "Persp" : "Orto"}</span>
    </footer>
  );
}
