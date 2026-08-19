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

## محرك الذكاء الاصطناعي — Gemini أولًا

المسار الافتراضي المجاني للأتمتة داخل التطبيق هو Gemini:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
ALLOW_PAID_AI=false
```

`ALLOW_PAID_AI=false` هو قفل الأمان الافتراضي. أثناء بقائه `false` لا يمكن لـOpenAI API أو Vercel AI Gateway أن يصبحا مسارًا مدفوعًا حتى لو وُجد مفتاح أو OIDC token على الخادم.

ChatGPT Plus يبقى مساحة العمل التفاعلية الأساسية للتحليل، البحث، التخطيط، صناعة المحتوى والبرمجة معنا، لكنه **ليس API خلفيًا** لتطبيق Vercel.

المسارات المدفوعة اختيارية فقط للمستقبل، ولا تُفعّل إلا بقرار صريح:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
AI_GATEWAY_API_KEY=
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_MODEL=openai/gpt-5.4-mini
```

## ClickUp وبوابة النشر

```env
PUBLISH_MODE=clickup_watch
CLICKUP_LIST_ID=901524471002
CLICKUP_API_TOKEN=
```

قائمة التشغيل الحالية هي **Approved to Publish**. يمكن ترك Make متوقفًا أثناء تجهيز بقية التكاملات. عند `PUBLISH_MODE=clickup_watch` يسلّم التطبيق المحتوى المعتمد إلى ClickUp، ولا يعتبر Make اتصال Runtime مباشرًا ما لم يوجد Webhook فعلي.

للتشغيل المباشر عبر Webhook لاحقًا:

```env
PUBLISH_MODE=webhook
MAKE_WEBHOOK_URL=
MAKE_WEBHOOK_SECRET=
```

## Canva — مصنع الأصول الرئيسي

Canva هو المصدر الأساسي للصور، Carousel، القوالب، Video Designs والتصدير النهائي. التطبيق يدعم OAuth مباشرة، مع Webhook اختياري فقط عند الحاجة إلى طبقة أتمتة خارجية.

```env
CANVA_ACCESS_TOKEN=
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
CANVA_BRAND_KIT_ID=kAHON_7IACY
CANVA_SOCIAL_DESIGN_ID=DAHSrPK5pN0
CANVA_CAROUSEL_DESIGN_ID=DAHSrGq1HWk
CANVA_VIDEO_DESIGN_ID=DAHSrIr1gMw
CANVA_SOCIAL_TEMPLATE_ID=
CANVA_CAROUSEL_TEMPLATE_ID=
CANVA_VIDEO_TEMPLATE_ID=
CANVA_VIDEO_EXPORT_QUALITY=vertical_1080p
CANVA_AUTOFILL_TITLE_FIELD=TITLE
CANVA_AUTOFILL_BODY_FIELD=BODY
CANVA_AUTOFILL_CTA_FIELD=CTA
CANVA_AUTOFILL_MEDIA_FIELD=MEDIA
CANVA_AUTOMATION_WEBHOOK_URL=
```

التسلسل المستهدف:

`Content Package → Canva Design/Template → Export PNG/MP4 → Google Drive → Content Assets`

القوالب المطلوبة عند اعتماد Autofill كامل:

1. Social Template للصورة المفردة.
2. Carousel Template متعدد الصفحات.
3. Video Template عمودي 9:16 للفيديوهات القصيرة.

الحقول القياسية:

- `TITLE`
- `BODY`
- `CTA`
- `MEDIA`

Canva هو المسؤول عن التصدير النهائي:

- Social/Carousel → PNG
- Video → MP4 (`vertical_1080p` افتراضيًا)

## Google Drive

تم إنشاء مجلد تشغيل مخصص داخل مجلد المراجع:

**Ghaith Web Content OS — Exports**

المعرف غير السري مثبت بالفعل في الكود:

```env
GOOGLE_DRIVE_FOLDER_ID=1St07dwbI6JwrARJXBh19Sex7O1Bco2Lv
```

لا تحتاج إلى إدخال معرف المجلد مرة أخرى. المتبقي فقط للمزامنة الذاتية من Vercel هو المصادقة بإحدى الطريقتين:

### Access Token مؤقت

```env
GOOGLE_DRIVE_ACCESS_TOKEN=
```

### OAuth Refresh Token للإنتاج الطويل

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
```

الاتصال الموجود داخل ChatGPT يسمح لنا بالعمل على Drive من المحادثة، لكنه لا يُعامل كبيانات اعتماد تلقائية لخادم Vercel.

## HeyGen — اختياري

HeyGen ليس Renderer أساسيًا. يستخدم فقط عند طلب Avatar/Talking Head، ثم يمكن إدخال الناتج لاحقًا في Canva.

الحساب متاح لنا من داخل ChatGPT، أما التشغيل الذاتي من خادم Vercel فيحتاج أحد المسارين:

```env
HEYGEN_API_KEY=
HEYGEN_API_URL=https://api.heygen.com
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=
HEYGEN_AVATAR_TYPE=photo_avatar
```

أو:

```env
HEYGEN_AUTOMATION_WEBHOOK_URL=
```

## Semrush

التكامل اختياري ولا يمنع تشغيل النظام الأساسي:

```env
SEMRUSH_API_URL=https://api.semrush.com/apis/v4/keywords/v1/metrics
SEMRUSH_API_KEY=
SEMRUSH_COUNTRY=TN
```

## ما هو متصل فعليًا الآن

- Gemini داخل التطبيق: متصل.
- ClickUp داخل التطبيق: متصل.
- Canva داخل التطبيق عبر OAuth: متصل.
- PostgreSQL: مستخدم في Production.
- GitHub/Vercel: متصلان لإدارة الكود والنشر.
- Google Drive: متصل من داخل ChatGPT؛ مصادقة Runtime الذاتية ما زالت مطلوبة.
- HeyGen: متصل من داخل ChatGPT؛ مصادقة Runtime الذاتية ما زالت مطلوبة.
- Make: متوقف/غير متصل مباشرة بالخادم حتى إضافة Webhook.
- Semrush: يحتاج وصول/وحدات API كافية قبل التنفيذ.

## ملاحظة الأمان

لا تضع أي API Key أو OAuth secret أو كلمة مرور قاعدة بيانات داخل الواجهة أو GitHub. جميع الأسرار تبقى في متغيرات البيئة على الخادم.

ولا تغيّر `ALLOW_PAID_AI=false` إلا بقرار صريح لتفعيل مسار AI مدفوع.