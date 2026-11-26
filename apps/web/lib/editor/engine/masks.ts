import { MaskConfig, MaskType } from '../types';

export const DEFAULT_MASK_CONFIG: MaskConfig = {
  type: 'none',
  x: 50,
  y: 50,
  width: 65,
  height: 65,
  rotation: 0,
  cornerRadius: 12,
  feather: 0,
  inverted: false,
};

export const MASK_PRESETS: Array<{ id: MaskType; label: string; defaults?: Partial<MaskConfig> }> = [
  { id: 'none', label: 'None' },
  { id: 'linear', label: 'Split', defaults: { x: 50, y: 50, width: 100, height: 100, rotation: 0, feather: 8 } },
  { id: 'mirror', label: 'Mirror', defaults: { x: 50, y: 50, width: 55, height: 55, rotation: 0, feather: 6 } },
  { id: 'circle', label: 'Circle', defaults: { x: 50, y: 50, width: 65, height: 65, rotation: 0, feather: 4 } },
  { id: 'rect', label: 'Rectangle', defaults: { x: 50, y: 50, width: 75, height: 70, cornerRadius: 12, rotation: 0, feather: 0 } },
  { id: 'star', label: 'Star', defaults: { x: 50, y: 50, width: 70, height: 70, rotation: 0, feather: 2 } },
  { id: 'heart', label: 'Heart', defaults: { x: 50, y: 50, width: 65, height: 65, rotation: 0, feather: 2 } },
];

export function traceMaskPath2D(
  ctx: CanvasRenderingContext2D,
  mask: MaskConfig,
  w: number,
  h: number,
): void {
  const cx = (mask.x / 100) * w;
  const cy = (mask.y / 100) * h;
  const mw = Math.max(4, (mask.width / 100) * w);
  const mh = Math.max(4, (mask.height / 100) * h);
  const rad = ((mask.rotation || 0) * Math.PI) / 180;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  ctx.beginPath();

  if (mask.type === 'linear') {
    // Upper half plane from -big to 0 along rotated Y axis
    ctx.rect(-w * 2, -h * 2, w * 4, h * 2);
  } else if (mask.type === 'mirror') {
    ctx.rect(-w * 2, -mh / 2, w * 4, mh);
  } else if (mask.type === 'circle') {
    ctx.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
  } else if (mask.type === 'rect') {
    const r = Math.min(mw / 2, mh / 2, (mask.cornerRadius / 100) * Math.min(mw, mh));
    ctx.roundRect(-mw / 2, -mh / 2, mw, mh, r);
  } else if (mask.type === 'star') {
    const spikes = 5;
    const outerR = Math.min(mw, mh) / 2;
    const innerR = outerR * 0.42;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / spikes - Math.PI / 2;
      const sx = Math.cos(a) * r * (mw / Math.min(mw, mh));
      const sy = Math.sin(a) * r * (mh / Math.min(mw, mh));
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
  } else if (mask.type === 'heart') {
    const rx = mw / 2;
    const ry = mh / 2;
    ctx.moveTo(0, ry * 0.72);
    ctx.bezierCurveTo(-rx * 1.15, ry * 0.05, -rx * 0.9, -ry * 0.95, 0, -ry * 0.35);
    ctx.bezierCurveTo(rx * 0.9, -ry * 0.95, rx * 1.15, ry * 0.05, 0, ry * 0.72);
    ctx.closePath();
  }

  ctx.restore();
}

/**
 * Renders a grayscale/alpha mask bitmap into `maskCanvas` for FFmpeg alphamerge or Canvas2D masking.
 */
export function renderMaskAlphaCanvas(
  mask: MaskConfig,
  w: number,
  h: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (mask.inverted) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (mask.feather > 0) ctx.filter = `blur(${mask.feather}px)`;
    ctx.globalCompositeOperation = 'destination-out';
    traceMaskPath2D(ctx, mask, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.fill();
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mask.feather > 0) ctx.filter = `blur(${mask.feather}px)`;
    traceMaskPath2D(ctx, mask, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  return canvas;
}
