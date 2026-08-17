# تشغيل تطبيق Ghaith Web Content OS

## تشغيل سريع

1. ثبّت Node.js 22 أو أحدث.
2. عدّل ملف `.env` وأضف مفاتيح الربط التي تريد تفعيلها.
3. شغّل:

```bash
node --env-file=.env dist/src/server.js
```

ثم افتح:

```text
http://localhost:3000
```

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

لا تضع أي API Key داخل الواجهة أو ملفات JavaScript. جميع الأسرار تبقى في `.env` على الخادم.
