import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { MathUtils, type Object3D } from "three";
import { Input } from "@/components/ui/input";
import { getModelOwnerId, useLab } from "../lib/store";
import { countStats, formatBytes, formatNumber, getSize } from "../lib/scene-utils";

type Vec = "position" | "rotation" | "scale";
const AXES = ["x", "y", "z"] as const;
const AXIS_CLASS = { x: "text-axis-x", y: "text-axis-y", z: "text-axis-z" };

function NumberField({
  value,
  onCommit,
  axis,
}: {
  value: number;
  onCommit: (v: number) => void;
  axis: (typeof AXES)[number];
}) {
  const [text, setText] = useState(formatNumber(value, 3));
  useEffect(() => setText(formatNumber(value, 3)), [value]);
  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v)) onCommit(v);
    else setText(formatNumber(value, 3));
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
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

function VectorRow({ obj, prop, label }: { obj: Object3D; prop: Vec; label: string }) {
  const touch = useLab((s) => s.touch);
  const isRot = prop === "rotation";
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {AXES.map((a) => (
          <NumberField
            key={a}
            axis={a}
            value={isRot ? MathUtils.radToDeg(obj.rotation[a]) : obj[prop][a]}
            onCommit={(v) => {
              obj[prop][a] = isRot ? MathUtils.degToRad(v) : v;
              touch();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border p-3">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function PropertiesPanel() {
  const selected = useLab((s) => s.selected);
  const models = useLab((s) => s.models);
  const touch = useLab((s) => s.touch);
  useLab((s) => s.revision);

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
          key={selected.uuid}
          className="h-7 text-xs"
          defaultValue={selected.name}
          placeholder={selected.type}
          onBlur={(e) => {
            selected.name = e.target.value;
            touch();
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <p className="font-mono text-[11px] text-muted-foreground">{selected.type}</p>
      </Section>
      <Section title="Transformação">
        <VectorRow obj={selected} prop="position" label="Posição" />
        <VectorRow obj={selected} prop="rotation" label="Rotação (graus)" />
        <VectorRow obj={selected} prop="scale" label="Escala" />
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
