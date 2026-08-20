# Make → HeyGen contract

This scenario is an asset-generation workflow only. It must never update content to `READY` or call public publishing modules.

## Incoming Make custom webhook

The app sends `POST HEYGEN_AUTOMATION_WEBHOOK_URL` with `X-Ghaith-Webhook-Secret` when configured.

```json
{
  "action": "generate_presenter_video",
  "callbackUrl": "https://ghaith-web-content-os.vercel.app/api/webhooks/heygen",
  "contentId": "content-id",
  "title": "Arabic title",
  "script": "Final Arabic presenter script",
  "prompt": "Optional production direction"
}
```

For `action=connection_test`, return HTTP 200 without creating a video or consuming HeyGen quota.

For generation, Make should respond immediately with a job reference:

```json
{ "jobId": "make-execution-id", "status": "accepted" }
```

## Final callback

After the current HeyGen connector returns a real final MP4 URL, Make sends:

```http
POST /api/webhooks/heygen
X-Ghaith-Webhook-Secret: <HEYGEN_CALLBACK_SECRET>
Content-Type: application/json
```

```json
{
  "contentId": "content-id",
  "videoId": "heygen-video-id",
  "videoUrl": "https://provider.example/final-video.mp4"
}
```

The app downloads that URL server-side, stores the bytes in the source report's Google Drive folder, records the Drive link as a `heygen` video asset, and sends a push notification. A prompt, job ID, pending response, or empty file is not accepted as a final asset.
