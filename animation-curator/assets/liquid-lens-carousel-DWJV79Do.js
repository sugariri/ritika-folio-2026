const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import { readPalette } from '../lib/palette.ts'

export const meta: EffectMeta = {
  name: 'Liquid Lens Carousel',
  description: 'An endless row of panels glides behind a glass lens that refracts and disperses it at the rim',
  category: 'Motion',
  tags: ['webgl', 'shader', 'carousel', 'glass', 'refraction', 'infinite', 'intro'],
  status: 'ready',
}

// Two render passes, no libraries.
//
// Pass 1 draws an infinite row of image panels into an offscreen framebuffer with an
// implicit orthographic camera where 1 unit = 1 CSS pixel — that one choice is why every
// number below is readable as pixels. Pass 2 draws that framebuffer to the screen through
// a fragment shader that treats an ellipse in the middle of the frame as a lens: UVs pull
// inward, the rim gets chromatic dispersion from ~16 weighted taps, and a nova, a
// shimmering blue ring and a hairline border sit on top. Outside the ellipse the
// framebuffer passes through untouched.
//
// The row wraps by modulo, so a pool of REPEATS copies of the image set gets repositioned
// forever — nothing is created or destroyed while it scrolls.
//
// Motion is driven by two numbers: \`target\` (where the row wants to be) and \`scroll\`
// (where it is). \`scroll += (target - scroll) * EASE\` every frame is the entire feel.
// Autoplay nudges \`target\` one panel onward, so each advance is one heavy glide that
// happens to die on an image rather than a snap into place.
//
// Ported from github.com/Yousuf-developer/liquid-glass-carousel (three.js + GSAP). The
// lens shader is that project's, verbatim. GSAP's tweens are gone: every animated value
// here is an analytic function of one clock, which is both smaller and pause-safe.

// Add or swap freely — panels are all one height and take their width from each image's
// own aspect ratio, so nothing is cropped or stretched and the row re-spaces itself.
//
// Only three photographs ship in this repo, so the loop runs them twice. Order matters:
// autoplay parks on one slot at a time, and two copies close together read as a stop that
// never moved, so the repeats sit as far apart as six slots allow. Drop more images in
// here and the row gets correspondingly less repetitive.
const IMAGES = [
  '/assets/img/bay-bridge.avif',
  '/assets/img/wall-street.avif',
  '/assets/img/sf-mosaic.avif',
  '/assets/img/bay-bridge.avif',
  '/assets/img/wall-street.avif',
  '/assets/img/sf-mosaic.avif',
]

// Layout + scroll feel. The px values from the original were authored against a 450px
// panel in a full-viewport hero; here they are fractions of the panel or the stage so a
// 4:3 gallery tile and the drawer's larger preview read identically.
const PANEL_H_FRAC = 0.62 // panel height as a fraction of stage height
const GAP_FRAC = 0.0267 // gap between panels, as a fraction of panel height
const EASE = 0.075 // lerp toward target (lower = heavier / more glide)
const SHRINK_MAX_FRAC = 0.133 // scroll speed (panel-heights/frame) that = full shrink
const SHRINK_AMOUNT = 0.25 // how far panels shrink at full scroll energy
const SHRINK_ATTACK = 0.25 // how fast panels shrink when speeding up
const SHRINK_DECAY = 0.06 // how fast they grow back when settling
const REPEATS = 4 // copies of the full set, so wide stages never run dry
const HOLD = 1.5 // seconds parked on a panel before autoplay advances

// The liquid-glass lens. Every knob is a uniform, mirrored 1:1 from the original's LENS.
const LENS = {
  shape: 'circle' as 'circle' | 'square',
  squareRound: 0, // corner rounding for rectangle (0 sharp .. 1 very round)
  rotation: 65, // static rotation in degrees
  spin: 0, // auto-spin speed (deg/sec, 0 = off)
  sizeX: 0.565, // half-width (fraction of stage height)
  sizeY: 1, // half-height (fraction of stage height)
  posX: 0.5, // center x in screen-UV (0 left .. 1 right)
  posY: 0.5, // center y in screen-UV (0 bottom .. 1 top)
  zoom: 0, // inward pull strength
  dispersion: 11, // chromatic dispersion
  blur: 0, // blur amount (px)
  glow: 4.2, // overall glow multiplier
  whiteGlow: 0.24, // central white nova intensity
  novaSize: 12, // nova size
  blueRing: 6, // blue ring intensity
  ringRadius: 0.49, // ring radius (0..0.5)
  ringWidth: 0.014, // ring width
  shimmer: true, // animated ring shimmer
  shimmerFreq: 12, // shimmer wave count around the ring
  shimmerSpeed: 3.5, // shimmer animation speed
  shimmerDepth: 0.12, // shimmer intensity (0 = none .. 0.5 = strong)
  rimStart: 0.578, // where the rim fluid wave begins
  rimTangential: 0.6, // tangential fluid-wave displacement
  rimInward: 0, // extra inward pull at the rim
  rimFreq1: 2, // fluid wave frequency 1
  rimFreq2: 1, // fluid wave frequency 2
  blueColor: '#009dff', // the soul: blue tint / ring color
  rimLine: 1.4, // bright white border line intensity (0 = off)
  rimLinePos: 0.488, // where the white border sits (0..0.5)
  rimLineWidth: 0.003, // sharpness of the white border
  vignette: 0, // overall screen vignette strength (0 = off)
  vignetteSize: 0.3, // how far in the vignette reaches
  samples: 16, // dispersion samples
}

// Entry: panels rise from below at a small size, hold, then grow to full while the lens
// blooms in. Seconds.
const ENTRY = {
  delay: 0.25,
  startH_FRAC: 0.178, // starting height, as a fraction of full panel height
  riseDuration: 1.0,
  stagger: 0.07, // spread of the random rise delays
  fromBelow: 0.9, // start offset below the stage, as a fraction of stage height
  growDelay: 0.25,
  growDuration: 2.15,
  growStagger: 0.085,
  growDir: 'inward' as 'inward' | 'outward', // 'outward' = center first
  lensBloom: 1.4,
}

// The distortion-type uniforms all get multiplied by one \`lensFx\` factor. Ramping that
// single number from 0 to 1 blooms the whole lens in without touching individual knobs.
const LENS_FX_KEYS = [
  'uDispersion',
  'uBlueRing',
  'uRimLine',
  'uVignette',
  'uZoom',
  'uRimTangential',
  'uRimInward',
] as const


const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
const easeInOutQuad = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const easeInOutExpo = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2

// Everything downstream of the texture fetch runs in linear light, the way three.js had
// it: the source PNGs are sRGB, the additive glow has to sum linearly or the nova and the
// ring blow out, and the final frame is encoded back on the way to the screen.
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ]
}

const QUAD_VS = \`
attribute vec2 aPos;
uniform vec2 uRes;    // stage size in CSS px
uniform vec2 uCenter; // panel center in px, origin at stage center, y up
uniform vec2 uSize;   // panel size in px
varying vec2 vUv;
void main(){
  vUv = aPos + 0.5;
  gl_Position = vec4((uCenter + aPos * uSize) / (uRes * 0.5), 0.0, 1.0);
}\`

// sRGB -> linear on the way into the framebuffer, matching three.js's texture decode.
const QUAD_FS = \`
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
vec3 toLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main(){
  gl_FragColor = vec4(toLinear(texture2D(uTex, vUv).rgb), 1.0);
}\`

const LENS_VS = \`
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos + 0.5; gl_Position = vec4(aPos * 2.0, 0.0, 1.0); }\`

// Verbatim from the original project, with one addition: the linear -> sRGB encode at the
// end, which three.js used to append automatically on the final draw.
const LENS_FS = \`
#define PI 3.14159265
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uRes;
uniform vec2  uCenter;
uniform float uSizeX;         // half-width (height-fraction units)
uniform float uSizeY;         // half-height (height-fraction units)
uniform float uAspect;        // W/H
uniform float uZoom;
uniform float uDispersion;
uniform float uBlur;
uniform float uGlow;
uniform float uWhiteGlow;
uniform float uNovaSize;
uniform float uBlueRing;
uniform float uRingRadius;
uniform float uRingWidth;
uniform float uShimmer;
uniform float uShimmerFreq;
uniform float uShimmerSpeed;
uniform float uShimmerDepth;
uniform float uTime;
uniform float uRimStart;
uniform float uRimTangential;
uniform float uRimInward;
uniform float uRimFreq1;
uniform float uRimFreq2;
uniform vec3  uBlueColor;
uniform float uRimLine;
uniform float uRimLinePos;
uniform float uRimLineWidth;
uniform float uVignette;     // overall vignette strength (0 = off)
uniform float uVignetteSize; // radius where vignette begins
uniform float uShape;        // 0 = circle, 1 = square
uniform float uSquareRound;  // corner rounding for square (0..1)
uniform float uRotation;     // lens rotation in radians
uniform int   uSamples;

const int MAX_SAMPLES = 16;

// rounded-box signed distance (negative inside)
float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Evaluate the disc lens centered at 'center' (screen-UV). Returns the
// lensed color; 'outA' = how opaque this lens is here (0 outside disc).
vec3 discLens(vec2 center, float aspectCorrect, out float outA) {
  // local coords, aspect-corrected so x/y are in the same screen units
  vec2 p = (vUv - center);
  p.x *= aspectCorrect;
  // rotate local space so the rect + all internals spin together
  float ca = cos(uRotation), sa = sin(uRotation);
  p = mat2(ca, -sa, sa, ca) * p;
  vec2 halfSize = vec2(uSizeX, uSizeY);
  // elliptical distance: 0 center .. 1 boundary
  float dist = length(p / halfSize);
  outA = 0.0;

  // mask shape: ellipse OR rounded rect, drives the cutoff.
  // maskND: 0 inside .. 1 at the shape boundary (>1 outside).
  float maskND;
  if (uShape > 0.5) {
    float corner = min(uSizeX, uSizeY) * clamp(uSquareRound, 0.0, 1.0);
    float sd = sdRoundBox(p, halfSize, corner);
    maskND = 1.0 + sd / min(uSizeX, uSizeY);
  } else {
    maskND = dist;
  }
  if (maskND > 1.0) return vec3(0.0);

  // shapeND: 0 center .. 1 boundary, following the chosen shape. Used by
  // nova / ring / border so they take the SAME shape.
  float shapeND = clamp(maskND, 0.0, 1.0);

  // deflection uses the elliptical radial nd so it bends smoothly from
  // the center even when the boundary is rectangular
  float nd = clamp(dist, 0.0, 1.0);
  vec2  offset = vUv - center;
  vec2  radialDir = normalize(offset + 1e-6);
  vec2  tangentDir = vec2(-radialDir.y, radialDir.x);
  // angle measured in ROTATED local space so the rim wave/shimmer spin too
  float angle = atan(p.y, p.x);

  // inward pull + fluid rim waves
  float pull = uZoom * 0.30 * (nd * nd);
  float rimStrength = smoothstep(uRimStart, 1.0, nd);
  float fluidWave = sin(angle * uRimFreq1) * 0.55 + sin(angle * uRimFreq2) * 0.25;
  float rScreen = (uSizeX + uSizeY) * 0.5;
  vec2  rimOff = tangentDir * fluidWave * rimStrength * rScreen * uRimTangential;
  vec2  rimPull = -radialDir * rimStrength * rScreen * uRimInward;

  vec2 baseUV = center + offset * (1.0 - pull) + rimOff + rimPull;

  // chromatic dispersion (weighted multi-sample, per-channel normalized)
  float rimMask = smoothstep(0.55, 1.0, nd);
  vec2  dispDir = offset * uDispersion * 0.004 * rimMask;
  int N = uSamples;
  if (N < 2) N = 2;
  if (N > MAX_SAMPLES) N = MAX_SAMPLES;
  vec3 col = vec3(0.0);
  vec3 caW = vec3(0.0);
  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= N) break;
    float t = float(i) / float(N - 1);
    vec2 sUV = baseUV + dispDir * (t - 0.5);
    vec3 s = texture2D(uTex, sUV).rgb;
    vec3 w = vec3(
      exp(-pow((t - 0.00) / 0.38, 2.0)),
      exp(-pow((t - 0.50) / 0.38, 2.0)),
      exp(-pow((t - 1.00) / 0.38, 2.0))
    );
    col += s * w;
    caW += w;
  }
  col /= max(caW, vec3(0.001));

  // optional blur near the rim
  float blurFade = 1.0 - smoothstep(0.72, 0.98, nd);
  if (uBlur > 0.01 && blurFade > 0.01) {
    vec2 blurRad = vec2(uBlur) / uRes * blurFade;
    vec3 bcol = vec3(0.0);
    float btw = 0.0;
    for (float a = 0.0; a < PI * 2.0; a += PI * 2.0 / 6.0) {
      for (float rr = 0.4; rr <= 1.001; rr += 0.3) {
        vec2 o = vec2(cos(a), sin(a)) * blurRad * rr;
        float w = 1.0 - rr * 0.38;
        bcol += texture2D(uTex, baseUV + o).rgb * w;
        btw += w;
      }
    }
    col = mix(bcol / btw, col, rimMask);
  }

  // glassy darkening toward center
  col *= mix(0.91, 1.0, smoothstep(0.0, 0.38, shapeND));

  // white nova glow at center
  float r2 = shapeND * shapeND * 0.25;
  float gs = max(uNovaSize * uGlow * 0.003, 0.004);
  float nova = exp(-r2 / gs) + exp(-r2 / (gs * 7.0)) * 0.18;
  nova *= uWhiteGlow * (uGlow / 17.0) * 1.15;
  col += vec3(nova);

  // blue ring + aura
  float dC = shapeND * 0.5;
  float tR = clamp(uRingRadius, 0.1, 0.49);
  float rW = max(uRingWidth, 0.003);
  float ring = exp(-pow((dC - tR) / rW, 2.0));
  ring *= uBlueRing * (uGlow / 17.0) * 1.8;
  if (uShimmer > 0.5) ring *= sin(angle * uShimmerFreq + uTime * uShimmerSpeed) * uShimmerDepth + (1.0 - uShimmerDepth);
  float ringAura = exp(-pow((dC - tR) / (rW * 6.0), 2.0)) * 0.28 * uBlueRing * (uGlow / 17.0);
  col += uBlueColor * (ring + ringAura);
  // bright border line
  col += vec3(exp(-pow((dC - uRimLinePos) / max(uRimLineWidth, 0.0001), 2.0)) * uRimLine);

  // lens alpha: solid inside, soft falloff at the very edge
  outA = smoothstep(1.0, 0.93, maskND);
  return col;
}

vec3 toSRGB(vec3 c){
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main(){
  vec3 base = texture2D(uTex, vUv).rgb;  // carousel, untouched
  vec3 outc = base;

  float a = 0.0;
  vec3 c = discLens(uCenter, uAspect, a);
  outc = mix(outc, c, a);

  // overall vignette: darken toward screen corners (aspect-correct)
  if (uVignette > 0.001) {
    vec2 vc = vUv - 0.5;
    vc.x *= uAspect;
    float d = length(vc) / max(uVignetteSize, 0.0001);
    float vig = 1.0 - uVignette * smoothstep(0.5, 1.0, d);
    outc *= clamp(vig, 0.0, 1.0);
  }

  gl_FragColor = vec4(toSRGB(outc), 1.0);
}\`

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh))
      gl.deleteShader(sh)
      return null
    }
    return sh
  }
  const v = make(gl.VERTEX_SHADER, vs)
  const f = make(gl.FRAGMENT_SHADER, fs)
  if (!v || !f) return null
  const p = gl.createProgram()!
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p))
    return null
  }
  return p
}

/** Uniform locations, looked up once — \`gl.getUniformLocation\` per frame is a real cost. */
function locations(gl: WebGLRenderingContext, p: WebGLProgram, names: string[]) {
  const out: Record<string, WebGLUniformLocation | null> = {}
  for (const n of names) out[n] = gl.getUniformLocation(p, n)
  return out
}

export default function LiquidLensCarousel() {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    // The canvas is created here rather than rendered by React, and removed again on
    // cleanup. \`getContext\` hands back the SAME context for a given canvas, so a reused
    // element would give a remount the context the previous teardown just deleted its
    // programs out of — which is exactly what StrictMode's double-invoke does. Owning the
    // element means every mount gets a genuinely fresh context, and dropping it lets the
    // browser reclaim that context instead of holding one of its ~16 slots.
    const cv = document.createElement('canvas')
    cv.className = 'block'
    stage.appendChild(cv)

    // WebGL2 for non-power-of-two mipmaps: panels render ~18px tall at the start of the
    // entry, and without mipmaps that downscale is mush. The shaders are GLSL ES 1.00,
    // which WebGL2 still accepts, so the WebGL1 fallback runs the same code unmipmapped.
    const gl = (cv.getContext('webgl2', { antialias: false, alpha: false }) ??
      cv.getContext('webgl', { antialias: false, alpha: false })) as WebGLRenderingContext | null
    if (!gl) return
    const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const panelProg = compile(gl, QUAD_VS, QUAD_FS)
    const lensProg = compile(gl, LENS_VS, LENS_FS)
    if (!panelProg || !lensProg) return

    const panelU = locations(gl, panelProg, ['uRes', 'uCenter', 'uSize', 'uTex'])
    const lensU = locations(gl, lensProg, [
      'uTex', 'uRes', 'uCenter', 'uSizeX', 'uSizeY', 'uAspect', 'uZoom', 'uDispersion',
      'uBlur', 'uGlow', 'uWhiteGlow', 'uNovaSize', 'uBlueRing', 'uRingRadius', 'uRingWidth',
      'uShimmer', 'uShimmerFreq', 'uShimmerSpeed', 'uShimmerDepth', 'uTime', 'uRimStart',
      'uRimTangential', 'uRimInward', 'uRimFreq1', 'uRimFreq2', 'uBlueColor', 'uRimLine',
      'uRimLinePos', 'uRimLineWidth', 'uVignette', 'uVignetteSize', 'uShape',
      'uSquareRound', 'uRotation', 'uSamples',
    ])

    // one unit quad, -0.5..0.5, shared by both passes
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    )
    const panelPos = gl.getAttribLocation(panelProg, 'aPos')
    const lensPos = gl.getAttribLocation(lensProg, 'aPos')

    // ---- offscreen framebuffer (device resolution — CSS-sized renders at 1x and
    // upscales, which is soft on retina) ----
    const fbo = gl.createFramebuffer()
    const fboTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, fboTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    // The clear colour's only job is to be indistinguishable from the tile behind it, so
    // it is read from the surface token rather than baked — a literal would betray the
    // seam the moment the page changed theme.
    const [clearR, clearG, clearB] = hexToLinear(readPalette(stage).surface)
    const blue = hexToLinear(LENS.blueColor)

    let W = 1, H = 1, dpr = 1
    let raf = 0
    let disposed = false
    let visible = true
    let ready = false
    let t0: number | null = null
    let pausedAt: number | null = null

    // ---- sources ----
    type Source = { tex: WebGLTexture | null; aspect: number }
    const sources: Source[] = IMAGES.map(() => ({ tex: null, aspect: 1 }))
    const images: HTMLImageElement[] = []

    // ---- derived layout ----
    let panelH = 1, gap = 0, startH = 1, shrinkMax = 1
    let offsets: number[] = []
    let totalWidth = 0

    const slotWidth = (i: number) => sources[i].aspect * panelH + gap

    const recomputeTotal = () => {
      offsets = []
      let acc = 0
      for (let i = 0; i < sources.length; i++) {
        offsets.push(acc)
        acc += slotWidth(i)
      }
      totalWidth = acc
    }

    /** center of slot \`i\` within one loop */
    const slotCenter = (i: number) => offsets[i] + slotWidth(i) / 2 - gap / 2

    /**
     * Scroll value that puts panel \`idx\` dead-center. \`idx\` is unbounded, so
     * \`loop\` is which pass around the row and \`idx mod N\` is the source.
     */
    const centerForIndex = (idx: number) => {
      const N = sources.length
      const loop = Math.floor(idx / N)
      const s = ((idx % N) + N) % N
      return slotCenter(s) + loop * totalWidth
    }

    /** source index whose center is closest to \`value\` (used by the entry walk) */
    const centerIndex = (value: number) => {
      if (!totalWidth) return 0
      let bestI = 0
      let bestDist = Infinity
      for (let i = 0; i < sources.length; i++) {
        const c = slotCenter(i)
        const k = Math.round((value - c) / totalWidth)
        const dist = Math.abs(c + k * totalWidth - value)
        if (dist < bestDist) {
          bestDist = dist
          bestI = i
        }
      }
      return bestI
    }

    // ---- pool: REPEATS copies of the full set, each covering a different rung of the
    // wrap, so panels never run dry at the edges on a wide stage ----
    const POOL = REPEATS * sources.length
    const midRep = Math.floor(REPEATS / 2)
    const riseAt = new Array<number>(POOL).fill(0) // per-panel random rise delay
    const growRank = new Array<number>(POOL).fill(0) // per-panel grow order

    // ---- scroll state ----
    let scroll = 0
    let target = 0
    let prevScroll = 0
    let scrollEnergy = 0 // smoothed 0..1 scroll activity, drives the panel shrink
    let autoIndex = 0
    let nextAdvance = Infinity // seconds; set once the entry finishes

    // ---- entry timing, all analytic off one clock ----
    let riseEnd = 0
    let growStart = 0
    let growEnd = 0

    const planEntry = () => {
      const spread = ENTRY.stagger * Math.max(sources.length - 1, 1)
      riseEnd = 0
      for (let k = 0; k < POOL; k++) {
        // Only the middle rung is drawn during the entry, so those are the delays that
        // matter; the rest are planned anyway to keep the arrays uniform.
        riseAt[k] = Math.random() * spread
        if (Math.floor(k / sources.length) === midRep) riseEnd = Math.max(riseEnd, riseAt[k] + ENTRY.riseDuration)
      }
      // Grow order ranks by slot distance from the centered source, so symmetric
      // left/right pairs grow together. 'outward' = center first, 'inward' = edges first.
      const cSrc = centerIndex(scroll)
      const N = sources.length
      let maxRank = 0
      for (let k = 0; k < POOL; k++) {
        let di = (k % N) - cSrc
        if (di > N / 2) di -= N
        if (di < -N / 2) di += N
        growRank[k] = Math.abs(di)
        maxRank = Math.max(maxRank, growRank[k])
      }
      if (ENTRY.growDir === 'inward') {
        for (let k = 0; k < POOL; k++) growRank[k] = maxRank - growRank[k]
      }
      growStart = riseEnd + ENTRY.growDelay
      growEnd = growStart
      for (let k = 0; k < POOL; k++) {
        growEnd = Math.max(growEnd, growStart + growRank[k] * ENTRY.growStagger + ENTRY.growDuration)
      }
    }

    const size = () => {
      W = Math.max(stage.clientWidth, 1)
      H = Math.max(stage.clientHeight, 1)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.style.width = W + 'px'
      cv.style.height = H + 'px'
      cv.width = Math.floor(W * dpr)
      cv.height = Math.floor(H * dpr)

      panelH = H * PANEL_H_FRAC
      gap = panelH * GAP_FRAC
      startH = panelH * ENTRY.startH_FRAC
      shrinkMax = panelH * SHRINK_MAX_FRAC
      recomputeTotal()

      gl.bindTexture(gl.TEXTURE_2D, fboTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }

    /**
     * Place every pooled panel for the current scroll. Called once per frame; it is the
     * only place positions are decided, and it reads the animated numbers rather than
     * being driven by them.
     */
    type Placed = { x: number; y: number; w: number; h: number; src: number }
    const placed: Placed[] = []

    const layout = (t: number) => {
      placed.length = 0
      const half = W / 2
      const buffer = panelH
      const inRise = t < riseEnd
      const inEntry = t < growEnd
      const N = sources.length

      // fixed size for every panel; shrink with scroll speed so the row visually
      // compresses when it is moving and relaxes when it settles
      const shrink = 1 - SHRINK_AMOUNT * scrollEnergy
      const fullH = panelH * shrink

      // During the grow, positions can't come from the normal layout — widths are
      // mid-change. Walk outward from the centered slot instead, spacing each neighbour by
      // ITS OWN current width, which is what makes growing panels push each other apart.
      const cSrc = centerIndex(scroll)
      const slotH = (s: number) => {
        const g = inEntry ? growOf(t, midRep * N + s) : 1
        return startH + (panelH - startH) * g
      }

      for (let poolIdx = 0; poolIdx < POOL; poolIdx++) {
        const rep = Math.floor(poolIdx / N)
        const i = poolIdx % N
        const src = sources[i]

        // slot center within one loop, shifted by scroll, wrapped, then pushed out by
        // this pool entry's repetition rung
        let x = slotCenter(i) - scroll
        x = ((x % totalWidth) + totalWidth) % totalWidth
        x += (rep - midRep) * totalWidth
        if (x > half + totalWidth) x -= totalWidth * REPEATS

        let finalX = x
        let finalY = 0
        let finalW = src.aspect * fullH
        let finalH = fullH

        if (inEntry) {
          if (rep !== midRep) continue // one copy per source while widths are in flux
          const g = growOf(t, poolIdx)
          const curH = startH + (fullH - startH) * g
          finalH = curH
          finalW = curH * src.aspect

          let di = i - cSrc
          if (di > N / 2) di -= N
          if (di < -N / 2) di += N
          let off = 0
          if (di > 0) {
            for (let k = 0; k < di; k++) {
              const sa = (((cSrc + k) % N) + N) % N
              const sb = (((cSrc + k + 1) % N) + N) % N
              off += (sources[sa].aspect * slotH(sa) + sources[sb].aspect * slotH(sb)) / 2 + gap
            }
          } else if (di < 0) {
            for (let k = 0; k < -di; k++) {
              const sa = (((cSrc - k) % N) + N) % N
              const sb = (((cSrc - k - 1) % N) + N) % N
              off -= (sources[sa].aspect * slotH(sa) + sources[sb].aspect * slotH(sb)) / 2 + gap
            }
          }
          finalX = off
          if (finalX < -half - buffer || finalX > half + buffer) continue

          // rise from below the stage into the row
          const below = -H * ENTRY.fromBelow
          const pe = inRise ? easeOutCubic(clamp01((t - riseAt[poolIdx]) / ENTRY.riseDuration)) : 1
          finalY = below + (0 - below) * pe
        } else if (finalX < -half - buffer || finalX > half + buffer) {
          continue
        }

        if (src.tex) placed.push({ x: finalX, y: finalY, w: finalW, h: finalH, src: i })
      }
    }

    const growOf = (t: number, poolIdx: number) =>
      easeInOutExpo(clamp01((t - (growStart + growRank[poolIdx] * ENTRY.growStagger)) / ENTRY.growDuration))

    const draw = (t: number) => {
      layout(t)

      // ---- pass 1: the row, into the framebuffer ----
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.viewport(0, 0, cv.width, cv.height)
      gl.clearColor(clearR, clearG, clearB, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.useProgram(panelProg)
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.enableVertexAttribArray(panelPos)
      gl.vertexAttribPointer(panelPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform2f(panelU.uRes, W, H)
      gl.uniform1i(panelU.uTex, 0)
      gl.activeTexture(gl.TEXTURE0)
      for (const p of placed) {
        gl.bindTexture(gl.TEXTURE_2D, sources[p.src].tex!)
        gl.uniform2f(panelU.uCenter, p.x, p.y)
        gl.uniform2f(panelU.uSize, p.w, p.h)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      // ---- pass 2: the framebuffer, through the lens ----
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, cv.width, cv.height)
      gl.useProgram(lensProg)
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.enableVertexAttribArray(lensPos)
      gl.vertexAttribPointer(lensPos, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, fboTex)
      gl.uniform1i(lensU.uTex, 0)

      gl.uniform2f(lensU.uRes, cv.width, cv.height)
      gl.uniform2f(lensU.uCenter, LENS.posX, LENS.posY)
      gl.uniform1f(lensU.uSizeX, LENS.sizeX)
      gl.uniform1f(lensU.uSizeY, LENS.sizeY)
      gl.uniform1f(lensU.uAspect, W / H)
      gl.uniform1f(lensU.uBlur, LENS.blur)
      gl.uniform1f(lensU.uGlow, LENS.glow)
      gl.uniform1f(lensU.uWhiteGlow, LENS.whiteGlow)
      gl.uniform1f(lensU.uNovaSize, LENS.novaSize)
      gl.uniform1f(lensU.uRingRadius, LENS.ringRadius)
      gl.uniform1f(lensU.uRingWidth, LENS.ringWidth)
      gl.uniform1f(lensU.uShimmer, LENS.shimmer ? 1 : 0)
      gl.uniform1f(lensU.uShimmerFreq, LENS.shimmerFreq)
      gl.uniform1f(lensU.uShimmerSpeed, LENS.shimmerSpeed)
      gl.uniform1f(lensU.uShimmerDepth, LENS.shimmerDepth)
      gl.uniform1f(lensU.uTime, t)
      gl.uniform1f(lensU.uRimStart, LENS.rimStart)
      gl.uniform1f(lensU.uRimFreq1, LENS.rimFreq1)
      gl.uniform1f(lensU.uRimFreq2, LENS.rimFreq2)
      gl.uniform3f(lensU.uBlueColor, blue[0], blue[1], blue[2])
      gl.uniform1f(lensU.uRimLinePos, LENS.rimLinePos)
      gl.uniform1f(lensU.uRimLineWidth, LENS.rimLineWidth)
      gl.uniform1f(lensU.uVignetteSize, LENS.vignetteSize)
      gl.uniform1f(lensU.uShape, LENS.shape === 'square' ? 1 : 0)
      gl.uniform1f(lensU.uSquareRound, LENS.squareRound)
      gl.uniform1f(lensU.uRotation, ((LENS.rotation + LENS.spin * t) * Math.PI) / 180)
      gl.uniform1i(lensU.uSamples, LENS.samples)

      // The distortion props all ride one factor, so the lens blooms in as a whole.
      const fx = reduce ? 1 : easeInOutQuad(clamp01((t - growStart) / ENTRY.lensBloom))
      const fxOf: Record<(typeof LENS_FX_KEYS)[number], number> = {
        uDispersion: LENS.dispersion,
        uBlueRing: LENS.blueRing,
        uRimLine: LENS.rimLine,
        uVignette: LENS.vignette,
        uZoom: LENS.zoom,
        uRimTangential: LENS.rimTangential,
        uRimInward: LENS.rimInward,
      }
      for (const k of LENS_FX_KEYS) gl.uniform1f(lensU[k], fxOf[k] * fx)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    const step = (t: number) => {
      // Autoplay stands in for the original's wheel. It moves the TARGET only, so the
      // landing is the tail of the same glide rather than a second animation.
      if (t >= nextAdvance) {
        autoIndex += 1
        target = centerForIndex(autoIndex)
        nextAdvance = Infinity // re-armed below, once this glide has died out
      }
      scroll += (target - scroll) * EASE
      if (nextAdvance === Infinity && t >= growEnd && Math.abs(target - scroll) < 0.5) {
        nextAdvance = t + HOLD
      }

      // scroll speed -> energy 0..1. Fast attack when speeding up, slow decay when
      // settling, so the shrink leads the motion and trails the stop.
      const raw = scroll - prevScroll
      prevScroll = scroll
      const norm = Math.min(1, Math.abs(raw) / Math.max(1, shrinkMax))
      scrollEnergy += (norm - scrollEnergy) * (norm > scrollEnergy ? SHRINK_ATTACK : SHRINK_DECAY)
    }

    const frame = (now: number) => {
      if (t0 == null) t0 = now
      const t = (now - t0) / 1000 - ENTRY.delay
      step(Math.max(t, 0))
      draw(Math.max(t, 0))
      if (visible && !disposed) raf = requestAnimationFrame(frame)
    }

    const stopLoop = () => cancelAnimationFrame(raf)
    const startLoop = (now: number) => {
      if (reduce || disposed || !visible || !ready) return
      // Push the origin forward by however long we were parked, so the entry resumes
      // where it stopped instead of jumping to wherever the clock has got to.
      if (t0 != null && pausedAt != null) t0 += now - pausedAt
      pausedAt = null
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    // ---- load every image before starting, so the row's widths never shift underfoot ----
    let pending = IMAGES.length
    IMAGES.forEach((srcUrl, i) => {
      const img = new Image()
      images.push(img)
      img.onload = () => {
        if (disposed) return
        const tex = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        // Panels render a fraction of full height during the entry; mipmaps and
        // anisotropy are what keep that downscale from going mushy.
        if (isGL2) {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
          gl.generateMipmap(gl.TEXTURE_2D)
          if (aniso) {
            const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
            gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, max)
          }
        } else {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        }
        sources[i].tex = tex
        sources[i].aspect = img.naturalWidth / img.naturalHeight

        if (--pending > 0) return

        size()
        scroll = centerForIndex(0)
        target = scroll
        prevScroll = scroll
        planEntry()
        ready = true
        if (reduce) draw(growEnd + ENTRY.lensBloom) // one settled static frame
        else startLoop(performance.now())
      }
      img.src = srcUrl
    })

    // The tile and the drawer are different sizes, and the grid reflows — track the
    // element rather than the window.
    const ro = new ResizeObserver(() => {
      if (!ready) return
      size()
      if (reduce) draw(growEnd + ENTRY.lensBloom)
    })
    ro.observe(stage)

    // The gallery mounts every canvas at once, so a tile scrolled out of the grid must not
    // keep a rAF loop alive. The margin restarts it just before it comes back into view.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) startLoop(performance.now())
        else {
          pausedAt = performance.now()
          stopLoop()
        }
      },
      { rootMargin: '160px' },
    )
    io.observe(stage)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      for (const img of images) img.onload = null
      for (const s of sources) if (s.tex) gl.deleteTexture(s.tex)
      gl.deleteTexture(fboTex)
      gl.deleteFramebuffer(fbo)
      gl.deleteBuffer(quad)
      gl.deleteProgram(panelProg)
      gl.deleteProgram(lensProg)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      cv.remove()
    }
  }, [])

  return <div ref={stageRef} className="absolute inset-0" />
}
`;export{e as default};
