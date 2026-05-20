/**
 * Photoreal day/night Earth shader (city lights on night side) + sun/moon markers.
 * Based on globe.gl day-night-cycle example; sun position synced to `subsolarPoint`.
 */

import {
  ShaderMaterial,
  TextureLoader,
  Vector2,
  type ShaderMaterial as ShaderMaterialType,
} from "three";
import { subsolarPoint } from "./solar-geometry";

const TEXTURE_BASE =
  "https://cdn.jsdelivr.net/npm/three-globe@2.45.0/example/img";

const DAY_NIGHT_SHADER = {
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
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    uniform float twilightSoftness;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) {
      return a * PI / 180.0;
    }

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
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      float blend = smoothstep(-twilightSoftness, twilightSoftness, intensity);
      gl_FragColor = mix(nightColor, dayColor, blend);
    }
  `,
};

export type DayNightGlobeMaterial = ShaderMaterialType & {
  uniforms: {
    dayTexture: { value: unknown };
    nightTexture: { value: unknown };
    sunPosition: { value: Vector2 };
    globeRotation: { value: Vector2 };
    twilightSoftness: { value: number };
  };
};

let materialPromise: Promise<DayNightGlobeMaterial> | null = null;

export function loadDayNightGlobeMaterial(): Promise<DayNightGlobeMaterial> {
  if (!materialPromise) {
    materialPromise = (async () => {
      const loader = new TextureLoader();
      const [dayTexture, nightTexture] = await Promise.all([
        loader.loadAsync(`${TEXTURE_BASE}/earth-day.jpg`),
        loader.loadAsync(`${TEXTURE_BASE}/earth-night.jpg`),
      ]);
      return new ShaderMaterial({
        uniforms: {
          dayTexture: { value: dayTexture },
          nightTexture: { value: nightTexture },
          sunPosition: { value: new Vector2(0, 0) },
          globeRotation: { value: new Vector2(0, 0) },
          twilightSoftness: { value: 0.14 },
        },
        vertexShader: DAY_NIGHT_SHADER.vertexShader,
        fragmentShader: DAY_NIGHT_SHADER.fragmentShader,
      }) as DayNightGlobeMaterial;
    })();
  }
  return materialPromise;
}

/** Shader `sunPosition` uses [lng, lat] in degrees. */
export function updateDayNightSun(
  material: DayNightGlobeMaterial,
  simUtcMs: number,
): void {
  const sub = subsolarPoint(new Date(simUtcMs));
  material.uniforms.sunPosition.value.set(sub.lon, sub.lat);
}

export function updateDayNightGlobeRotation(
  material: DayNightGlobeMaterial,
  lng: number,
  lat: number,
): void {
  material.uniforms.globeRotation.value.set(lng, lat);
}

/**
 * Rough visual moon position (not ephemeris-grade) for the lit globe view.
 */
export function approximateMoonPoint(simUtcMs: number): { lat: number; lng: number } {
  const d = new Date(simUtcMs);
  const sub = subsolarPoint(d);
  const dayFrac =
    (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
  const synodic = ((simUtcMs / 86_400_000) % 29.53) / 29.53;
  const elongDeg = synodic * 360 - 180;
  const elongRad = (elongDeg * Math.PI) / 180;
  const moonLat = Math.max(-28, Math.min(28, sub.lat + Math.sin(elongRad) * 12));
  let moonLon = sub.lon + elongDeg + dayFrac * 15;
  if (moonLon > 180) moonLon -= 360;
  if (moonLon < -180) moonLon += 360;
  return { lat: moonLat, lng: moonLon };
}
