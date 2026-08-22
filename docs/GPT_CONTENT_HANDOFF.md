# Ghaith Web — GPT → Canva → App handoff

This is the active content-production contract for new report-driven packages.

1. **ChatGPT / Ghaith Web Content Pro** is the creative author: report analysis, platform copy, carousel plan, video plan, product draft when justified, and final visual direction/assets.
2. **Canva** is the editable creative library and handoff bridge. GPT-authored visuals are stored in `Ghaith Web — GPT Content Library` (`FAHTBzGyGXg`). Canva must not rewrite the package.
3. **Google Drive** carries the durable handoff manifest. Its name starts with `Ghaith Web GPT Package —` and its body is one JSON object only.
4. **Ghaith Web Content OS** consumes the manifest, exports referenced Canva designs to publishable binaries, stores them in the report Drive folder, matches each asset to its `platforms` and each platform to `platformCopies`, and leaves the result `IN_REVIEW`.
5. **Human approval is mandatory** before `READY`, ClickUp, Make, or external publishing.
6. Scheduled report processing must wait for GPT packages rather than auto-generating weak Gemini/fallback content.
7. A manifest with `productDecision: "none"` is a valid explicit decision and must not force creation of a fake product.
8. GPT package manifests are handoff envelopes and must never be re-imported as source reports.

Current fixed Make routes: Facebook, Instagram, TikTok, Pinterest, YouTube. X copy may be prepared but X must not enter `platforms` until its publishing route exists.
