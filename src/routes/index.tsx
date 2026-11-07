import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/lab/components/Studio";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "3D Lab — visualizador de modelos 3D" },
      { name: "description", content: "Importe, visualize e inspecione modelos GLB, GLTF e STL direto no navegador." },
      { property: "og:title", content: "3D Lab — visualizador de modelos 3D" },
      { property: "og:description", content: "Importe, visualize e inspecione modelos GLB, GLTF e STL direto no navegador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Studio,
});
