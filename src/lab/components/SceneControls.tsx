import type { ReactNode } from "react";
import { Axis3d, Box, Grid3x3, Square } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLab } from "../lib/store";

function Row({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground">
      {icon}
      <span className="flex-1">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function SceneControls() {
  const { showGrid, showAxes, wireframe, projection, toggle, setProjection } = useLab();
  return (
    <div className="py-1">
      <Row
        icon={<Grid3x3 className="size-3.5" />}
        label="Grid"
        checked={showGrid}
        onChange={() => toggle("showGrid")}
      />
      <Row
        icon={<Axis3d className="size-3.5" />}
        label="Eixos"
        checked={showAxes}
        onChange={() => toggle("showAxes")}
      />
      <Row
        icon={<Box className="size-3.5" />}
        label="Wireframe"
        checked={wireframe}
        onChange={() => toggle("wireframe")}
      />
      <Row
        icon={<Square className="size-3.5" />}
        label="Ortográfica"
        checked={projection === "orthographic"}
        onChange={() =>
          setProjection(projection === "orthographic" ? "perspective" : "orthographic")
        }
      />
    </div>
  );
}
