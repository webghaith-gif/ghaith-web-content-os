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

const AnimatedBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 28);
  const rotation = interpolate(frame, [0, 450], [-8, 18]);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: `linear-gradient(155deg, ${palette.ink} 0%, ${palette.navy} 54%, #123B62 100%)` }}>
      <div style={{ position: 'absolute', width: 820, height: 820, right: -290 + drift * 34, top: -190 + drift * 22, borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, ${palette.cyan}, ${palette.blue} 40%, transparent 72%)`, opacity: 0.38, filter: 'blur(4px)' }} />
      <div style={{ position: 'absolute', width: 680, height: 680, left: -310 - drift * 25, bottom: -170, borderRadius: 170, transform: `rotate(${rotation}deg)`, background: `linear-gradient(135deg, ${palette.gold}99, transparent)`, opacity: 0.34 }} />
      <div style={{ position: 'absolute', inset: 54, border: '2px solid rgba(255,255,255,.11)', borderRadius: 46 }} />
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} style={{ position: 'absolute', top: 180 + index * 310, left: 80 + ((index * 173) % 760), width: 8 + index * 2, height: 8 + index * 2, borderRadius: '50%', background: palette.white, opacity: 0.15 + index * 0.025, transform: `translateY(${Math.sin(frame / 20 + index) * 22}px)` }} />
      ))}
    </AbsoluteFill>
  );
};

const BrandBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <>
      <div style={{ position: 'absolute', top: 74, right: 78, left: 78, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: palette.white, fontSize: 29, letterSpacing: 3, fontWeight: 700 }}>
        <span>GHAITH WEB</span>
        <span style={{ width: 52, height: 52, borderRadius: 18, display: 'grid', placeItems: 'center', color: palette.ink, background: palette.gold, fontSize: 29, letterSpacing: 0 }}>غ</span>
      </div>
      <div style={{ position: 'absolute', right: 78, left: 78, bottom: 70, height: 7, borderRadius: 99, background: 'rgba(255,255,255,.13)', overflow: 'hidden' }}>
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
  return (
    <AbsoluteFill style={{ padding: '260px 86px 170px', direction: 'rtl', justifyContent: 'center', fontFamily: 'GhaithArabic' }}>
      <div style={{ alignSelf: 'flex-start', opacity: accent, transform: `translateY(${interpolate(accent, [0, 1], [36, 0])}px)`, padding: '15px 28px', borderRadius: 99, background: palette.gold, color: palette.ink, fontSize: 30, fontWeight: 700 }}>من التقرير إلى التأثير</div>
      <h1 style={{ margin: '42px 0 26px', color: palette.white, fontSize: 99, lineHeight: 1.28, fontWeight: 700, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [90, 0])}px) scale(${interpolate(enter, [0, 1], [.94, 1])})`, textShadow: '0 18px 55px rgba(0,0,0,.25)' }}>{boundedText(hook, 82, title)}</h1>
      <p style={{ margin: 0, color: palette.cyan, fontSize: 39, lineHeight: 1.65, opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{boundedText(title, 90, 'محتوى عملي وواضح')}</p>
    </AbsoluteFill>
  );
};

const SceneCard: React.FC<{ scene: GhaithVideoScene; number: number }> = ({ scene, number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 17, stiffness: 130 } });
  const exit = interpolate(frame, [80, 100], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const numberReveal = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ padding: '245px 78px 165px', direction: 'rtl', justifyContent: 'center', fontFamily: 'GhaithArabic', opacity: exit }}>
      <div style={{ position: 'relative', padding: '80px 64px 72px', borderRadius: 46, background: 'rgba(255,253,248,.96)', boxShadow: '0 35px 90px rgba(0,0,0,.28)', opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [150, 0])}px) rotate(${interpolate(enter, [0, 1], [3, 0])}deg)` }}>
        <div style={{ position: 'absolute', left: 46, top: -62, width: 128, height: 128, borderRadius: 38, display: 'grid', placeItems: 'center', background: palette.gold, color: palette.ink, fontSize: 66, fontWeight: 700, transform: `scale(${numberReveal}) rotate(${interpolate(numberReveal, [0, 1], [-13, 0])}deg)` }}>{String(number).padStart(2, '0')}</div>
        <div style={{ width: 118, height: 12, borderRadius: 99, background: palette.blue, marginBottom: 40 }} />
        <h2 style={{ margin: 0, color: palette.ink, fontSize: 78, lineHeight: 1.3, fontWeight: 700 }}>{boundedText(scene.title, 58, `الخطوة ${number}`)}</h2>
        <p style={{ margin: '34px 0 0', color: '#29445E', fontSize: 43, lineHeight: 1.75 }}>{boundedText(scene.body, 160, 'حوّل الفكرة إلى خطوة عملية قابلة للتنفيذ.')}</p>
      </div>
      <div style={{ marginTop: 48, color: palette.white, fontSize: 28, letterSpacing: 1.5, opacity: .7 }}>تحليل • صياغة • تنفيذ</div>
    </AbsoluteFill>
  );
};

const Closing: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 105 } });
  const pulse = 1 + Math.sin(frame / 7) * .025;
  return (
    <AbsoluteFill style={{ padding: '280px 82px 180px', direction: 'rtl', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontFamily: 'GhaithArabic' }}>
      <div style={{ width: 170, height: 170, borderRadius: 55, display: 'grid', placeItems: 'center', background: palette.gold, color: palette.ink, fontSize: 86, fontWeight: 700, transform: `scale(${enter * pulse}) rotate(${interpolate(enter, [0, 1], [-18, 0])}deg)` }}>غ</div>
      <h2 style={{ margin: '55px 0 24px', color: palette.white, fontSize: 82, lineHeight: 1.35, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [65, 0])}px)` }}>{boundedText(cta, 95, 'ابدأ الآن')}</h2>
      <div style={{ marginTop: 36, padding: '24px 42px', borderRadius: 24, color: palette.ink, background: palette.cyan, fontSize: 32, fontWeight: 700, opacity: interpolate(frame, [24, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>Ghaith Web Content OS</div>
    </AbsoluteFill>
  );
};

export const GhaithVerticalVideo: React.FC<GhaithVideoProps> = ({ title, hook, cta, scenes }) => {
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
