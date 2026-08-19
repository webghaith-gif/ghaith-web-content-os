# Ghaith Web Content OS — Integration Status

Updated: 2026-08-19

## Runtime integrations in the deployed app

| Integration | Runtime status | Authentication path | Notes |
|---|---|---|---|
| Gemini | Connected | `GEMINI_API_KEY` | Default model: `gemini-3.5-flash-lite`. Free-first path. |
| Paid OpenAI | Locked | Optional `OPENAI_API_KEY` | Never used while `ALLOW_PAID_AI=false`. |
| Vercel AI Gateway | Locked | Optional API key/OIDC | Never used while `ALLOW_PAID_AI=false`, including request-scoped Vercel OIDC. |
| ClickUp | Connected | Existing runtime credential | Operational workflow/list is configured. |
| Canva | Connected | OAuth | Primary asset factory. |
| Google Drive | Pending runtime OAuth | OAuth/access token required | Dedicated export folder `Ghaith Web Content OS — Exports` is ready with ID `1St07dwbI6JwrARJXBh19Sex7O1Bco2Lv`, under the reference folder. No folder ID entry is needed later. |
| HeyGen | Pending runtime auth | API key or automation webhook required | Optional video source; not required for core app operation. |
| Semrush | Pending runtime API access | API key/units required | Country default is Tunisia (`TN`). |
| Make | Pending runtime webhook | Webhook URL required for direct webhook mode | ClickUp-watch mode can remain the operational handoff until Make is re-enabled. |

## Connected operator tools available from ChatGPT

The project owner has working ChatGPT-side connections for GitHub, Vercel, Google Drive, Canva, ClickUp, and HeyGen. These are operator connections used while working with ChatGPT; they are intentionally **not** reported by the deployed server as runtime credentials.

This distinction prevents the UI/API from claiming that an external service is autonomously callable by the Vercel app when only the ChatGPT operator connection exists.

## Cost safety policy

1. Gemini is the default automated model provider.
2. `ALLOW_PAID_AI=false` is the default and must remain false unless the owner explicitly chooses a paid provider.
3. Presence of an OpenAI key, Vercel OIDC token, or AI Gateway credential must not activate paid inference while the lock is false.
4. Missing optional integrations must degrade gracefully instead of blocking the core content workflow.
