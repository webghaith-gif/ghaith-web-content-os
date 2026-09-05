# Ghaith Web — GPT → Canva → App handoff

This is the active content-production contract for new report-driven packages.

1. **ChatGPT / Ghaith Web Content Pro** is the creative author: report analysis, platform copy, carousel plan, video plan, product draft when justified, and final visual direction/assets.
2. **PREVIEW BEFORE CANVA IS MANDATORY.** Every visual asset and every product page must be shown to the user inside ChatGPT first. Nothing may be sent to Canva before explicit visual approval.
3. **APPROVED VISUALS ARE IMMUTABLE.** After the user approves an image/page in ChatGPT, the exact approved pixels are the source of truth. Canva must receive the same flat image exactly as approved. No new text layers, no regenerated text, no crop, resize, reposition, recolor, font substitution, reflow, overlay, template adaptation, or AI reinterpretation is allowed during handoff unless the user explicitly asks for it.
4. **Flat-image handoff is the default and safest path.** Approved PNG/JPG pages are uploaded/imported as single flattened page images. A Canva design may contain one flat approved image per page. The visual seen in Canva must be pixel-equivalent to the approved ChatGPT image. If exact preservation cannot be verified, the handoff fails and must not be marked complete.
5. **Canva** is the editable creative library and handoff bridge. GPT-authored visuals are stored in `Ghaith Web — GPT Content Library` (`FAHTBzGyGXg`). Canva must not rewrite the package or add content on top of approved images.
6. **Product cover rule:** the product cover approved in ChatGPT is a fixed asset. It must never be substituted by an older cover, an auto-generated cover, or an A4/template rebuild. The exact approved cover image must be page 1 of the product design unless the user explicitly approves a replacement.
7. **Google Drive** carries the durable handoff manifest. Its name starts with `Ghaith Web GPT Package —` and its body is one JSON object only.
8. **Ghaith Web Content OS** consumes the manifest, stores/exports the approved platform assets, matches each asset to its `platforms` and each platform to `platformCopies`, and leaves the result `IN_REVIEW`.
9. **Asset binding is mandatory before READY.** Facebook/Instagram/Pinterest must have the approved final image actually attached to the content record; TikTok/YouTube must have a real final MP4. A Canva link by itself is not a publishable attachment.
10. **Human approval is mandatory** before `READY`, ClickUp, Make, or external publishing.
11. Scheduled report processing must wait for GPT packages rather than auto-generating weak Gemini/fallback content.
12. A manifest with `productDecision: "none"` is a valid explicit decision and must not force creation of a fake product.
13. GPT package manifests are handoff envelopes and must never be re-imported as source reports.

## Non-negotiable verification gate
Before saying “sent to Canva” or “attached to the app”, verify the actual destination state. Never claim success from local preparation alone. If the Canva import changes the approved pixels or adds/reflows text, reject that import and keep the approved ChatGPT image as the canonical asset.

Current fixed Make routes: Facebook, Instagram, TikTok, Pinterest, YouTube. X copy may be prepared but X must not enter `platforms` until its publishing route exists.
