import { TimelineClip } from '../types';

function measureRichTextLayout(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  letterSpacing: number,
): { textW: number; lineH: number } {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  if (letterSpacing > 0) {
    const chars = Array.from(text);
    const total = chars.reduce(
      (acc, ch, i) => acc + ctx.measureText(ch).width + (i < chars.length - 1 ? letterSpacing : 0),
      0,
    );
    return { textW: total, lineH: fontSize * 1.25 };
  }
  return { textW: ctx.measureText(text).width, lineH: fontSize * 1.25 };
}

function drawTextWithTracking(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  letterSpacing: number,
  mode: 'fill' | 'stroke',
): void {
  if (!letterSpacing || letterSpacing <= 0) {
    if (mode === 'stroke') ctx.strokeText(text, centerX, centerY);
    else ctx.fillText(text, centerX, centerY);
    return;
  }
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalW =
    widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * letterSpacing;
  let cursor = centerX - totalW / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (mode === 'stroke') ctx.strokeText(ch, cursor, centerY);
    else ctx.fillText(ch, cursor, centerY);
    cursor += widths[i]! + letterSpacing;
  }
  ctx.textAlign = 'center';
}

/**
 * Renders any rich text clip (custom fonts, stroke, drop shadow, rounded pill background, gradient)
 * into a tight transparent canvas ready for Canvas2D / WebCodecs or FFmpeg PNG overlay.
 */
export function renderRichTextToCanvas(
  clip: TimelineClip,
  exportH: number,
): HTMLCanvasElement {
  const text = clip.textContent || clip.name || '';
  const fontSize = Math.max(18, Math.round((clip.fontSize || 30) * (exportH / 480)));
  const fontFamily = clip.fontFamily || 'Inter, sans-serif';
  const fontWeight = clip.fontWeight || '800';
  const letterSpacing = Math.round((clip.letterSpacing || 0) * (exportH / 480));
  const strokeW = Math.round((clip.strokeWidth || 0) * (exportH / 480));
  const padY = Math.max(8, Math.round((clip.bgPadding ?? 10) * (exportH / 480)));
  const padX = Math.round(padY * 1.8);
  const shadowMargin = Math.max(12, Math.round((clip.shadowBlur || 0) * (exportH / 480)) + strokeW * 2);

  const canvas = document.createElement('canvas');
  const measureCtx = canvas.getContext('2d');
  if (!measureCtx) return canvas;

  const { textW, lineH } = measureRichTextLayout(
    measureCtx,
    text,
    fontSize,
    fontFamily,
    fontWeight,
    letterSpacing,
  );

  const boxW = Math.ceil(textW + padX * 2);
  const boxH = Math.ceil(lineH + padY * 2);
  canvas.width = Math.max(4, boxW + shadowMargin * 2);
  canvas.height = Math.max(4, boxH + shadowMargin * 2);

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(
    Math.min(boxW, boxH) / 2,
    Math.round((clip.bgRadius ?? 8) * (exportH / 480)),
  );

  // Pill background
  if (clip.textBgColor && clip.textBgColor !== 'rgba(0,0,0,0)' && clip.textBgColor !== 'transparent') {
    ctx.save();
    ctx.fillStyle = clip.textBgColor;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (clip.shadowBlur && clip.shadowBlur > 0) {
    ctx.shadowColor = clip.shadowColor || 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = clip.shadowBlur * (exportH / 480);
    ctx.shadowOffsetY = 2 * (exportH / 480);
  }

  if (strokeW > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeW * 2;
    ctx.strokeStyle = clip.strokeColor || '#000000';
    drawTextWithTracking(ctx, text, cx, cy, letterSpacing, 'stroke');
  }

  if (clip.gradientColors && clip.gradientColors.length === 2) {
    const grad = ctx.createLinearGradient(cx - textW / 2, cy, cx + textW / 2, cy);
    grad.addColorStop(0, clip.gradientColors[0]);
    grad.addColorStop(1, clip.gradientColors[1]);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = clip.textColor || '#ffffff';
  }
  drawTextWithTracking(ctx, text, cx, cy, letterSpacing, 'fill');

  return canvas;
}

export async function renderSvgStickerToCanvas(
  svg: string,
  sizePx: number = 320,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx || !svg) return canvas;

  const img = new Image();
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1000);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
  });

  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    const ratio = Math.min(sizePx / img.naturalWidth, sizePx / img.naturalHeight);
    const dw = img.naturalWidth * ratio;
    const dh = img.naturalHeight * ratio;
    ctx.drawImage(img, (sizePx - dw) / 2, (sizePx - dh) / 2, dw, dh);
  }
  return canvas;
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) return new Uint8Array();
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}
