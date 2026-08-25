import { Store } from '../repositories/store';
import { createDatabase } from '../repositories/database-factory';
import { GoogleDriveAdapter } from '../integrations/google-drive.adapter';

const clips = [
  ['Ghaith-Web-Reel-Voice-Scene-01.mp3', 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/b4cecd47-8278-42d9-a1bf-1c6ae8d2594e.mp3'],
  ['Ghaith-Web-Reel-Voice-Scene-02.mp3', 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/a7264436-001f-492e-ab67-40c9da3e520a.mp3'],
  ['Ghaith-Web-Reel-Voice-Scene-03.mp3', 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/e86d9ecd-eae9-43c1-b471-f3aeb60daa3e.mp3'],
  ['Ghaith-Web-Reel-Voice-Scene-04.mp3', 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/b1c975a6-ae27-49ee-9892-2fd05177b172.mp3'],
  ['Ghaith-Web-Reel-Voice-Scene-05.mp3', 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/78678668-b754-4a4a-a107-be4f1ed05a51.mp3'],
  ['Ghaith-Web-Reel-Voice-Scene-06.mp3', 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/5b5db9ff-a8e6-4e08-995e-eddebbb71948.mp3'],
] as const;

async function main() {
  const store = new Store(createDatabase());
  const drive = new GoogleDriveAdapter(store);
  const status = await drive.oauthStatus();
  if (!status.connected) throw new Error('Google Drive is not connected; cannot seed reel voice clips.');

  for (const [name, url] of clips) {
    const source = await fetch(url);
    if (!source.ok) throw new Error(`Voice download failed for ${name}: ${source.status} ${source.statusText}`);
    const bytes = new Uint8Array(await source.arrayBuffer());
    const result = await drive.upsertBytes(name, bytes, source.headers.get('content-type') || 'audio/mpeg');
    console.log(`[reel-voice-seed] ${name} -> ${result?.id ?? 'no-id'}`);
  }
}

main().catch((error) => {
  console.error('[reel-voice-seed] failed', error);
  process.exitCode = 1;
});
