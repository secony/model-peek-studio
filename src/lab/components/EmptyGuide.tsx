import { ImportButton } from "./ImportButton";

const STEPS = [
  ["01", "Arraste um arquivo .glb, .gltf ou .stl para a viewport, ou use Importar."],
  ["02", "Orbite com o botão esquerdo, mova com o direito e aproxime com a roda."],
  ["03", "Selecione objetos na cena ou na hierarquia e edite no painel de propriedades."],
];

export function EmptyGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border bg-panel/90 p-6 shadow-panel backdrop-blur">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Cena vazia</p>
        <h2 className="mt-2 text-lg font-semibold text-foreground">Importe seu primeiro modelo</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map(([n, t]) => (
            <li key={n} className="flex gap-3 text-sm text-muted-foreground">
              <span className="font-mono text-xs text-primary">{n}</span>
              {t}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex items-center justify-between gap-3">
          <ImportButton />
          <span className="text-xs text-muted-foreground">Arquivos ficam no seu navegador.</span>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Prefira <span className="font-mono text-foreground">.glb</span>: um .gltf com .bin ou
          texturas separados não pode ser lido por arquivo único.
        </p>
      </div>
    </div>
  );
}
