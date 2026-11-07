import { useState } from "react";
import { Box, ChevronRight, Eye, EyeOff, FileBox, Layers, Trash2 } from "lucide-react";
import type { Mesh, Object3D } from "three";
import { cn } from "@/lib/utils";
import { useLab } from "../lib/store";

function TreeNode({
  obj,
  depth,
  onRemove,
}: {
  obj: Object3D;
  depth: number;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  const touch = useLab((s) => s.touch);
  useLab((s) => s.revision);
  const isMesh = (obj as Mesh).isMesh;
  const Icon = depth === 0 ? FileBox : isMesh ? Box : Layers;
  const hasChildren = obj.children.length > 0;
  return (
    <li>
      <div
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1 rounded pr-1 text-xs",
          selected === obj
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => select(obj)}
      >
        <button
          className={cn("grid size-4 place-items-center", !hasChildren && "invisible")}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          aria-label={open ? "Recolher" : "Expandir"}
        >
          <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        </button>
        <Icon className={cn("size-3.5 shrink-0", selected === obj && "text-primary")} />
        <span className={cn("truncate", !obj.visible && "opacity-50")}>{obj.name || obj.type}</span>
        <div className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            className="grid size-5 place-items-center rounded hover:bg-background"
            aria-label="Alternar visibilidade"
            onClick={(e) => {
              e.stopPropagation();
              obj.visible = !obj.visible;
              touch();
            }}
          >
            {obj.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          </button>
          {onRemove && (
            <button
              className="grid size-5 place-items-center rounded hover:bg-destructive/20 hover:text-destructive"
              aria-label="Remover modelo"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      {open && hasChildren && (
        <ul>
          {obj.children.map((c) => (
            <TreeNode key={c.uuid} obj={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ObjectTree() {
  const models = useLab((s) => s.models);
  const removeModel = useLab((s) => s.removeModel);
  if (!models.length)
    return (
      <div className="m-3 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Nenhum objeto na cena.
        <br />
        Modelos importados aparecem aqui.
      </div>
    );
  return (
    <ul className="p-2">
      {models.map((m) => (
        <TreeNode key={m.id} obj={m.root} depth={0} onRemove={() => removeModel(m.id)} />
      ))}
    </ul>
  );
}
