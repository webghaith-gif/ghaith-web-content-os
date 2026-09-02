import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/engine.ts',import.meta.url),'utf8');
test('review-safe source conventions',()=>{ assert(!source.includes('addNativeElement')); assert(source.includes('questions')); assert(source.includes('sections')); });
