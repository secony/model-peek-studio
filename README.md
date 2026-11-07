# 3D Lab

Laboratório pessoal para importar, visualizar e inspecionar modelos 3D no navegador.

## Recursos
- Importação local de `.glb`, `.gltf` (autocontido) e `.stl` por botão ou arrastar e soltar — nada é enviado a servidor.
- Orbit / pan / zoom, enquadramento automático e retorno à visão inicial.
- Hierarquia de objetos com seleção, destaque, visibilidade e remoção.
- Edição de nome, posição, rotação (graus) e escala.
- Grid, eixos, wireframe e câmera perspectiva/ortográfica.
- Dimensões aproximadas (bounding box), contagem de malhas e triângulos.

> `.gltf` com `.bin` ou texturas externas não pode ser lido como arquivo único. Exporte como `.glb`.

## Executar localmente
```bash
bun install   # ou npm install
bun run dev   # ou npm run dev
```
Abra o endereço exibido no terminal.

## Estrutura
- `src/lab/lib` — estado da cena (zustand), carregadores e utilitários sem React.
- `src/lab/components` — viewport, importação, hierarquia, propriedades, controles e barras.
