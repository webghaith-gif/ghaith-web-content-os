# Ghaith Web — Universal Short Video Renderer

هذا المجلد يصنع فيديو عمودي واحد مناسب لـ Instagram Reels وFacebook Reels وTikTok وYouTube Shorts.

## المدخلات
ضع داخل `video_montage/assets/` الصور التسع المعتمدة فقط.

يمكن الاحتفاظ بالأسماء الأصلية، أو إعادة تسميتها:
`01.png` … `09.png` بالترتيب الصحيح.

لا تضع لوحات التجميع.

الصوت النهائي المعتمد يُنزَّل تلقائيًا من رابط النسخة الأخيرة. ويمكن بدلًا من ذلك وضع ملف باسم:
`video_montage/assets/voice_final.wav`

## التشغيل داخل GitHub Codespaces

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
python3 video_montage/render_ghaith_video.py
```

## النتيجة

`video_montage/output/Ghaith_Web_First_Week_AI_FINAL.mp4`

المواصفات:
- 1080×1920
- 9:16
- 30fps
- H.264 + AAC
- بلا موسيقى
- حركة Zoom خفيفة جدًا لحماية النص العربي
- انتقال Fade بسيط
- خلفية Warm Off-White بدل الأشرطة السوداء
- المدة مضبوطة تلقائيًا على مدة الصوت
