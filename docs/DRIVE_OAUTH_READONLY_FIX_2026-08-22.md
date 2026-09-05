# Drive OAuth readonly scope fix — 2026-08-22

Production verification found that an older Vercel `GOOGLE_DRIVE_SCOPES` override could keep OAuth on `drive.file` only even after the code default was expanded. The OAuth manager now always adds `https://www.googleapis.com/auth/drive.readonly` independently of the environment override, while retaining `drive.file` for app-created file writes and avoiding the full Drive write scope.

Regression coverage now simulates the stale environment override and verifies that the authorization URL still includes `drive.readonly`.
