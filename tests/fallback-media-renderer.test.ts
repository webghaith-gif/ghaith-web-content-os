import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFallbackMedia } from '../src/services/fallback-media-renderer';
import type { ContentItem } from '../src/core/types';

test('fallback renderer produces non-empty Arabic social, carousel, PDF and MP4 assets', async () => {
  const now = new Date(0).toISOString();
  const content: ContentItem = {
    id: 'visual-qa',
    title: 'خطة محتوى عربية بلا مربعات',
    topic: 'اختبار بصري',
    platforms: ['instagram', 'tiktok', 'youtube'],
    contentType: 'multi-platform-video',
    package: {
      hook: 'حوّل تقريرك إلى محتوى جاهز لكل منصة',
      caption: 'ابدأ بأفضل فرصة ثم أنشئ نصًا وصورة وكاروسيل وفيديو فعليًا. 🚀',
      carouselSlides: [
        { title: 'ابدأ من التقرير', body: 'استخرج الفرصة الأعلى قيمة.', points: ['راجع الدليل', 'حدد الجمهور'] },
        { title: 'اكتب لكل منصة', body: 'لا تستخدم نصًا واحدًا للجميع.', points: ['Facebook للسياق', 'TikTok للسرعة'] },
        { title: 'أنشئ الأصل البصري', body: 'صورة وكاروسيل وفيديو فعلي.', points: ['خط عربي مضمّن', 'اتجاه RTL صحيح'] },
        { title: 'افحص قبل الحفظ', body: 'لا يكفي وجود اسم ملف.', points: ['افتح الصورة', 'شغّل الفيديو'] },
        { title: 'توقف عند المراجعة', body: 'لا نشر قبل موافقة المالك.', points: ['IN REVIEW أولًا', 'READY بعد الموافقة'] },
      ],
      videoScenes: [
        { title: 'من التقرير', body: 'اختر أفضل فرصة مبنية على البيانات.' },
        { title: 'إلى الحزمة', body: 'أنشئ النص والصورة والكاروسيل والفيديو.' },
        { title: 'ثم المراجعة', body: 'افحص العربية ولا تنشر قبل الموافقة.' },
      ],
    },
    assets: [],
    googleDriveUrls: [],
    status: 'IN_REVIEW',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  const result = await renderFallbackMedia(content);
  assert.ok((result.social?.length ?? 0) > 10_000);
  assert.equal(result.carouselSlides.length, 5);
  assert.ok(result.carouselSlides.every((slide) => slide.length > 10_000));
  assert.ok((result.carouselPdf?.length ?? 0) > 50_000);
  assert.ok((result.video?.length ?? 0) > 10_000, result.videoError ?? 'MP4 fallback was not produced.');
});
