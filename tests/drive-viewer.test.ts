import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDriveFileId } from '../src/services/drive-viewer.service';

test('internal Drive viewer extracts file IDs from Docs and Drive links', () => {
  assert.equal(
    extractDriveFileId('https://docs.google.com/document/d/1eHCZJfjcmSN3XCD5srR0LDa3CxSMVXyHYH4NhaRtq2s/edit'),
    '1eHCZJfjcmSN3XCD5srR0LDa3CxSMVXyHYH4NhaRtq2s',
  );
  assert.equal(
    extractDriveFileId('https://drive.google.com/open?id=1eHCZJfjcmSN3XCD5srR0LDa3CxSMVXyHYH4NhaRtq2s'),
    '1eHCZJfjcmSN3XCD5srR0LDa3CxSMVXyHYH4NhaRtq2s',
  );
});
