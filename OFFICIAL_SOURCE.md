# Official Source of Truth

This repository is the canonical source for Ghaith Web Content OS.

## Canonical project sequence

1. Complete reference code and documentation in GitHub.
2. Replace local JSON persistence with a production-grade persistent database.
3. Deploy and validate the Backend/API.
4. Publish and verify the official Web application URL.
5. Run the complete end-to-end workflow test.
6. Build the Android client on the same API.
7. Complete required closed testing.
8. Publish to Google Play.

## Reference documents

- `README.md`
- `ARCHITECTURE.md`
- `APP_SETUP_AR.md`
- `IMPLEMENTATION_NOTES.md`

## Security rule

Secrets belong only in runtime environment variables. `.env` must never be committed; `.env.example` contains names and safe defaults only.
