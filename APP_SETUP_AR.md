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

ثم افتح:

```text
http://localhost:3000
```

## قاعدة البيانات الدائمة للإنتاج

للنسخة المنشورة استخدم PostgreSQL:

```env
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

إذا كانت خدمة PostgreSQL التي اخترتها تطلب اتصال SSL بشهادة لا يمكن التحقق منها في بيئتك، غيّر `DATABASE_SSL_REJECT_UNAUTHORIZED=false` فقط وفق تعليمات مزود قاعدة البيانات.

إذا تركت `STORAGE_DRIVER` فارغًا ووجد `DATABASE_URL`، يختار التطبيق PostgreSQL تلقائيًا. بدون `DATABASE_URL` يعود تلقائيًا إلى `JsonDb` المحلي.

يمكن التحقق من الاتصال عبر:

```text
GET /api/health
```

حيث يقوم الفحص بقراءة طبقة التخزين فعلًا قبل إرجاع `ok: true`.

إذا كانت لديك بيانات سابقة في `data/db.json` وتريد نقلها إلى PostgreSQL، نفّذ بعد ضبط `.env`:

```bash
npm run migrate:postgres
```

لن تستبدل أداة الترحيل بيانات PostgreSQL الموجودة إلا إذا وضعت `MIGRATION_FORCE=true` صراحةً.

## ClickUp وبوابة النشر

```env
PUBLISH_MODE=clickup_watch
CLICKUP_LIST_ID=901524471002
CLICKUP_API_TOKEN=ضع_التوكن_هنا
```

يمكن ترك Make متوقفًا أثناء تجهيز بقية التكاملات. لا تعتمد مرحلة صناعة المحتوى أو الأصول على تشغيل Make.

عند تفعيل النشر لاحقًا يعود المسار إلى:

`IN REVIEW → موافقة → ClickUp READY → Make Watch Tasks → المنصة → ClickUp PUBLISHED`

## OpenAI

يستخدمه التطبيق لاستخراج الفرص وصناعة حزم المحتوى:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
```

لا يوضع المفتاح في الواجهة أو GitHub؛ يبقى في متغيرات بيئة الخادم فقط.

## Google Drive

للإنتاج طويل المدى يفضّل OAuth refresh credentials بدل Access Token مؤقت:

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

ويبقى `GOOGLE_DRIVE_ACCESS_TOKEN` متاحًا للاختبار اليدوي القصير فقط. يجدد التطبيق Access Token تلقائيًا عندما تكون بيانات refresh مكتملة.

## Semrush

التكامل الجديد يستخدم Keyword Metrics API v4:

```env
SEMRUSH_API_URL=https://api.semrush.com/apis/v4/keywords/v1/metrics
SEMRUSH_API_KEY=
SEMRUSH_COUNTRY=TN
```

لا ينفذ التطبيق طلب Semrush ما لم يوجد المفتاح ويُطلب إثراء كلمة مفتاحية.

## HeyGen

يمكن تشغيل HeyGen مباشرة من التطبيق دون Make:

```env
HEYGEN_API_KEY=
HEYGEN_API_URL=https://api.heygen.com
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=
HEYGEN_AVATAR_TYPE=photo_avatar
```

إذا كان الحساب يستخدم Photo Avatar، يحوّل التطبيق المعرّف إلى `talking_photo_id` ويرسل الفيديو مباشرة إلى HeyGen V2. يبقى `HEYGEN_AUTOMATION_WEBHOOK_URL` مدعومًا كخيار رجوع فقط.

## Canva

يدعم التطبيق الآن فحص اتصال Canva Connect API وإنشاء Design shell مباشر عند توفر:

```env
CANVA_ACCESS_TOKEN=
```

كما يبقى `CANVA_AUTOMATION_WEBHOOK_URL` مدعومًا كخيار رجوع. للوصول الإنتاجي الدائم يجب الانتقال إلى OAuth 2.0 مع حفظ وتجديد التوكنات؛ لا تعتمد على Access Token ثابت طويل المدى.

## مزامنة نتائج Make مع Dashboard التطبيق

اختياريًا، بعد إعادة تشغيل Make لاحقًا، يمكن إضافة طلب HTTP إلى:

```text
POST /api/webhooks/make
```

Body:

```json
{
  "contentId": "...",
  "platform": "facebook",
  "result": "SUCCESS",
  "publicUrl": "https://...",
  "executionId": "...",
  "attempt": 1
}
```

إذا استُخدم `MAKE_WEBHOOK_SECRET` أرسل نفس القيمة في Header باسم:

```text
X-Ghaith-Webhook-Secret
```

## إضافة منصة جديدة

أضف اسمها فقط إلى:

```env
SUPPORTED_PLATFORMS=facebook,instagram,tiktok,pinterest,youtube,x,threads
```

ثم أضف Route مقابلة في محرك النشر عند تفعيله. لا يلزم تعديل Core التطبيق.

## ملاحظة الأمان

لا تضع أي API Key أو OAuth secret أو كلمة مرور قاعدة بيانات داخل الواجهة أو ملفات JavaScript. جميع الأسرار تبقى في متغيرات البيئة على الخادم.
