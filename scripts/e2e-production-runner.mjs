const base = 'https://ghaith-web-content-os.vercel.app';
const runId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || Date.now().toString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, init = {}, { allowError = false } = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok && !allowError) {
    throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`E2E_START run=${runId}`);

const reportPayload = {
  title: `[E2E TEST ${runId}] Ghaith Web Content OS`,
  source: 'Hardening E2E',
  body: 'اختبار تقني داخلي فقط لمنظومة Ghaith Web Content OS. الهدف التحقق من المسار تقرير ← فرصة ← محتوى تعليمي غير ترويجي ← أصول ← مراجعة ← READY ← ClickUp ← Make ← TikTok. يجب أن يكون النص النهائي واضحًا أنه اختبار تقني فقط، دون بيع أو عروض أو أسعار أو ادعاءات عن أي منتج.',
};

const { data: report } = await request('/api/reports', {
  method: 'POST',
  body: JSON.stringify(reportPayload),
});
assert(report?.id, 'Report ID missing');
console.log(`E2E_REPORT id=${report.id}`);

const { data: opportunities } = await request(`/api/reports/${report.id}/opportunities`, { method: 'POST' });
assert(Array.isArray(opportunities) && opportunities[0]?.id, 'No opportunity returned');
const opportunity = opportunities[0];
console.log(`E2E_OPPORTUNITY id=${opportunity.id} title=${JSON.stringify(opportunity.title)}`);

let { data: content } = await request(`/api/opportunities/${opportunity.id}/content`, {
  method: 'POST',
  body: JSON.stringify({ platforms: ['tiktok'] }),
});
assert(content?.id, 'Content ID missing');
console.log(`E2E_CONTENT id=${content.id} status=${content.status} assets=${content.assets?.length || 0}`);

if ((content.assets?.length || 0) === 0) {
  ({ data: content } = await request(`/api/content/${content.id}/assets`, { method: 'POST' }));
  console.log(`E2E_ASSETS_RETRY assets=${content.assets?.length || 0}`);
}
assert((content.assets?.length || 0) > 0, 'Asset generation produced no assets');

if (content.status === 'IN_REVIEW') {
  ({ data: content } = await request(`/api/content/${content.id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy: 'Hardening E2E Test' }),
  }));
}
assert(content.status === 'READY' || content.status === 'PUBLISHED', `Unexpected content status before dispatch: ${content.status}`);
console.log(`E2E_APPROVAL status=${content.status}`);

let taskId = content.clickupTaskIds?.tiktok || content.clickupTaskId || '';
if (content.status === 'READY') {
  const { data: dispatched } = await request(`/api/content/${content.id}/publish`, { method: 'POST' });
  assert(dispatched?.dispatched === true, `Dispatch failed: ${JSON.stringify(dispatched)}`);
  taskId = dispatched.tasks?.find((item) => item.platform === 'tiktok')?.taskId || taskId;
  assert(taskId, 'TikTok ClickUp task ID missing after dispatch');
  console.log(`E2E_DISPATCH task=${taskId}`);
}

let finalStatus = content.status;
for (let attempt = 1; attempt <= 6; attempt += 1) {
  const { data: current } = await request(`/api/content/${content.id}`);
  finalStatus = current.status;
  taskId = current.clickupTaskIds?.tiktok || current.clickupTaskId || taskId;
  console.log(`E2E_POLL attempt=${attempt} status=${finalStatus} task=${taskId}`);
  if (finalStatus === 'PUBLISHED') break;
  await sleep(60_000);
}

const { data: logs } = await request('/api/logs');
const matchingLogs = Array.isArray(logs) ? logs.filter((item) => item.contentId === content.id) : [];
console.log(`E2E_LOGS count=${matchingLogs.length} results=${matchingLogs.map((item) => `${item.platform}:${item.result}`).join(',') || 'none'}`);
console.log(`E2E_RESULT content=${content.id} task=${taskId} status=${finalStatus}`);

if (finalStatus !== 'PUBLISHED') {
  console.log('E2E_WAITING_FOR_MAKE: task was dispatched to ClickUp READY but app has not received a Make success callback yet.');
}
