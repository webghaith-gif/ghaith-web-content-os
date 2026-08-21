const base = 'https://ghaith-web-content-os.vercel.app';
const contentId = '95d83018-f0b5-4690-a6fc-3f95272e3b65';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

console.log(`E2E_RETRY_START content=${contentId}`);
let content = await request(`/api/content/${contentId}`);
console.log(`E2E_BEFORE status=${content.status} task=${content.clickupTaskIds?.tiktok || content.clickupTaskId || 'none'} assets=${content.assets?.length || 0}`);

if (content.status === 'READY' && !(content.clickupTaskIds?.tiktok || content.clickupTaskId)) {
  const dispatched = await request(`/api/content/${contentId}/publish`, { method: 'POST' });
  const taskId = dispatched.tasks?.find((item) => item.platform === 'tiktok')?.taskId;
  console.log(`E2E_DISPATCH dispatched=${dispatched.dispatched} task=${taskId || 'none'}`);
  if (dispatched.dispatched !== true || !taskId) throw new Error(`Dispatch did not return a TikTok task: ${JSON.stringify(dispatched)}`);
} else {
  console.log('E2E_DISPATCH_SKIPPED existing task or non-READY status');
}

for (let attempt = 1; attempt <= 4; attempt += 1) {
  content = await request(`/api/content/${contentId}`);
  const taskId = content.clickupTaskIds?.tiktok || content.clickupTaskId || 'none';
  console.log(`E2E_POLL attempt=${attempt} status=${content.status} task=${taskId}`);
  if (content.status === 'PUBLISHED') break;
  await sleep(45_000);
}

const logs = await request('/api/logs');
const matching = Array.isArray(logs) ? logs.filter((item) => item.contentId === contentId) : [];
console.log(`E2E_APP_LOGS count=${matching.length} results=${matching.map((item) => `${item.platform}:${item.result}`).join(',') || 'none'}`);
console.log(`E2E_RETRY_RESULT status=${content.status} task=${content.clickupTaskIds?.tiktok || content.clickupTaskId || 'none'}`);
