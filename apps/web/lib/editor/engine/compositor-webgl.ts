import { MaskConfig } from '../types';
import { ColorGradeValues } from './grading';

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_time;

// Pro Color & Film Grading Uniforms
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_exposure;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_sharpen;
uniform float u_temperature;
uniform float u_tint;
uniform float u_hue;
uniform float u_fade;
uniform float u_vignette;
uniform float u_grain;
uniform float u_blur;
uniform float u_sepia;
uniform float u_grayscale;
uniform float u_invert;

// Effects Bundle Flags
uniform float u_chromatic;
uniform float u_vhs;
uniform float u_flash;
uniform float u_flicker;
uniform float u_vignettePulse;

// Masking Uniforms
uniform int u_maskType; // 0=none,1=linear,2=mirror,3=circle,4=rect,5=star,6=heart
uniform vec4 u_maskRect; // x, y, w, h in [0..1]
uniform float u_maskRot;
uniform float u_maskRadius;
uniform float u_maskFeather; // pixels
uniform int u_maskInvert;

in vec2 v_uv;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hueShift(vec3 col, float hueDeg) {
  const vec3 k = vec3(0.57735);
  float rad = radians(hueDeg);
  float cosAngle = cos(rad);
  return vec3(
    col * cosAngle +
    cross(k, col) * sin(rad) +
    k * dot(k, col) * (1.0 - cosAngle)
  );
}

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float sdHeart(vec2 p) {
  p.x = abs(p.x);
  p.y = -p.y + 0.45;
  if (p.y + p.x > 1.0) {
    return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  }
  return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)),
                  dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) *
         sign(p.x - p.y);
}

float evaluateMaskAlpha(vec2 uv) {
  if (u_maskType == 0) return 1.0;

  vec2 center = u_maskRect.xy;
  vec2 pxSize = max(vec2(4.0), u_maskRect.zw * u_resolution);
  vec2 deltaPx = (uv - center) * u_resolution;

  float c = cos(-u_maskRot);
  float s = sin(-u_maskRot);
  vec2 p = vec2(deltaPx.x * c - deltaPx.y * s, deltaPx.x * s + deltaPx.y * c);

  float d = -1.0;
  if (u_maskType == 1) {
    // Linear split plane
    d = p.y;
  } else if (u_maskType == 2) {
    // Dual mirror strip
    d = abs(p.y) - pxSize.y * 0.5;
  } else if (u_maskType == 3) {
    // Circle / ellipse
    vec2 r = max(vec2(2.0), pxSize * 0.5);
    vec2 q = p / r;
    d = (length(q) - 1.0) * min(r.x, r.y);
  } else if (u_maskType == 4) {
    vec2 halfB = max(vec2(2.0), pxSize * 0.5);
    float rad = u_maskRadius * min(halfB.x, halfB.y);
    d = sdBox(p, halfB, rad);
  } else if (u_maskType == 5) {
    float normR = max(4.0, min(pxSize.x, pxSize.y) * 0.5);
    vec2 q = p / vec2(pxSize.x / (normR * 2.0), pxSize.y / (normR * 2.0));
    d = sdStar5(vec2(q.x, -q.y), normR, 0.44);
  } else if (u_maskType == 6) {
    vec2 r = max(vec2(4.0), pxSize * 0.55);
    d = sdHeart(p / r) * min(r.x, r.y);
  }

  float feather = max(1.0, u_maskFeather);
  float alpha = 1.0 - smoothstep(-feather * 0.5, feather * 0.5, d);
  if (u_maskInvert == 1) alpha = 1.0 - alpha;
  return clamp(alpha, 0.0, 1.0);
}

void main() {
  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  vec2 uv = v_uv;

  // Optional VHS subtle horizontal line jitter
  if (u_vhs > 0.0) {
    float wave = sin(uv.y * 110.0 + u_time * 18.0) * 0.0028 * u_vhs;
    uv.x += wave;
  }

  vec4 centerSample = texture(u_tex, clamp(uv, 0.0, 1.0));
  vec3 col = centerSample.rgb;

  // Box-sampled blur when enabled
  if (u_blur > 0.25) {
    float r = clamp(u_blur * 0.45, 0.5, 10.0);
    vec3 acc = vec3(0.0);
    float total = 0.0;
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        vec2 off = vec2(float(x), float(y)) * texel * r;
        acc += texture(u_tex, clamp(uv + off, 0.0, 1.0)).rgb;
        total += 1.0;
      }
    }
    col = acc / total;
  }

  // Chromatic aberration RGB split
  if (u_chromatic > 0.0) {
    vec2 dir = (uv - 0.5) * 0.014 * u_chromatic;
    col.r = texture(u_tex, clamp(uv + dir, 0.0, 1.0)).r;
    col.b = texture(u_tex, clamp(uv - dir, 0.0, 1.0)).b;
  }

  // 3x3 Unsharp sharpen pass
  if (u_sharpen > 0.0) {
    vec3 n = texture(u_tex, clamp(uv + vec2(0.0, -texel.y), 0.0, 1.0)).rgb;
    vec3 s = texture(u_tex, clamp(uv + vec2(0.0, texel.y), 0.0, 1.0)).rgb;
    vec3 w = texture(u_tex, clamp(uv + vec2(-texel.x, 0.0), 0.0, 1.0)).rgb;
    vec3 e = texture(u_tex, clamp(uv + vec2(texel.x, 0.0), 0.0, 1.0)).rgb;
    vec3 blurNeighborhood = (n + s + w + e) * 0.25;
    float amount = (u_sharpen / 100.0) * 1.4;
    col = clamp(col + (col - blurNeighborhood) * amount, 0.0, 1.0);
  }

  // Convert sRGB -> linear approximations for accurate EV exposure & highlights/shadows
  vec3 lin = pow(max(col, vec3(0.0)), vec3(2.2));
  lin *= pow(2.0, u_exposure);
  if (u_flicker > 0.0) {
    lin *= 1.0 + sin(u_time * 38.0) * 0.07 * u_flicker;
  }
  col = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));

  // Brightness & Contrast
  col *= (u_brightness / 100.0);
  col = (col - 0.5) * (u_contrast / 100.0) + 0.5;

  // Highlights & Shadows knee adjustment
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float hiWeight = smoothstep(0.45, 1.0, luma);
  float shWeight = 1.0 - smoothstep(0.0, 0.55, luma);
  col += (u_highlights / 100.0) * 0.35 * hiWeight;
  col += (u_shadows / 100.0) * 0.35 * shWeight;

  // Temperature (Blue <-> Amber) & Tint (Green <-> Magenta)
  float tempN = (u_temperature / 100.0) * 0.18;
  float tintN = (u_tint / 100.0) * 0.14;
  col.r += tempN + tintN * 0.4;
  col.g -= tintN;
  col.b -= tempN - tintN * 0.4;

  // Hue Rotation & Saturation
  if (abs(u_hue) > 0.1) {
    col = hueShift(col, u_hue);
  }
  float satLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(satLuma), col, u_saturation / 100.0);

  // Classic Sepia / Grayscale / Invert
  if (u_grayscale > 0.0) {
    float gs = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(gs), u_grayscale / 100.0);
  }
  if (u_sepia > 0.0) {
    vec3 sep = vec3(
      dot(col, vec3(0.393, 0.769, 0.189)),
      dot(col, vec3(0.349, 0.686, 0.168)),
      dot(col, vec3(0.272, 0.534, 0.131))
    );
    col = mix(col, sep, u_sepia / 100.0);
  }
  if (u_invert > 0.0) {
    col = mix(col, 1.0 - col, u_invert / 100.0);
  }

  // Matte Fade lift
  if (u_fade > 0.0) {
    float floorLift = (u_fade / 100.0) * 0.18;
    col = mix(col, vec3(floorLift) + col * (1.0 - floorLift * 0.6), u_fade / 100.0);
  }

  // VHS scanline darkening
  if (u_vhs > 0.0) {
    float scan = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.9);
    col *= mix(1.0, scan, u_vhs);
  }

  // Flash effect pulse
  if (u_flash > 0.0) {
    float pulse = pow(max(0.0, sin(u_time * 12.0)), 6.0);
    col += vec3(pulse * 0.75 * u_flash);
  }

  // Vignette (plus optional animated vignette pulse)
  float vigStrength = u_vignette;
  if (u_vignettePulse > 0.0) {
    vigStrength = clamp(vigStrength + (0.5 + 0.5 * sin(u_time * 4.5)) * 45.0 * u_vignettePulse, 0.0, 100.0);
  }
  if (vigStrength > 0.0) {
    float dist = distance(v_uv, vec2(0.5));
    float vig = smoothstep(0.85, 0.25, dist * (0.75 + (vigStrength / 100.0) * 0.85));
    col *= mix(1.0, vig, clamp(vigStrength / 100.0, 0.0, 1.0));
  }

  // Animated film grain
  if (u_grain > 0.0) {
    float n = hash12(gl_FragCoord.xy + fract(u_time) * 913.0) - 0.5;
    col += vec3(n * (u_grain / 100.0) * 0.22);
  }

  float maskAlpha = evaluateMaskAlpha(v_uv);
  fragColor = vec4(clamp(col, 0.0, 1.0), centerSample.a * maskAlpha);
}
`;

function maskTypeToInt(type: MaskConfig['type'] | undefined): number {
  switch (type) {
    case 'linear': return 1;
    case 'mirror': return 2;
    case 'circle': return 3;
    case 'rect': return 4;
    case 'star': return 5;
    case 'heart': return 6;
    case 'none':
    default: return 0;
  }
}

export class WebGL2LayerProcessor {
  public readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniformCache = new Map<string, WebGLUniformLocation | null>();

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.init();
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('WebGL2 shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return;
    this.gl = gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('WebGL2 program link error:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.tex = tex;
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.gl || !this.program) return null;
    if (!this.uniformCache.has(name)) {
      this.uniformCache.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniformCache.get(name) ?? null;
  }

  public isReady(): boolean {
    return Boolean(this.gl && this.program && this.tex && this.vao);
  }

  public renderFrame(
    source: TexImageSource,
    width: number,
    height: number,
    grade: ColorGradeValues,
    mask: MaskConfig | undefined,
    layerEffects: string[] = [],
    timeSec: number = 0,
  ): boolean {
    const gl = this.gl;
    if (!gl || !this.program || !this.tex || !this.vao) return false;

    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return false;
    }

    gl.uniform1i(this.loc('u_tex'), 0);
    gl.uniform2f(this.loc('u_resolution'), w, h);
    gl.uniform1f(this.loc('u_time'), timeSec);

    gl.uniform1f(this.loc('u_brightness'), grade.brightness);
    gl.uniform1f(this.loc('u_contrast'), grade.contrast);
    gl.uniform1f(this.loc('u_saturation'), grade.saturation);
    gl.uniform1f(this.loc('u_exposure'), grade.exposure);
    gl.uniform1f(this.loc('u_highlights'), grade.highlights);
    gl.uniform1f(this.loc('u_shadows'), grade.shadows);
    gl.uniform1f(this.loc('u_sharpen'), grade.sharpen);
    gl.uniform1f(this.loc('u_temperature'), grade.temperature);
    gl.uniform1f(this.loc('u_tint'), grade.tint);
    gl.uniform1f(this.loc('u_hue'), grade.hue);
    gl.uniform1f(this.loc('u_fade'), grade.fade);
    gl.uniform1f(this.loc('u_vignette'), grade.vignette);
    gl.uniform1f(this.loc('u_grain'), grade.grain);
    gl.uniform1f(this.loc('u_blur'), grade.blur + (layerEffects.includes('blur-zoom') ? 6 : 0));
    gl.uniform1f(this.loc('u_sepia'), grade.sepia);
    gl.uniform1f(this.loc('u_grayscale'), grade.grayscale);
    gl.uniform1f(this.loc('u_invert'), grade.invert);

    gl.uniform1f(this.loc('u_chromatic'), layerEffects.includes('chromatic') ? 1.0 : 0.0);
    gl.uniform1f(this.loc('u_vhs'), layerEffects.includes('vhs') ? 1.0 : 0.0);
    gl.uniform1f(this.loc('u_flash'), layerEffects.includes('flash') ? 1.0 : 0.0);
    gl.uniform1f(this.loc('u_flicker'), layerEffects.includes('film-flicker') ? 1.0 : 0.0);
    gl.uniform1f(this.loc('u_vignettePulse'), layerEffects.includes('vignette-pulse') ? 1.0 : 0.0);

    const mType = mask ? maskTypeToInt(mask.type) : 0;
    gl.uniform1i(this.loc('u_maskType'), mType);
    gl.uniform4f(
      this.loc('u_maskRect'),
      (mask?.x ?? 50) / 100,
      (mask?.y ?? 50) / 100,
      (mask?.width ?? 65) / 100,
      (mask?.height ?? 65) / 100,
    );
    gl.uniform1f(this.loc('u_maskRot'), ((mask?.rotation ?? 0) * Math.PI) / 180);
    gl.uniform1f(this.loc('u_maskRadius'), (mask?.cornerRadius ?? 0) / 100);
    gl.uniform1f(this.loc('u_maskFeather'), mask?.feather ?? 0);
    gl.uniform1i(this.loc('u_maskInvert'), mask?.inverted ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }

  public dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.tex = null;
    this.program = null;
    this.vao = null;
  }
}
