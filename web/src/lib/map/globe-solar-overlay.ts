/**
 * Monochrome CARTO globe + transparent solar shell (terminator shade + city lights).
 * Keeps raster tiles visible; unlike the full NASA day/night globe material.
 */
import {
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  Vector2,
  Vector3,
  type Object3D,
  type ShaderMaterial as ShaderMaterialType,
} from "three";
import type { ThemeId } from "../theme.svelte";
import { subsolarPoint } from "./solar-geometry";

const TEXTURE_BASE =
  "https://cdn.jsdelivr.net/npm/three-globe@2.45.0/example/img";

const SOLAR_SHELL_SHADER = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    uniform float twilightSoftness;
    uniform vec3 nightShadeColor;
    uniform float nightShadeStrength;
    uniform float cityLightStrength;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) { return a * PI / 180.0; }

    vec3 Polar2Cartesian(in vec2 c) {
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(
        sin(phi) * cos(theta),
        cos(phi),
        sin(phi) * sin(theta)
      );
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(
        1.0, 0.0, 0.0,
        0.0, cos(invLat), -sin(invLat),
        0.0, sin(invLat), cos(invLat)
      );
      mat3 rotY = mat3(
        cos(invLon), 0.0, sin(invLon),
        0.0, 1.0, 0.0,
        -sin(invLon), 0.0, cos(invLon)
      );
      vec3 sunDir = rotX * rotY * Polar2Cartesian(sunPosition);
      float intensity = dot(normalize(vNormal), normalize(sunDir));
      float dayBlend = smoothstep(-twilightSoftness, twilightSoftness, intensity);
      float nightFactor = 1.0 - dayBlend;

      vec3 nightTex = texture2D(nightTexture, vUv).rgb;
      float lum = dot(nightTex, vec3(0.299, 0.587, 0.114));
      float cityMask = smoothstep(0.1, 0.42, lum);
      vec3 cities = nightTex * cityMask * cityLightStrength * nightFactor;

      vec3 shade = nightShadeColor * nightFactor * nightShadeStrength;
      vec3 rgb = shade + cities;
      float alpha = clamp(nightFactor * nightShadeStrength * 0.92 + cityMask * nightFactor * 0.55, 0.0, 0.94);
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(rgb, alpha);
    }
  `,
};

export type MonochromeSolarOverlay = ShaderMaterialType & {
  uniforms: {
    nightTexture: { value: unknown };
    sunPosition: { value: Vector2 };
    globeRotation: { value: Vector2 };
    twilightSoftness: { value: number };
    nightShadeColor: { value: Vector3 };
    nightShadeStrength: { value: number };
    cityLightStrength: { value: number };
  };
};

let overlayPromise: Promise<MonochromeSolarOverlay> | null = null;

export function monochromeSolarThemeParams(theme: ThemeId): {
  nightShadeRgb: [number, number, number];
  nightShadeStrength: number;
  cityLightStrength: number;
} {
  const isLight = theme === "light";
  return {
    nightShadeRgb: isLight ? [0.08, 0.1, 0.16] : [0.02, 0.04, 0.1],
    nightShadeStrength: isLight ? 0.34 : 0.48,
    cityLightStrength: isLight ? 0.95 : 1.35,
  };
}

export function applyMonochromeSolarTheme(
  material: MonochromeSolarOverlay,
  theme: ThemeId,
): void {
  const p = monochromeSolarThemeParams(theme);
  material.uniforms.nightShadeColor.value.set(...p.nightShadeRgb);
  material.uniforms.nightShadeStrength.value = p.nightShadeStrength;
  material.uniforms.cityLightStrength.value = p.cityLightStrength;
}

export function loadMonochromeSolarOverlay(): Promise<MonochromeSolarOverlay> {
  if (!overlayPromise) {
    overlayPromise = (async () => {
      const nightTexture = await new TextureLoader().loadAsync(
        `${TEXTURE_BASE}/earth-night.jpg`,
      );
      const material = new ShaderMaterial({
        uniforms: {
          nightTexture: { value: nightTexture },
          sunPosition: { value: new Vector2(0, 0) },
          globeRotation: { value: new Vector2(0, 0) },
          twilightSoftness: { value: 0.2 },
          nightShadeColor: { value: new Vector3(0.02, 0.04, 0.1) },
          nightShadeStrength: { value: 0.48 },
          cityLightStrength: { value: 1.35 },
        },
        vertexShader: SOLAR_SHELL_SHADER.vertexShader,
        fragmentShader: SOLAR_SHELL_SHADER.fragmentShader,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }) as MonochromeSolarOverlay;
      applyMonochromeSolarTheme(material, "dark");
      return material;
    })();
  }
  return overlayPromise;
}

export function updateMonochromeSolarSun(
  material: MonochromeSolarOverlay,
  simUtcMs: number,
): void {
  const sub = subsolarPoint(new Date(simUtcMs));
  material.uniforms.sunPosition.value.set(sub.lon, sub.lat);
}

export function updateMonochromeSolarRotation(
  material: MonochromeSolarOverlay,
  lng: number,
  lat: number,
): void {
  material.uniforms.globeRotation.value.set(lng, lat);
}

export function createMonochromeSolarShell(
  globeRadius: number,
  material: MonochromeSolarOverlay,
  theme: ThemeId,
): { group: Group; mesh: Mesh } {
  applyMonochromeSolarTheme(material, theme);
  const group = new Group();
  group.name = "oa-monochrome-solar-shell";
  const alt = 0.004;
  const mesh = new Mesh(
    new SphereGeometry(globeRadius * (1 + alt), 72, 72),
    material,
  );
  mesh.renderOrder = 3;
  mesh.name = "oa-solar-shell-mesh";
  group.add(mesh);
  return { group, mesh };
}

export function disposeMonochromeSolarShell(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
  });
}
