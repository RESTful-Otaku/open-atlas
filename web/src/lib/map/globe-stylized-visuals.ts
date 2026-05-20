/**
 * OpenAtlas “instrument room” globe look — not photoreal Earth marketing;
 * matches 2D map chroma (CARTO dark) + simple void backdrops + stylized cloud shell.
 */
import {
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import type { ThemeId } from "../theme.svelte";
import { mapThemeFor } from "../theme-map";

const TEX_W = 2048;
const TEX_H = 1024;

/** Slow ribbon noise — soft blobs, cool greys / cyan tints (dark) or airy whites (light). */
export function buildStylizedCloudCanvasTexture(theme: ThemeId): CanvasTexture {
  const isLight = theme === "light";
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  const baseA = isLight ? "rgba(240,248,255," : "rgba(165,200,230,";
  const baseB = isLight ? "rgba(200,210,225," : "rgba(100,140,180,";

  const seeded = (n: number) => {
    const x = (Math.sin(n * 12.9898) * 43758.5453) % 1;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 220; i += 1) {
    const u = seeded(i) * TEX_W;
    const v = seeded(i + 4000) * TEX_H;
    const rad = 28 + seeded(i + 99) * 140;
    const g = ctx.createRadialGradient(u, v, 0, u, v, rad);
    const peak = 0.06 + seeded(i + 17) * 0.14;
    const inner = `${baseA}${peak.toFixed(3)})`;
    const outer = `${baseB}0)`;
    g.addColorStop(0, inner);
    g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  tex.minFilter = LinearFilter;
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

export function stylizedCloudOpacity(theme: ThemeId): number {
  return theme === "light" ? 0.32 : 0.44;
}

export function createStylizedCloudLayer(
  globeRadius: number,
  theme: ThemeId,
): { group: Group; mesh: Mesh } {
  const group = new Group();
  group.name = "oa-stylized-cloud-shell";
  const tex = buildStylizedCloudCanvasTexture(theme);
  const alt = 0.011;
  const mesh = new Mesh(
    new SphereGeometry(globeRadius * (1 + alt), 72, 72),
    new MeshPhongMaterial({
      map: tex,
      transparent: true,
      opacity: stylizedCloudOpacity(theme),
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.renderOrder = 5;
  mesh.name = "oa-cloud-mesh";
  group.add(mesh);
  return { group, mesh };
}

export function disposeStylizedCloudLayer(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mat = m.material;
    if (mat && !Array.isArray(mat)) {
      const pm = mat as MeshPhongMaterial;
      pm.map?.dispose();
      pm.dispose();
    }
  });
}

/**
 * Minimal void behind the globe — soft radial falloff matching {@link mapThemeFor} sky tones,
 * not a star cube / Google Earth night sky.
 */
export function minimalGlobeBackdropDataUrl(theme: ThemeId): string {
  const spec = mapThemeFor(theme);
  const isLight = theme === "light";
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 320;
  const ctx = c.getContext("2d")!;
  const cx = 320;
  const cy = 110;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 420);
  if (isLight) {
    g.addColorStop(0, "#d8e6f4");
    g.addColorStop(0.5, spec.globeBackground);
    g.addColorStop(1, "#b8c8dc");
  } else {
    g.addColorStop(0, "#0a1528");
    g.addColorStop(0.35, spec.globeBackground);
    g.addColorStop(1, "#020408");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 320);
  return c.toDataURL("image/png");
}
