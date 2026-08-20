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
  const svg = buildSvg(input);
  const output = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
  return new Uint8Array(output);
}

function buildSvg(input: { width: number; height: number; eyebrow: string; title: string; body: string; footer: string }) {
  const { width, height } = input;
  const margin = Math.round(width * 0.075);
  const titleSize = height > 1500 ? 76 : height > 1200 ? 62 : 58;
  const bodySize = height > 1500 ? 42 : 36;
  const titleLines = wrapArabic(input.title, height > 1500 ? 19 : 24, 4);
  const bodyLines = wrapArabic(input.body, height > 1500 ? 31 : 38, height > 1500 ? 8 : 7);
  const titleY = height > 1500 ? 520 : height > 1200 ? 390 : 340;
  const bodyY = titleY + titleLines.length * (titleSize + 18) + 54;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#F4EBDD"/>
  <rect x="0" y="0" width="${width}" height="${Math.round(height * 0.18)}" fill="#0B1F3A"/>
  <circle cx="${Math.round(width * 0.89)}" cy="${Math.round(height * 0.05)}" r="${Math.round(width * 0.19)}" fill="#67B7E8" opacity="0.95"/>
  <circle cx="${Math.round(width * 0.03)}" cy="${Math.round(height * 0.18)}" r="${Math.round(width * 0.16)}" fill="#D5A53A" opacity="0.95"/>
  <text x="${width - margin}" y="${Math.round(height * 0.105)}" text-anchor="end" fill="#FFFDF8" font-family="Noto Sans Arabic, Arial, sans-serif" font-size="30" font-weight="700">${escapeXml(input.eyebrow)}</text>
  ${svgLines(titleLines, width - margin, titleY, titleSize, titleSize + 18, '#0B1F3A', 700)}
  ${svgLines(bodyLines, width - margin, bodyY, bodySize, bodySize + 19, '#10243F', 400)}
  <line x1="${margin}" y1="${height - 110}" x2="${width - margin}" y2="${height - 110}" stroke="#C7B89C" stroke-width="2"/>
  <text x="${width - margin}" y="${height - 55}" text-anchor="end" fill="#0B1F3A" font-family="Noto Sans Arabic, Arial, sans-serif" font-size="30" font-weight="700" direction="rtl">${escapeXml(input.footer)}</text>
</svg>`;
}

function svgLines(lines: string[], x: number, y: number, size: number, spacing: number, fill: string, weight: number) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * spacing}" text-anchor="end" direction="rtl" unicode-bidi="plaintext" fill="${fill}" font-family="Noto Sans Arabic, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`).join('\n');
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
