import { useState } from "react";
import {
  Box,
  ChevronRight,
  Combine,
  Eye,
  EyeOff,
  FileBox,
  Layers,
  Split,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Mesh, Object3D } from "three";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isOrganizationGroup, useLab } from "../lib/store";
import { isEffectivelyVisible } from "../lib/scene-utils";

function TreeNode({
  obj,
  depth,
  isModelRoot,
  onRemove,
}: {
  obj: Object3D;
  depth: number;
  isModelRoot: boolean;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const selected = useLab((s) => s.selected);
  const selectedObjects = useLab((s) => s.selectedObjects);
  const select = useLab((s) => s.select);
  const toggleSelection = useLab((s) => s.toggleSelection);
  const toggleObjectVisibility = useLab((s) => s.toggleObjectVisibility);
  useLab((s) => s.revision);
  const isMesh = (obj as Mesh).isMesh;
  const Icon = isModelRoot ? FileBox : isMesh ? Box : Layers;
  const hasChildren = obj.children.length > 0;
  const isSelected = selectedObjects.includes(obj);
  const isActive = selected === obj;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(obj.name);
  const renameObject = useLab((s) => s.renameObject);

  const commitName = () => {
    if (!renameObject(obj, draftName)) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }
    setEditing(false);
  };

  return (
    <li>
      <div
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1 rounded pr-1 text-xs",
          isActive
            ? "bg-primary/15 text-foreground"
            : isSelected
              ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/25"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-selected={isSelected}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey) toggleSelection(obj);
          else select(obj);
        }}
        title="Ctrl/Cmd + clique para seleção múltipla; duplo clique no nome para renomear"
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
        <Icon className={cn("size-3.5 shrink-0", isSelected && "text-primary")} />
        {editing ? (
          <input
            autoFocus
            aria-label="Nome do objeto"
            className="min-w-0 flex-1 rounded bg-background px-1 text-xs text-foreground outline-none ring-1 ring-primary"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
              } else if (event.key === "Escape") {
                setDraftName(obj.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className={cn("truncate", !isEffectivelyVisible(obj) && "opacity-50")}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDraftName(obj.name || obj.type);
              setEditing(true);
            }}
          >
            {obj.name || obj.type}
          </span>
        )}
        <div className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            className="grid size-5 place-items-center rounded hover:bg-background"
            aria-label={`${obj.visible ? "Ocultar" : "Mostrar"} ${obj.name || obj.type}`}
            aria-pressed={!obj.visible}
            title={
              obj.visible && !isEffectivelyVisible(obj)
                ? "Visível localmente, mas oculto por um ancestral"
                : obj.visible
                  ? "Ocultar objeto"
                  : "Mostrar objeto"
            }
            onClick={(e) => {
              e.stopPropagation();
              toggleObjectVisibility(obj);
            }}
          >
            {obj.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          </button>
          {onRemove && (
            <button
              className="grid size-5 place-items-center rounded hover:bg-destructive/20 hover:text-destructive"
              aria-label={isModelRoot ? "Remover modelo" : "Remover objeto"}
              title={isModelRoot ? "Remover modelo" : "Remover objeto"}
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
          {obj.children.map((c) => {
            const model = useLab.getState().models.find((candidate) => candidate.root === c);
            return (
              <TreeNode
                key={c.uuid}
                obj={c}
                depth={depth + 1}
                isModelRoot={Boolean(model)}
                onRemove={() =>
                  model
                    ? useLab.getState().removeModel(model.id)
                    : useLab.getState().removeObject(c)
                }
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function ObjectTree() {
  const models = useLab((s) => s.models);
  const sceneRoot = useLab((s) => s.sceneRoot);
  const removeModel = useLab((s) => s.removeModel);
  const selected = useLab((s) => s.selected);
  const selectedObjects = useLab((s) => s.selectedObjects);
  const canGroupSelection = useLab((s) => s.canGroupSelection);
  const groupSelection = useLab((s) => s.groupSelection);
  const ungroupSelected = useLab((s) => s.ungroupSelected);
  const canUngroup = isOrganizationGroup(selected);
  const canGroup = canGroupSelection();
  if (!models.length)
    return (
      <div className="m-3 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Nenhum objeto na cena.
        <br />
        Modelos importados aparecem aqui.
      </div>
    );
  return (
    <>
      <div className="flex items-center gap-1 border-b border-border p-2">
        <Button
          aria-label="Agrupar objetos selecionados"
          className="h-7 flex-1 px-2 text-xs"
          disabled={!canGroupSelection()}
          onClick={() => {
            if (groupSelection()) toast.success("Objetos agrupados");
            else
              toast.error("Não foi possível agrupar", {
                description:
                  "A estrutura ou as transformações não podem ser preservadas sem perda. Selecione objetos sem relação ancestral e evite combinações de rotação e escala não uniforme que criem cisalhamento.",
              });
          }}
          size="sm"
          title={
            selectedObjects.length < 2
              ? "Selecione pelo menos dois objetos"
              : canGroup
                ? `Agrupar seleção (${selectedObjects.length})`
                : "Selecione objetos da mesma cena sem relação de ancestralidade"
          }
          variant="secondary"
        >
          <Combine aria-hidden="true" />
          Agrupar
        </Button>
        <Button
          aria-label="Desagrupar grupo selecionado"
          className="h-7 flex-1 px-2 text-xs"
          disabled={!canUngroup}
          onClick={() => {
            if (ungroupSelected()) toast.success("Grupo desfeito");
            else
              toast.error("Não foi possível desagrupar", {
                description:
                  "A transformação atual dos filhos não pode ser representada sem perda ao remover o grupo.",
              });
          }}
          size="sm"
          title="Desagrupar grupo criado no laboratório"
          variant="ghost"
        >
          <Split aria-hidden="true" />
          Desagrupar
        </Button>
      </div>
      {selectedObjects.length > 1 && (
        <p className="px-3 py-1 text-[10px] text-muted-foreground" role="status">
          {canGroup
            ? `${selectedObjects.length} objetos selecionados. Prontos para agrupar.`
            : "Para agrupar, selecione objetos da cena sem incluir um objeto e seu descendente."}
        </p>
      )}
      <ul className="p-2">
        {sceneRoot.children.map((object) => {
          const model = models.find((candidate) => candidate.root === object);
          return (
            <TreeNode
              key={object.uuid}
              obj={object}
              depth={0}
              isModelRoot={Boolean(model)}
              onRemove={() =>
                model ? removeModel(model.id) : useLab.getState().removeObject(object)
              }
            />
          );
        })}
      </ul>
    </>
  );
}
