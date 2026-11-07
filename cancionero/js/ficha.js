// La ficha de la Misa que se comparte por WhatsApp (PRD §5.2), igual que MassCardGenerator.kt: un esquema impreso
// de 1080 px de ancho y como mucho 1325 de alto, siempre con los colores del modo claro.
import { MOMENTS, DEFAULT_COMMUNITY, formatShortDate } from './misa.js';

const LIGHT = {
  background: '#ffffff',
  surfaceCard: '#f2f2f7',
  titleText: '#000000',
  textPrimary: '#000000',
  textSecondary: '#6c6c70',
  brand: '#0066cc',
  brandTint: '#e0f1ff',
  momentLabel: '#0066cc',
  goldFill: '#b8925a',
};
const CROSS_RAYS = 'M17,16.5 L24.5,24 M79,16.5 L71.5,24 M7,43.5 L18,43.5 M78,43.5 L89,43.5';
const CROSS_BODY =
  'M44.5,4.5 H51.5 A1,1 0 0,1 52.5,5.5 V31 H71 A1,1 0 0,1 72,32 V39 A1,1 0 0,1 71,40 H52.5 V90.5 A1,1 0 0,1 51.5,91.5 H44.5 A1,1 0 0,1 43.5,90.5 V40 H25 A1,1 0 0,1 24,39 V32 A1,1 0 0,1 25,31 H43.5 V5.5 A1,1 0 0,1 44.5,4.5 Z';

const W = 1080;
const MAX_H = 1325;
const FRAME_INSET = 44;
const FRAME_RADIUS = 34;
const CONTENT_INSET = 108;
const CROSS_TOP = 100;
const CROSS_SIZE = 92;
const ROW_HEIGHT = 100;
const FOOTER_GAP = 40;
const FOOTER_BOTTOM = 52;
const NAME_SIZE = 38;
const SONG_SIZE = 38;
const NUMBER_SIZE = 36;
const BADGE_HEIGHT = 66;
const BADGE_MIN_WIDTH = 76;
const BADGE_RADIUS = 14;
const BULLET_RADIUS = 6;
const COLUMN_GAP = 26;
const NAME_MAX_WIDTH = 330;

const SERIF = '"Source Serif", Georgia, serif';
const SANS = 'Inter, -apple-system, sans-serif';

/** Dibuja la ficha y la devuelve como PNG (Blob). */
export async function drawMassCard(plan, songsById) {
  await Promise.all([document.fonts.load(`600 54px ${SERIF}`), document.fonts.load(`400 38px ${SANS}`), document.fonts.load(`600 38px ${SANS}`)]);
  const entries = [];
  for (const slot of plan.slots) {
    const moment = MOMENTS.find((m) => m.code === slot.code);
    slot.songIds
      .map((id) => songsById.get(id))
      .filter(Boolean)
      .forEach((song, i) => entries.push({ name: i === 0 ? moment.cardName || moment.title : null, song }));
  }

  const measure = document.createElement('canvas').getContext('2d');
  const contentWidth = W - 2 * CONTENT_INSET;
  const community = (plan.community.trim() || DEFAULT_COMMUNITY).toLocaleUpperCase('es-PE');
  let titleSize = 54;
  measure.font = `600 ${titleSize}px ${SERIF}`;
  while (titleSize > 34 && measure.measureText(community).width * 1.02 > contentWidth) {
    titleSize -= 1;
    measure.font = `600 ${titleSize}px ${SERIF}`;
  }
  const metrics = (size) => ({ ascent: size * 0.93, descent: size * 0.27 }); // como ascent()/descent() de Android
  const title = metrics(titleSize);
  const sub = metrics(32);
  const footer = metrics(27);
  const titleBaseline = CROSS_TOP + CROSS_SIZE + 40 + title.ascent;
  const subtitleBaseline = titleBaseline + title.descent + 16 + sub.ascent;
  const rowsTop = subtitleBaseline + sub.descent + 56;
  const footerBlock = FOOTER_GAP + footer.descent + footer.ascent + FOOTER_BOTTOM + FRAME_INSET;
  const height = Math.min(Math.ceil(rowsTop + entries.length * ROW_HEIGHT + footerBlock), MAX_H);
  const rowHeight = entries.length ? Math.min(ROW_HEIGHT, (height - rowsTop - footerBlock) / entries.length) : ROW_HEIGHT;
  const scale = Math.min(1, Math.max(0.5, rowHeight / ROW_HEIGHT));

  const nameFont = `600 ${NAME_SIZE * scale}px ${SANS}`;
  const numberFont = `600 ${NUMBER_SIZE * scale}px ${SANS}`;
  const songFont = `400 ${SONG_SIZE * scale}px ${SANS}`;
  measure.font = nameFont;
  const nameLeft = CONTENT_INSET + (BULLET_RADIUS * 2 + 14) * scale;
  const nameWidth = Math.min(Math.max(0, ...entries.filter((e) => e.name).map((e) => measure.measureText(e.name).width)), NAME_MAX_WIDTH * scale);
  const badgeLeft = nameLeft + nameWidth + COLUMN_GAP * scale;
  measure.font = numberFont;
  const badgeWidth = Math.max(BADGE_MIN_WIDTH * scale, Math.max(0, ...entries.map((e) => measure.measureText(e.song.displayNumber).width)) + 30 * scale);
  const songLeft = badgeLeft + badgeWidth + COLUMN_GAP * scale;
  const songWidth = W - CONTENT_INSET - songLeft;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  // Hoja blanca sobre el gris de las tarjetas, con un marco fino del dorado de la cruz.
  ctx.fillStyle = LIGHT.surfaceCard;
  ctx.fillRect(0, 0, W, height);
  roundRect(ctx, FRAME_INSET, FRAME_INSET, W - 2 * FRAME_INSET, height - 2 * FRAME_INSET, FRAME_RADIUS);
  ctx.fillStyle = LIGHT.background;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = LIGHT.goldFill;
  ctx.stroke();

  // La cruz con su propio dorado, como en Inicio.
  ctx.save();
  ctx.translate((W - CROSS_SIZE) / 2, CROSS_TOP);
  ctx.scale(CROSS_SIZE / 96, CROSS_SIZE / 96);
  ctx.fillStyle = LIGHT.goldFill;
  ctx.fill(new Path2D(CROSS_BODY));
  ctx.strokeStyle = LIGHT.goldFill;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(CROSS_RAYS));
  ctx.restore();

  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = LIGHT.titleText;
  ctx.font = `600 ${titleSize}px ${SERIF}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${titleSize * 0.02}px`;
  ctx.fillText(ellipsize(ctx, community, contentWidth), cx, titleBaseline);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  // Source Serif solo viene en SemiBold: la cursiva se inclina.
  ctx.save();
  ctx.font = `600 32px ${SERIF}`;
  ctx.fillStyle = LIGHT.textSecondary;
  ctx.translate(cx, subtitleBaseline);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  ctx.fillText(ellipsize(ctx, `Esquema Litúrgico • ${formatShortDate(plan.dateIso)}`, contentWidth), 0, 0);
  ctx.restore();

  const badgeHeight = BADGE_HEIGHT * scale;
  entries.forEach((entry, index) => {
    const rowCenter = rowsTop + index * rowHeight + rowHeight / 2;
    if (entry.name) {
      ctx.fillStyle = LIGHT.momentLabel;
      ctx.beginPath();
      ctx.arc(CONTENT_INSET + BULLET_RADIUS * scale, rowCenter, BULLET_RADIUS * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = nameFont;
      ctx.fillText(ellipsize(ctx, entry.name, nameWidth), nameLeft, baseline(rowCenter, NAME_SIZE * scale));
    }
    roundRect(ctx, badgeLeft, rowCenter - badgeHeight / 2, badgeWidth, badgeHeight, BADGE_RADIUS * scale);
    ctx.fillStyle = LIGHT.brandTint;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = numberFont;
    ctx.fillStyle = LIGHT.brand;
    ctx.fillText(entry.song.displayNumber, badgeLeft + badgeWidth / 2, baseline(rowCenter, NUMBER_SIZE * scale));
    ctx.textAlign = 'left';
    ctx.font = songFont;
    ctx.fillStyle = LIGHT.textPrimary;
    ctx.fillText(ellipsize(ctx, entry.song.title, songWidth), songLeft, baseline(rowCenter, SONG_SIZE * scale));
  });

  ctx.textAlign = 'center';
  ctx.font = `400 27px ${SANS}`;
  ctx.fillStyle = LIGHT.textSecondary;
  ctx.fillText('Cancionero Parroquial', cx, height - FRAME_INSET - FOOTER_BOTTOM - footer.descent);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** La línea base que centra el texto en `centerY` (ascent y descent de Inter). */
const baseline = (centerY, size) => centerY + (size * 0.93 - size * 0.27) / 2;

function ellipsize(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
