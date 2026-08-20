import React from 'react';
import { Composition, Folder } from 'remotion';
import { GhaithMultiFormatVideo } from './GhaithVerticalVideo';

export const RemotionRoot: React.FC = () => (
  <Folder name="Ghaith-Social-Formats">
    <Composition
      id="GhaithVertical"
      component={GhaithMultiFormatVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ title: 'حوّل التقرير إلى محتوى مؤثر', hook: 'الفكرة الجيدة لا تكفي… التنفيذ هو الفارق', cta: 'احفظ الفكرة وابدأ بخطوة واحدة اليوم', scenes: [{ title: 'ابدأ بالإشارة', body: 'استخرج المشكلة الأكثر تكرارًا من التقرير.' }, { title: 'ابنِ الرسالة', body: 'حوّلها إلى زاوية واضحة ومفيدة للجمهور.' }, { title: 'انشر بذكاء', body: 'كيّف الحزمة لكل منصة بعد الموافقة.' }] }}
    />
    <Composition
      id="GhaithLandscape"
      component={GhaithMultiFormatVideo}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: 'حوّل التقرير إلى محتوى مؤثر', hook: 'الفكرة الجيدة لا تكفي… التنفيذ هو الفارق', cta: 'احفظ الفكرة وابدأ بخطوة واحدة اليوم', scenes: [{ title: 'ابدأ بالإشارة', body: 'استخرج المشكلة الأكثر تكرارًا من التقرير.' }, { title: 'ابنِ الرسالة', body: 'حوّلها إلى زاوية واضحة ومفيدة للجمهور.' }, { title: 'انشر بذكاء', body: 'كيّف الحزمة لكل منصة بعد الموافقة.' }] }}
    />
    <Composition
      id="GhaithSquare"
      component={GhaithMultiFormatVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={{ title: 'حوّل التقرير إلى محتوى مؤثر', hook: 'الفكرة الجيدة لا تكفي… التنفيذ هو الفارق', cta: 'احفظ الفكرة وابدأ بخطوة واحدة اليوم', scenes: [{ title: 'ابدأ بالإشارة', body: 'استخرج المشكلة الأكثر تكرارًا من التقرير.' }, { title: 'ابنِ الرسالة', body: 'حوّلها إلى زاوية واضحة ومفيدة للجمهور.' }, { title: 'انشر بذكاء', body: 'كيّف الحزمة لكل منصة بعد الموافقة.' }] }}
    />
    <Composition
      id="GhaithPortrait"
      component={GhaithMultiFormatVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1350}
      defaultProps={{ title: 'حوّل التقرير إلى محتوى مؤثر', hook: 'الفكرة الجيدة لا تكفي… التنفيذ هو الفارق', cta: 'احفظ الفكرة وابدأ بخطوة واحدة اليوم', scenes: [{ title: 'ابدأ بالإشارة', body: 'استخرج المشكلة الأكثر تكرارًا من التقرير.' }, { title: 'ابنِ الرسالة', body: 'حوّلها إلى زاوية واضحة ومفيدة للجمهور.' }, { title: 'انشر بذكاء', body: 'كيّف الحزمة لكل منصة بعد الموافقة.' }] }}
    />
    <Composition
      id="GhaithPinterest"
      component={GhaithMultiFormatVideo}
      durationInFrames={450}
      fps={30}
      width={1000}
      height={1500}
      defaultProps={{ title: 'حوّل التقرير إلى محتوى مؤثر', hook: 'الفكرة الجيدة لا تكفي… التنفيذ هو الفارق', cta: 'احفظ الفكرة وابدأ بخطوة واحدة اليوم', scenes: [{ title: 'ابدأ بالإشارة', body: 'استخرج المشكلة الأكثر تكرارًا من التقرير.' }, { title: 'ابنِ الرسالة', body: 'حوّلها إلى زاوية واضحة ومفيدة للجمهور.' }, { title: 'انشر بذكاء', body: 'كيّف الحزمة لكل منصة بعد الموافقة.' }] }}
    />
  </Folder>
);
