# GPT → Canva → Ghaith Web Content OS

Canonical content flow after the 2026-08-22 quality fix:

1. Report arrives in Ghaith Web Content OS.
2. ChatGPT/Ghaith Web Content Pro is the primary creative author.
3. GPT produces the platform-specific package and, when relevant, the product draft.
4. Canva stores/editable visual designs created from the approved GPT brief/content.
5. `POST /api/automation/gpt-intake` imports the authored package and Canva references into the existing app state.
6. The app matches each platform copy with its intended visual asset, archives operational copies to Google Drive, and keeps the result `IN_REVIEW`.
7. Human approval is still mandatory before `READY`.
8. READY content is handed to ClickUp → Make → publishing.

The scheduled report pipeline must wait for GPT-authored content and must not auto-generate a second Gemini/fallback package.
