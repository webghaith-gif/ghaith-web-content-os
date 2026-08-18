# Vercel bootstrap diagnostics

The root `server.cjs` entrypoint wraps the compiled application import in a top-level `try/catch`.

This is intentionally outside `src/server.ts` so failures that occur while loading imported modules (for example environment parsing or module initialization) do not become opaque `FUNCTION_INVOCATION_FAILED` pages before application-level error handling can run.

On a bootstrap import failure, `/api/health` and `/api/startup-health` return a redacted diagnostic object. Secrets and database URLs must never be emitted.
