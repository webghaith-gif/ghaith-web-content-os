# تشغيل تطبيق Ghaith Web Content OS

## تشغيل محلي سريع

1. ثبّت Node.js 22 أو أحدث.
2. انسخ `.env.example` إلى `.env`.
3. للتجربة المحلية دون قاعدة بيانات خارجية استخدم:

```env
STORAGE_DRIVER=json
DATA_FILE=./data/db.json
```

4. ثبّت الاعتماديات وابنِ التطبيق ثم شغّله:

```bash
npm install
npm run build
npm start
```

ثم افتح `http://localhost:3000`.

## قاعدة البيانات الدائمة للإنتاج

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

يمكن التحقق من الاتصال عبر `GET /api/health`.

## ClickUp وبوابة النشر

```env
PUBLISH_MODE=clickup_watch
CLICKUP_LIST_ID=901524471002
CLICKUP_API_TOKEN=
```

يمكن ترك Make متوقفًا أثناء تجهيز بقية التكاملات. المسار الحالي للأصول لا يعتمد على Make.

## الذكاء الاصطناعي — Free First

المسار الافتراضي للأتمتة داخل التطبيق هو Gemini، مع قفل المسارات المدفوعة افتراضيًا:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
ALLOW_PAID_AI=false
```

لا تُفعّل OpenAI API أو Vercel AI Gateway إلا بقرار صريح وتغيير `ALLOW_PAID_AI=true`.

## Canva — مصنع الأصول الرئيسي

Canva هو المصدر الأساسي للصور، Carousel، القوالب، Video Designs والتصدير النهائي.

```env
CANVA_ACCESS_TOKEN=
CANVA_BRAND_KIT_ID=kAHON_7IACY
CANVA_SOCIAL_TEMPLATE_ID=
CANVA_CAROUSEL_TEMPLATE_ID=
CANVA_VIDEO_TEMPLATE_ID=
CANVA_VIDEO_EXPORT_QUALITY=vertical_1080p
CANVA_AUTOFILL_TITLE_FIELD=TITLE
CANVA_AUTOFILL_BODY_FIELD=BODY
CANVA_AUTOFILL_CTA_FIELD=CTA
CANVA_AUTOFILL_MEDIA_FIELD=MEDIA
```

التسلسل المعتمد:

`Content Package → Canva Brand Template → Autofill → Canva Design → Export PNG/MP4 → Google Drive → Content Assets`

القوالب المطلوبة داخل Canva:

1. Social Template للصورة المفردة.
2. Carousel Template متعدد الصفحات.
3. Video Template عمودي 9:16 للفيديوهات القصيرة.

ويُفضّل أن تستخدم القوالب حقول Autofill القياسية:

- `TITLE`
- `BODY`
- `CTA`
- `MEDIA`

إذا لم يكن Template ID مضبوطًا بعد، ينشئ النظام Design قابلًا للتحرير كحل مرحلي، لكنه لا يعتبر ذلك النسخة النهائية المعتمدة للقالب.

Canva هو المسؤول عن التصدير النهائي:

- Social/Carousel → PNG
- Video → MP4 (`vertical_1080p` افتراضيًا)

## Google Drive — OAuth دائم

يحفظ النسخ المصدرة وملفات Manifest. في الإنتاج نستخدم OAuth دائمًا بدل Access Token المؤقت.

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_FOLDER_NAME=Ghaith Web Content OS — Runtime Exports
```

بعد إضافة `CLIENT_ID` و`CLIENT_SECRET` افتح:

`/api/integrations/google-drive/connect`

سيحوّلك التطبيق إلى موافقة Google ثم يعيدك إلى:

`/api/integrations/google-drive/callback`

بعد نجاح الموافقة، يخزن التطبيق Refresh Token في قاعدة البيانات ويجدد Access Token تلقائيًا. وإذا تركت `GOOGLE_DRIVE_FOLDER_ID` فارغًا، ينشئ التطبيق مجلد تصدير خاصًا به ويحفظ معرّفه في قاعدة البيانات. هذا يسمح لنا بالبقاء على نطاق `drive.file` المحدود بدل صلاحية Drive الكاملة.

يمكن اختبار الاتصال عبر:

`GET /api/integrations/google-drive/test`

ويبقى `GOOGLE_DRIVE_ACCESS_TOKEN` و`GOOGLE_DRIVE_REFRESH_TOKEN` بديلين يدويين فقط، وليس المسار المفضل.

## HeyGen — اختياري

HeyGen ليس Renderer أساسيًا. يستخدم فقط عند طلب Avatar/Talking Head، ثم يمكن إدخال الناتج لاحقًا في Canva.

```env
HEYGEN_API_KEY=
HEYGEN_API_URL=https://api.heygen.com
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=
HEYGEN_AVATAR_TYPE=photo_avatar
```

## Semrush

```env
SEMRUSH_API_URL=https://api.semrush.com/apis/v4/keywords/v1/metrics
SEMRUSH_API_KEY=
SEMRUSH_COUNTRY=TN
```

## ملاحظة الأمان

لا تضع أي API Key أو OAuth secret أو كلمة مرور قاعدة بيانات داخل الواجهة أو GitHub. جميع الأسرار تبقى في متغيرات البيئة على الخادم أو في تخزين OAuth داخل قاعدة البيانات.
