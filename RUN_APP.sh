#!/usr/bin/env sh
set -e
[ -f .env ] || cp .env.example .env
node --env-file=.env dist/src/server.js
