(()=>{
  const toTime=value=>{
    const time=Date.parse(value||'');
    return Number.isFinite(time)?time:0;
  };

  const originalRenderReports=renderReports;
  renderReports=function(){
    state.reports=[...state.reports].sort((a,b)=>toTime(a.createdAt)-toTime(b.createdAt));
    return originalRenderReports();
  };

  const originalRenderOpportunities=renderOpportunities;
  renderOpportunities=function(){
    state.opportunities=[...state.opportunities].sort((a,b)=>toTime(b.createdAt)-toTime(a.createdAt));
    return originalRenderOpportunities();
  };

  const originalRenderLogs=renderLogs;
  renderLogs=function(){
    state.logs=[...state.logs].sort((a,b)=>toTime(a.timestamp)-toTime(b.timestamp));
    return originalRenderLogs();
  };

  // Content, products and notification history already sort newest-first in their own renderers.
  // Re-render these three surfaces in case initial API requests completed before this patch loaded.
  try{renderReports();renderOpportunities();renderLogs()}catch{}
})();
