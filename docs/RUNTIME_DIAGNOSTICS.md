# Runtime diagnostics

Production startup is guarded so configuration errors do not crash the Vercel Function before the application can answer.

- `/api/health` remains the main health endpoint.
- If application startup fails before the normal server is created, the fallback server returns a redacted JSON diagnostic instead of a generic `FUNCTION_INVOCATION_FAILED` page.
- The diagnostic reports whether `DATABASE_URL` is configured and the selected storage/SSL flags, but never returns connection strings, tokens, passwords, or API keys.
- PostgreSQL uses a serverless-friendly pool size and an idle-client error handler so transient idle connection failures do not terminate the process.
