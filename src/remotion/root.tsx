import React from 'react';
import { Composition } from 'remotion';
import { GhaithVerticalVideo, type GhaithVideoProps } from './GhaithVerticalVideo';

const defaultProps: GhaithVideoProps = {
  title: 'حوّل التقرير إلى محتوى مؤثر',
  hook: 'الفكرة الجيدة لا تكفي… التنفيذ هو الفارق',
  cta: 'احفظ الفكرة وابدأ بخطوة واحدة اليوم',
  scenes: [
    { title: 'ابدأ بالإشارة', body: 'استخرج المشكلة الأكثر تكرارًا من التقرير.' },
    { title: 'ابنِ الرسالة', body: 'حوّلها إلى زاوية واضحة ومفيدة للجمهور.' },
    { title: 'انشر بذكاء', body: 'كيّف الحزمة لكل منصة بعد الموافقة.' },
  ],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="GhaithVertical"
    component={GhaithVerticalVideo}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaultProps}
  />
);
