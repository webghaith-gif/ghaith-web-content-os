import React from 'react';
import { loadFont } from '@remotion/fonts';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

loadFont({ family: 'GhaithArabic', url: staticFile('DejaVuSans.ttf'), weight: '400', format: 'truetype' });

export interface GhaithVideoScene {
  title?: string;
  body?: string;
}

export interface GhaithVideoProps extends Record<string, unknown> {
  title: string;
  hook: string;
  cta: string;
  scenes: GhaithVideoScene[];
}

const palette = {
  ink: '#071B33',
  navy: '#0B2748',
  blue: '#28A8E9',
  cyan: '#70D9F3',
  sand: '#F4EBDD',
  gold: '#E7B547',
  white: '#FFFDF8',
};

const boundedText = (value: string | undefined, max: number, fallback: string) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim() || fallback;
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
};

const useResponsiveLayout = () => {
  const { width, height } = useVideoConfig();
  const ratio = width / height;
  const landscape = ratio >= 1.35;
  const square = ratio >= 0.9 && ratio < 1.35;
  const side = Math.round(width * (landscape ? 0.075 : 0.072));
  const minSide = Math.min(width, height);
  return {
    width,
    height,
    landscape,
    square,
    side,
    borderInset: Math.round(minSide * 0.05),
    headline: Math.round(landscape ? Math.min(width * 0.057, height * 0.1) : square ? width * 0.078 : width * 0.092),
    title: Math.round(landscape ? Math.min(width * 0.043, height * 0.073) : square ? width * 0.064 : width * 0.072),
    body: Math.round(landscape ? Math.min(width * 0.024, height * 0.04) : square ? width * 0.038 : width * 0.04),
    support: Math.round(landscape ? Math.min(width * 0.022, height * 0.038) : square ? width * 0.033 : width * 0.036),
  };
};

const AnimatedBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, borderInset } = useResponsiveLayout();
  const drift = Math.sin(frame / 28);
  const rotation = interpolate(frame, [0, 450], [-8, 18]);
  const large = Math.max(width, height) * 0.48;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: `linear-gradient(155deg, ${palette.ink} 0%, ${palette.navy} 54%, #123B62 100%)` }}>
      <div style={{ position: 'absolute', width: large, height: large, right: -large * 0.34 + drift * width * 0.025, top: -large * 0.23 + drift * height * 0.012, borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, ${palette.cyan}, ${palette.blue} 40%, transparent 72%)`, opacity: 0.38, filter: 'blur(4px)' }} />
      <div style={{ position: 'absolute', width: large * 0.83, height: large * 0.83, left: -large * 0.38 - drift * width * 0.02, bottom: -large * 0.2, borderRadius: large * 0.2, transform: `rotate(${rotation}deg)`, background: `linear-gradient(135deg, ${palette.gold}99, transparent)`, opacity: 0.34 }} />
      <div style={{ position: 'absolute', inset: borderInset, border: '2px solid rgba(255,255,255,.11)', borderRadius: Math.round(borderInset * 0.85) }} />
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} style={{ position: 'absolute', top: height * (0.12 + index * 0.18), left: width * (0.08 + ((index * 0.17) % 0.76)), width: 8 + index * 2, height: 8 + index * 2, borderRadius: '50%', background: palette.white, opacity: 0.15 + index * 0.025, transform: `translateY(${Math.sin(frame / 20 + index) * 22}px)` }} />
      ))}
    </AbsoluteFill>
  );
};

const BrandBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { width, height, landscape, side } = useResponsiveLayout();
  const mark = Math.round(Math.min(width, height) * (landscape ? 0.055 : 0.05));
  return (
    <>
      <div style={{ position: 'absolute', top: height * 0.04, right: side, left: side, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: palette.white, fontSize: Math.round(width * (landscape ? 0.018 : 0.027)), letterSpacing: 3, fontWeight: 700 }}>
        <span>GHAITH WEB</span>
        <span style={{ width: mark, height: mark, borderRadius: mark * 0.34, display: 'grid', placeItems: 'center', color: palette.ink, background: palette.gold, fontSize: mark * 0.55, letterSpacing: 0 }}>غ</span>
      </div>
      <div style={{ position: 'absolute', right: side, left: side, bottom: height * 0.038, height: Math.max(6, height * 0.005), borderRadius: 99, background: 'rgba(255,255,255,.13)', overflow: 'hidden' }}>
        <div style={{ width: `${interpolate(frame, [0, durationInFrames - 1], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${palette.gold}, ${palette.cyan})` }} />
      </div>
    </>
  );
};

const Opening: React.FC<{ hook: string; title: string }> = ({ hook, title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 115 } });
  const accent = spring({ frame: frame - 13, fps, config: { damping: 18 } });
  const { width, height, landscape, side, headline, support } = useResponsiveLayout();
  return (
    <AbsoluteFill style={{ padding: `${height * (landscape ? 0.14 : 0.135)}px ${side}px ${height * 0.09}px`, direction: 'rtl', justifyContent: 'center', fontFamily: 'GhaithArabic' }}>
      <div style={{ width: landscape ? width * 0.72 : 'auto', maxWidth: '100%' }}>
      <div style={{ alignSelf: 'flex-start', width: 'fit-content', opacity: accent, transform: `translateY(${interpolate(accent, [0, 1], [36, 0])}px)`, padding: `${height * 0.012}px ${width * 0.024}px`, borderRadius: 99, background: palette.gold, color: palette.ink, fontSize: support * 0.78, fontWeight: 700 }}>من التقرير إلى التأثير</div>
      <h1 style={{ margin: `${height * 0.035}px 0 ${height * 0.02}px`, color: palette.white, fontSize: headline, lineHeight: 1.25, fontWeight: 700, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [height * 0.05, 0])}px) scale(${interpolate(enter, [0, 1], [.94, 1])})`, textShadow: '0 18px 55px rgba(0,0,0,.25)' }}>{boundedText(hook, landscape ? 105 : 82, title)}</h1>
      <p style={{ margin: 0, color: palette.cyan, fontSize: support, lineHeight: 1.55, opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{boundedText(title, landscape ? 130 : 90, 'محتوى عملي وواضح')}</p>
      </div>
    </AbsoluteFill>
  );
};

const SceneCard: React.FC<{ scene: GhaithVideoScene; number: number }> = ({ scene, number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 17, stiffness: 130 } });
  const exit = interpolate(frame, [80, 100], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const numberReveal = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  const { width, height, landscape, side, title, body, support } = useResponsiveLayout();
  const numberSize = Math.round(Math.min(width * (landscape ? 0.075 : 0.12), height * 0.13));
  return (
    <AbsoluteFill style={{ padding: `${height * 0.12}px ${side}px ${height * 0.09}px`, direction: 'rtl', justifyContent: 'center', alignItems: 'center', fontFamily: 'GhaithArabic', opacity: exit }}>
      <div style={{ position: 'relative', width: landscape ? width * 0.68 : '100%', padding: `${height * (landscape ? 0.065 : 0.06)}px ${width * (landscape ? 0.045 : 0.06)}px ${height * 0.055}px`, borderRadius: Math.round(Math.min(width, height) * 0.043), background: 'rgba(255,253,248,.96)', boxShadow: '0 35px 90px rgba(0,0,0,.28)', opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [width * 0.14, 0])}px) rotate(${interpolate(enter, [0, 1], [3, 0])}deg)` }}>
        <div style={{ position: 'absolute', left: width * (landscape ? 0.035 : 0.043), top: -numberSize * 0.48, width: numberSize, height: numberSize, borderRadius: numberSize * 0.3, display: 'grid', placeItems: 'center', background: palette.gold, color: palette.ink, fontSize: numberSize * 0.52, fontWeight: 700, transform: `scale(${numberReveal}) rotate(${interpolate(numberReveal, [0, 1], [-13, 0])}deg)` }}>{String(number).padStart(2, '0')}</div>
        <div style={{ width: width * (landscape ? 0.075 : 0.11), height: Math.max(9, height * 0.008), borderRadius: 99, background: palette.blue, marginBottom: height * 0.03 }} />
        <h2 style={{ margin: 0, color: palette.ink, fontSize: title, lineHeight: 1.27, fontWeight: 700 }}>{boundedText(scene.title, landscape ? 82 : 58, `الخطوة ${number}`)}</h2>
        <p style={{ margin: `${height * 0.025}px 0 0`, color: '#29445E', fontSize: body, lineHeight: landscape ? 1.55 : 1.65 }}>{boundedText(scene.body, landscape ? 220 : 160, 'حوّل الفكرة إلى خطوة عملية قابلة للتنفيذ.')}</p>
      </div>
      <div style={{ marginTop: height * 0.035, color: palette.white, fontSize: support * 0.72, letterSpacing: 1.5, opacity: .7 }}>تحليل • صياغة • تنفيذ</div>
    </AbsoluteFill>
  );
};

const Closing: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 105 } });
  const pulse = 1 + Math.sin(frame / 7) * .025;
  const { width, height, landscape, title, support } = useResponsiveLayout();
  const mark = Math.round(Math.min(width, height) * (landscape ? 0.15 : 0.157));
  return (
    <AbsoluteFill style={{ padding: `${height * (landscape ? 0.16 : 0.145)}px ${width * 0.075}px ${height * 0.1}px`, direction: 'rtl', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontFamily: 'GhaithArabic' }}>
      <div style={{ width: mark, height: mark, borderRadius: mark * 0.32, display: 'grid', placeItems: 'center', background: palette.gold, color: palette.ink, fontSize: mark * 0.5, fontWeight: 700, transform: `scale(${enter * pulse}) rotate(${interpolate(enter, [0, 1], [-18, 0])}deg)` }}>غ</div>
      <h2 style={{ maxWidth: landscape ? width * 0.7 : width * 0.86, margin: `${height * 0.04}px 0 ${height * 0.02}px`, color: palette.white, fontSize: landscape ? title * 1.08 : title, lineHeight: 1.3, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [height * 0.06, 0])}px)` }}>{boundedText(cta, landscape ? 130 : 95, 'ابدأ الآن')}</h2>
      <div style={{ marginTop: height * 0.025, padding: `${height * 0.018}px ${width * 0.035}px`, borderRadius: Math.min(width, height) * 0.022, color: palette.ink, background: palette.cyan, fontSize: support * 0.82, fontWeight: 700, opacity: interpolate(frame, [24, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>Ghaith Web Content OS</div>
    </AbsoluteFill>
  );
};

export const GhaithMultiFormatVideo: React.FC<GhaithVideoProps> = ({ title, hook, cta, scenes }) => {
  const normalized = Array.from({ length: 3 }, (_, index) => scenes[index] ?? {});
  return (
    <AbsoluteFill style={{ fontFamily: 'GhaithArabic' }}>
      <AnimatedBackdrop />
      <Sequence from={0} durationInFrames={90}><Opening hook={hook} title={title} /></Sequence>
      {normalized.map((scene, index) => (
        <Sequence key={index} from={90 + index * 100} durationInFrames={100}>
          <SceneCard scene={scene} number={index + 1} />
        </Sequence>
      ))}
      <Sequence from={390} durationInFrames={60}><Closing cta={cta} /></Sequence>
      <BrandBar />
    </AbsoluteFill>
  );
};

export const GhaithVerticalVideo = GhaithMultiFormatVideo;
