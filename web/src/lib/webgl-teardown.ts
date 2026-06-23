
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
