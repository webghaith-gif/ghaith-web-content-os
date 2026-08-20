import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { PDFDocument } from 'pdf-lib';
import type { ContentItem } from '../core/types';

const execFileAsync = promisify(execFile);

export interface RenderedMedia {
  social?: Uint8Array;
  carouselSlides: Uint8Array[];
  carouselPdf?: Uint8Array;
  video?: Uint8Array;
}

export async function renderFallbackMedia(content: ContentItem): Promise<RenderedMedia> {
  const social = await renderPng({
    width: 1080,
    height: 1080,
    eyebrow: 'GHAITH WEB',
    title: content.package.hook || content.title,
    body: content.package.caption || content.package.description || '',
    footer: 'غيث ويب',
  });

  const slides = (content.package.carouselSlides ?? []).slice(0, 5);
  const carouselSlides: Uint8Array[] = [];
  for (let index = 0; index < 5; index += 1) {
    const slide = slides[index] ?? {};
    const points = Array.isArray(slide.points) ? slide.points.filter(Boolean).slice(0, 4) : [];
    const body = [slide.body ?? '', ...points.map((x) => `• ${x}`)].filter(Boolean).join('\n');
    carouselSlides.push(await renderPng({
      width: 1080,
      height: 1350,
      eyebrow: `GHAITH WEB  •  ${String(index + 1).padStart(2, '0')}/05`,
      title: slide.title || content.package.hook || content.title,
      body,
      footer: 'غيث ويب',
    }));
  }

  const carouselPdf = await makePdf(carouselSlides, 1080, 1350);

  const scenes = (content.package.videoScenes ?? []).slice(0, 3);
  const videoFrames: Uint8Array[] = [];
  for (let index = 0; index < 3; index += 1) {
    const scene = scenes[index] ?? {};
    videoFrames.push(await renderPng({
      width: 1080,
      height: 1920,
      eyebrow: `GHAITH WEB  •  ${String(index + 1).padStart(2, '0')}/03`,
      title: scene.title || content.title,
      body: scene.body || content.package.script || content.package.caption || '',
      footer: 'غيث ويب',
    }));
  }

  const video = await makeVideo(videoFrames).catch(() => undefined);
  return { social, carouselSlides, carouselPdf, video };
}

async function renderPng(input: { width: number; height: number; eyebrow: string; title: string; body: string; footer: string }) {
  const { width, height } = input;
  const margin = Math.round(width * 0.075);
  const titleSize = height > 1500 ? 76 : height > 1200 ? 62 : 58;
  const bodySize = height > 1500 ? 42 : 36;
  const titleLines = wrapArabic(input.title, height > 1500 ? 19 : 24, 4);
  const bodyLines = wrapArabic(input.body, height > 1500 ? 31 : 38, height > 1500 ? 8 : 7);
  const titleY = height > 1500 ? 470 : height > 1200 ? 340 : 290;
  const bodyY = titleY + titleLines.length * (titleSize + 18) + 54;
  const fontfile = path.join(__dirname, '..', 'assets', 'DejaVuSans.ttf');
  const background = Buffer.from(buildBackgroundSvg(width, height, margin));
  const layers = await Promise.all([
    textLayer(input.eyebrow, width - margin * 2, 55, 30, '#FFFDF8', fontfile, true),
    textLayer(titleLines.join('\n'), width - margin * 2, Math.min(420, titleLines.length * (titleSize + 22)), titleSize, '#0B1F3A', fontfile, true),
    textLayer(bodyLines.join('\n'), width - margin * 2, Math.min(540, bodyLines.length * (bodySize + 22)), bodySize, '#10243F', fontfile, false),
    textLayer(input.footer, width - margin * 2, 55, 30, '#0B1F3A', fontfile, true),
  ]);
  const output = await sharp(background).composite([
    { input: layers[0]!, left: margin, top: Math.round(height * 0.055) },
    { input: layers[1]!, left: margin, top: titleY },
    { input: layers[2]!, left: margin, top: bodyY },
    { input: layers[3]!, left: margin, top: height - 105 },
  ]).png({ compressionLevel: 8 }).toBuffer();
  await assertReadableText(output, input);
  return new Uint8Array(output);
}

function buildBackgroundSvg(width: number, height: number, margin: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#F4EBDD"/>
  <rect x="0" y="0" width="${width}" height="${Math.round(height * 0.18)}" fill="#0B1F3A"/>
  <circle cx="${Math.round(width * 0.89)}" cy="${Math.round(height * 0.05)}" r="${Math.round(width * 0.19)}" fill="#67B7E8" opacity="0.95"/>
  <circle cx="${Math.round(width * 0.03)}" cy="${Math.round(height * 0.18)}" r="${Math.round(width * 0.16)}" fill="#D5A53A" opacity="0.95"/>
  <line x1="${margin}" y1="${height - 110}" x2="${width - margin}" y2="${height - 110}" stroke="#C7B89C" stroke-width="2"/>
</svg>`;
}

async function textLayer(value: string, width: number, height: number, size: number, color: string, fontfile: string, bold: boolean) {
  if (!value.trim()) return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const markup = `<span foreground="${color}" weight="${bold ? 'bold' : 'normal'}" size="${size * 700}">${escapeXml(value)}</span>`;
  return sharp({ text: { text: markup, fontfile, width, height, align: 'right', rgba: true } }).png().toBuffer();
}

async function assertReadableText(output: Buffer, input: { width: number; height: number; title: string; body: string }) {
  if (!input.title.trim() && !input.body.trim()) throw new Error('Visual asset rejected: title and body are empty.');
  const top = Math.round(input.height * 0.23);
  const height = Math.max(80, Math.round(input.height * 0.58));
  const stats = await sharp(output).extract({ left: Math.round(input.width * 0.06), top, width: Math.round(input.width * 0.88), height }).stats();
  const variation = Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev));
  if (!Number.isFinite(variation) || variation < 4) {
    throw new Error('Visual asset rejected: the text region appears blank or unreadable.');
  }
}

function wrapArabic(value: string, maxChars: number, maxLines: number) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (words.join(' ').length > lines.join(' ').length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]!.replace(/[.…]+$/, '')}…`;
  return lines.length ? lines : [''];
}

async function makePdf(images: Uint8Array[], width: number, height: number) {
  const pdf = await PDFDocument.create();
  for (const image of images) {
    const png = await pdf.embedPng(image);
    const page = pdf.addPage([width, height]);
    page.drawImage(png, { x: 0, y: 0, width, height });
  }
  return new Uint8Array(await pdf.save());
}

async function makeVideo(frames: Uint8Array[]) {
  if (!ffmpegPath) throw new Error('ffmpeg-static is unavailable.');
  const dir = await mkdtemp(path.join(tmpdir(), 'ghaith-video-'));
  try {
    const framePaths: string[] = [];
    for (let index = 0; index < frames.length; index += 1) {
      const file = path.join(dir, `scene-${index + 1}.png`);
      await writeFile(file, frames[index]!);
      framePaths.push(file);
    }
    const out = path.join(dir, 'video.mp4');
    const args: string[] = ['-y'];
    for (const frame of framePaths) args.push('-loop', '1', '-t', '4', '-i', frame);
    const filters = framePaths.map((_, i) => `[${i}:v]fps=25,format=yuv420p[v${i}]`).join(';');
    const concat = framePaths.map((_, i) => `[v${i}]`).join('') + `concat=n=${framePaths.length}:v=1:a=0[outv]`;
    args.push('-filter_complex', `${filters};${concat}`, '-map', '[outv]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
    await execFileAsync(ffmpegPath, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function escapeXml(value: string) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] ?? c));
}
