import { useEffect, useState } from "react";
import { Box, Globe, MousePointerClick } from "lucide-react";
import { MathUtils, type Object3D } from "three";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getModelOwnerId, useLab } from "../lib/store";
import type { CoordinateSpace } from "../lib/store";
import { countStats, formatBytes, formatNumber, getSize } from "../lib/scene-utils";
import { getObjectTransform } from "../lib/transform/math";

type Vec = "position" | "rotation" | "scale";
const AXES = ["x", "y", "z"] as const;
const AXIS_CLASS = { x: "text-axis-x", y: "text-axis-y", z: "text-axis-z" };

function NumberField({
  value,
  onCommit,
  axis,
  allowZero = true,
}: {
  value: number;
  onCommit: (v: number) => void;
  axis: (typeof AXES)[number];
  allowZero?: boolean;
}) {
  const [text, setText] = useState(formatNumber(value, 3));
  useEffect(() => setText(formatNumber(value, 3)), [value]);

  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v)) {
      if (!allowZero && Math.abs(v) < 1e-4) {
        setText(formatNumber(value, 3));
        return;
      }
      onCommit(v);
      setText(formatNumber(v, 3));
    } else {
      setText(formatNumber(value, 3));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commit();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setText(formatNumber(value, 3));
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase ${AXIS_CLASS[axis]}`}
      >
        {axis}
      </span>
      <Input
        className="h-7 pl-5 pr-1 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

function VectorRow({
  obj,
  prop,
  label,
  space,
}: {
  obj: Object3D;
  prop: Vec;
  label: string;
  space: CoordinateSpace;
}) {
  const setObjectTransform = useLab((s) => s.setObjectTransform);
  const isRot = prop === "rotation";
  const isScale = prop === "scale";
  const transform = getObjectTransform(obj, space);

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((a) => {
          const val =
            prop === "position"
              ? transform.position[a]
              : isRot
                ? transform.rotationDegrees[a]
                : transform.scale[a];

          return (
            <NumberField
              key={a}
              axis={a}
              value={val}
              allowZero={!isScale}
              onCommit={(v) => {
                setObjectTransform(
                  obj,
                  prop,
                  a,
                  isRot ? MathUtils.degToRad(v) : v,
                  space,
                );
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PropertiesPanel() {
  const selected = useLab((s) => s.selected);
  const renameObject = useLab((s) => s.renameObject);
  const models = useLab((s) => s.models);
  const revision = useLab((s) => s.revision);
  const coordinateSpace = useLab((s) => s.coordinateSpace);
  const setCoordinateSpace = useLab((s) => s.setCoordinateSpace);

  if (!selected)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MousePointerClick className="size-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Selecione um objeto na viewport ou na hierarquia para ver e editar suas propriedades.
        </p>
      </div>
    );

  const model =
    models.find((candidate) => candidate.id === getModelOwnerId(selected)) ??
    models.find((m) => {
      let inside = false;
      m.root.traverse((o) => (inside ||= o === selected));
      return inside;
    });
  const size = getSize(selected);
  const stats = countStats(selected);

  return (
    <div>
      <Section title="Objeto">
        <Input
          key={`${selected.uuid}-${revision}`}
          className="h-7 text-xs"
          defaultValue={selected.name}
          placeholder={selected.type}
          onBlur={(e) => {
            renameObject(selected, e.target.value);
            e.target.value = selected.name;
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <p className="font-mono text-[11px] text-muted-foreground">{selected.type}</p>
      </Section>

      <Section
        title="Transformação"
        action={
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground"
            onClick={() => setCoordinateSpace(coordinateSpace === "local" ? "world" : "local")}
            title={`Alternar para coordenadas ${coordinateSpace === "local" ? "Globais" : "Locais"}`}
          >
            {coordinateSpace === "local" ? (
              <Box className="mr-1 size-3" />
            ) : (
              <Globe className="mr-1 size-3 text-primary" />
            )}
            {coordinateSpace === "local" ? "Local" : "Global"}
          </Button>
        }
      >
        <VectorRow
          key={`pos-${selected.uuid}-${revision}-${coordinateSpace}`}
          obj={selected}
          prop="position"
          label={coordinateSpace === "world" ? "Posição (Global)" : "Posição"}
          space={coordinateSpace}
        />
        <VectorRow
          key={`rot-${selected.uuid}-${revision}-${coordinateSpace}`}
          obj={selected}
          prop="rotation"
          label={coordinateSpace === "world" ? "Rotação (graus, Global)" : "Rotação (graus)"}
          space={coordinateSpace}
        />
        <VectorRow
          key={`scl-${selected.uuid}-${revision}-${coordinateSpace}`}
          obj={selected}
          prop="scale"
          label={coordinateSpace === "world" ? "Escala (Global)" : "Escala"}
          space={coordinateSpace}
        />
      </Section>

      <Section title="Dimensões (bounding box)">
        {size ? (
          <dl className="grid grid-cols-3 gap-1.5 font-mono text-xs">
            {AXES.map((a) => (
              <div key={a} className="rounded bg-muted px-2 py-1">
                <dt className={`text-[10px] uppercase ${AXIS_CLASS[a]}`}>{a}</dt>
                <dd className="text-foreground">{formatNumber(size[a])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">Sem geometria.</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {stats.meshes} malha(s) · {stats.triangles.toLocaleString("pt-BR")} triângulos · unidades
          da cena
        </p>
      </Section>
      {model && (
        <Section title="Arquivo">
          <dl className="space-y-1 text-xs">
            {[
              ["Nome", model.fileName],
              ["Formato", model.format.toUpperCase()],
              ["Tamanho", formatBytes(model.fileSize)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </div>
  );
}
