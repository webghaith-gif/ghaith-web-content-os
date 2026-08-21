const { MakeAdapter } = await import('../dist/src/integrations/make.adapter.js');
const probe = await new MakeAdapter().testConnection();
console.log(`MAKE_PROBE ok=${probe.ok} enabled=${probe.enabled} mode=${probe.mode} message=${JSON.stringify(probe.message ?? '')}`);
if (!probe.ok) process.exitCode = 2;
