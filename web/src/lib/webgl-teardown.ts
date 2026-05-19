/**
 * Best-effort WebGL context release on view destroy.
 * Only uses WEBGL_lose_context when a context already exists — never calls
 * getContext() (that can create a new context and break MapLibre/Three).
 */
export function releaseWebGlCanvases(root: ParentNode | null | undefined): void {
  if (!root) return;
  for (const canvas of root.querySelectorAll("canvas")) {
    loseContextForCanvas(canvas);
  }
}

function loseContextForCanvas(canvas: HTMLCanvasElement): void {
  const webgl1 = canvas.getContext("webgl");
  const webgl2 = canvas.getContext("webgl2");
  for (const gl of [webgl2, webgl1]) {
    if (!gl) continue;
    try {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* already lost */
    }
  }
}
