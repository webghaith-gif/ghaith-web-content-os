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

## الإعداد الأنسب للمنظومة الحالية

```env
PUBLISH_MODE=clickup_watch
CLICKUP_LIST_ID=901524471002
CLICKUP_API_TOKEN=ضع_التوكن_هنا
```

في هذا الوضع يعمل التطبيق هكذا:

`IN REVIEW → موافقة → ClickUp READY → Make Watch Tasks → المنصة → ClickUp PUBLISHED`

ولا يحتاج التطبيق إلى استبدال سيناريو Make الحالي.

## مزامنة نتائج Make مع Dashboard التطبيق

اختياريًا، أضف في نهاية فروع Make طلب HTTP إلى:

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

عند اكتمال كل المنصات، يحدّث التطبيق المحتوى إلى `PUBLISHED` تلقائيًا.

## إضافة منصة جديدة

أضف اسمها فقط إلى:

```env
SUPPORTED_PLATFORMS=facebook,instagram,tiktok,pinterest,youtube,x,threads
```

ثم أضف Route مقابلة في Make. لا يلزم تعديل Core التطبيق.

## ملاحظة الأمان

لا تضع أي API Key أو كلمة مرور قاعدة بيانات داخل الواجهة أو ملفات JavaScript. جميع الأسرار تبقى في متغيرات البيئة على الخادم.
