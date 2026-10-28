// Lorenz attractor hero. Plain WebGL (no Three.js) keeps this ~3 KB gzipped,
// which matters on the tablets this site is mostly used on.
//
// The whole trajectory is drawn faintly; a bright "comet" travels along it.
// Pointer position tilts the camera a little. With reduced motion the scene
// renders one still frame.

interface Options {
  reducedMotion: boolean;
  coarse: boolean;
}

const VS = `
attribute vec3 aPos;
attribute float aIdx;
uniform mat4 uMVP;
uniform float uHead;
uniform float uN;
uniform float uTrail;
varying float vGlow;
varying float vDepth;
void main() {
  vec4 p = uMVP * vec4(aPos, 1.0);
  gl_Position = p;
  float d = mod(uHead - aIdx + uN, uN);
  vGlow = d < uTrail ? pow(1.0 - d / uTrail, 2.2) : 0.0;
  vDepth = clamp(1.25 - p.z / 4.5, 0.25, 1.0);
}`;

const FS = `
precision mediump float;
uniform vec3 uFg;
uniform vec3 uAccent;
uniform float uBase;
varying float vGlow;
varying float vDepth;
void main() {
  vec3 c = mix(uFg, uAccent, min(1.0, vGlow * 1.6));
  float a = (uBase + vGlow * 0.95) * vDepth;
  gl_FragColor = vec4(c * a, a);
}`;

function lorenz(n: number): Float32Array {
  const s = 10;
  const r = 28;
  const b = 8 / 3;
  const dt = 0.0055;
  let x = 0.1;
  let y = 0;
  let z = 0;
  const f = (x: number, y: number, z: number) => [s * (y - x), x * (r - z) - y, x * y - b * z];
  const out = new Float32Array(n * 4);
  for (let i = -800; i < n; i++) {
    const k1 = f(x, y, z);
    const k2 = f(x + (dt / 2) * k1[0], y + (dt / 2) * k1[1], z + (dt / 2) * k1[2]);
    const k3 = f(x + (dt / 2) * k2[0], y + (dt / 2) * k2[1], z + (dt / 2) * k2[2]);
    const k4 = f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2]);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i < 0) continue;
    // Lorenz z is "up"; centre the butterfly and scale to roughly unit size.
    out[i * 4] = x / 22;
    out[i * 4 + 1] = (z - 25) / 22;
    out[i * 4 + 2] = y / 22;
    out[i * 4 + 3] = i;
  }
  return out;
}

function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function mul(a: number[], b: number[]) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function rotY(t: number) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function rotX(t: number) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function translate(x: number, y: number, z: number) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function rgb(cssVar: string, el: Element): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue(cssVar).trim();
  const m = v.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mountLorenz(canvas: HTMLCanvasElement, opts: Options): () => void {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return () => {};

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {};
  gl.useProgram(prog);

  const N = opts.coarse ? 7000 : 16000;
  const data = lorenz(N);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aIdx = gl.getAttribLocation(prog, 'aIdx');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aIdx);
  gl.vertexAttribPointer(aIdx, 1, gl.FLOAT, false, 16, 12);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uMVP = u('uMVP');
  const uHead = u('uHead');
  gl.uniform1f(u('uN'), N);
  gl.uniform1f(u('uTrail'), N * 0.07);
  // Fewer points on touch devices, so each line is drawn a little brighter.
  gl.uniform1f(u('uBase'), opts.coarse ? 0.2 : 0.12);
  gl.uniform3fv(u('uFg'), rgb('--fg', canvas));
  gl.uniform3fv(u('uAccent'), rgb('--accent', canvas));

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const dprCap = opts.coarse ? 1.25 : 1.75;
  let w = 0;
  let h = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };
  const ro = new ResizeObserver(() => {
    resize();
    if (!running) draw(last);
  });
  ro.observe(canvas);
  resize();

  // Pointer → target tilt, eased every frame.
  let tx = 0;
  let ty = 0;
  let px = 0;
  let py = 0;
  const onMove = (e: PointerEvent) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  let last = 20000;
  const draw = (t: number) => {
    px += (tx - px) * 0.04;
    py += (ty - py) * 0.04;
    const aspect = w / h;
    // Narrow screens: pull the camera back so both wings fit.
    const dist = aspect < 0.8 ? 4.8 : aspect < 1.2 ? 4.0 : 3.7;
    const yaw = t * 0.00006 + px * 0.35;
    const pitch = 0.18 + py * 0.18;
    const view = mul(translate(aspect > 1.2 ? 0.95 : 0, aspect < 1.2 ? -0.1 : 0.05, -dist), mul(rotX(pitch), rotY(yaw)));
    gl.uniformMatrix4fv(uMVP, false, new Float32Array(mul(perspective(0.75, aspect, 0.1, 20), view)));
    gl.uniform1f(uHead, opts.reducedMotion ? N * 0.6 : (t * 0.9) % N);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.LINE_STRIP, 0, N);
  };

  let raf = 0;
  let running = false;
  let visible = true;
  const loop = (t: number) => {
    last = t;
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || !armed || opts.reducedMotion || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  });
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  // Draw one still frame now; start moving on the first sign of a person
  // (pointer, touch, wheel, key). Saves battery and keeps page load quiet.
  let armed = false;
  const wake = () => {
    if (armed) return;
    armed = true;
    for (const ev of WAKE_EVENTS) window.removeEventListener(ev, wake);
    start();
  };
  const WAKE_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown', 'scroll'] as const;
  for (const ev of WAKE_EVENTS) window.addEventListener(ev, wake, { passive: true });
  draw(last);
  canvas.classList.add('is-ready');

  return () => {
    stop();
    for (const ev of WAKE_EVENTS) window.removeEventListener(ev, wake);
    io.disconnect();
    ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('visibilitychange', onVis);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
