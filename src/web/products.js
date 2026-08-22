(() => {
  const initialProductRequested = (() => { const u = new URL(location.href); return u.searchParams.get('product') === '1' || u.searchParams.get('view') === 'products'; })();
  let products = [];
  let loading = false;

  const qs = (s, p = document) => p?.querySelector?.(s) || null;
  const qsa = (s, p = document) => [...(p?.querySelectorAll?.(s) || [])];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  const safeUrl = (value) => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
  const label = (status) => ({ IN_REVIEW: 'للمراجعة', APPROVED: 'معتمد للتطوير', PRODUCT_READY: 'PRODUCT READY', ARCHIVED: 'مؤرشف' }[status] || status || '—');

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, {
        cache: 'no-store',
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
        signal: controller.signal,
      });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      return data;
    } finally { clearTimeout(timer); }
  }

  function toast(message, type = '') {
    if (typeof window.toast === 'function') return window.toast(message, type);
    console.log(message);
  }

  async function loadProducts(showToast = false) {
    if (loading) return;
    loading = true;
    try {
      const data = await request('/api/products');
      products = Array.isArray(data) ? data : [];
      renderProducts();
      updateCounts();
      if (showToast) toast('تم تحديث المنتجات', 'success');
    } catch (error) {
      const grid = qs('#productGrid');
      if (grid) grid.innerHTML = `<div class="panel empty-state"><span>⚠</span><b>تعذر تحميل المنتجات</b><small>${esc(error.message)}</small></div>`;
      if (showToast) toast(error.message, 'error');
    } finally { loading = false; }
  }

  function updateCounts() {
    const active = products.filter((item) => item.status !== 'ARCHIVED').length;
    const nav = qs('#navProductsCount'); if (nav) nav.textContent = String(active);
    const count = qs('#productCount'); if (count) count.textContent = `${active} منتج`;
    const quick = qs('#quickProductsText'); if (quick) quick.textContent = active ? `${active} مسودة/منتج` : 'لا توجد مسودات بعد';
  }

  function renderProducts() {
    const grid = qs('#productGrid');
    if (!grid) return;
    const items = [...products].filter((item) => item.status !== 'ARCHIVED').sort((a, b) => +new Date(b.updatedAt || 0) - +new Date(a.updatedAt || 0));
    if (!items.length) {
      grid.innerHTML = '<div class="panel empty-state"><span>◆</span><b>لا توجد منتجات أولية بعد</b><small>عند معالجة تقرير جديد سيظهر المنتج الأولي هنا تلقائيًا للمراجعة.</small></div>';
      return;
    }
    grid.innerHTML = items.map((p) => {
      const drive = safeUrl(p.googleDriveFolderUrl || p.googleDriveUrl);
      const score = Number(p.qualityReview?.score || 0);
      const approve = p.status === 'IN_REVIEW' ? `<button class="btn primary compact" type="button" data-product-approve="${esc(p.id)}">اعتماد للتطوير</button>` : '';
      return `<article class="content-card product-card">
        <div class="content-card-head"><span class="status-chip ${esc(p.status)}">${esc(label(p.status))}</span><small>جودة ${esc(score)}%</small></div>
        <button class="content-title-button" type="button" data-product-details="${esc(p.id)}">${esc(p.title)}</button>
        <div class="platform-tags"><span class="platform-tag">${esc(p.productType || 'منتج رقمي')}</span></div>
        <div class="content-snippet"><b>الوعد:</b> ${esc(p.promise || '—')}</div>
        <div class="card-actions">
          <button class="small-btn" type="button" data-product-details="${esc(p.id)}">فتح التفاصيل</button>
          ${drive ? `<a class="small-btn drive-button" href="${esc(drive)}" target="_blank" rel="noopener noreferrer">Drive ↗</a>` : ''}
          ${approve}
          <button class="small-btn product-archive-btn" type="button" data-product-archive="${esc(p.id)}">أرشفة</button>
        </div>
      </article>`;
    }).join('');
  }

  function showDetails(id) {
    const p = products.find((item) => item.id === id);
    if (!p) return;
    const title = qs('#productModalTitle'); if (title) title.textContent = p.title;
    const meta = qs('#productModalMeta'); if (meta) meta.textContent = `${label(p.status)} · ${p.productType || 'منتج رقمي'} · جودة ${Number(p.qualityReview?.score || 0)}%`;
    const drive = safeUrl(p.googleDriveFolderUrl || p.googleDriveUrl);
    const body = qs('#productModalBody');
    if (body) body.innerHTML = `<div class="detail-body">
      <div class="product-gate-banner"><b>منتج أولي للمراجعة البشرية</b><span>ليس PRODUCT READY ولا يتم تسويقه أو بيعه تلقائيًا.</span></div>
      <div class="detail-grid">
        <section class="detail-section"><h4>الجمهور</h4><p>${esc(p.targetAudience || '—')}</p></section>
        <section class="detail-section"><h4>المشكلة</h4><p>${esc(p.problem || '—')}</p></section>
      </div>
      <section class="detail-section"><h4>الوعد العملي</h4><p>${esc(p.promise || '—')}</p></section>
      <section class="detail-section"><h4>المخرجات</h4><ul>${(p.deliverables || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></section>
      <section class="detail-section"><h4>الهيكل</h4><ol>${(p.outline || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ol></section>
      <section class="detail-section"><h4>المسودة</h4><pre class="report-full-text">${esc(p.draftBody || '—')}</pre></section>
      <section class="detail-section"><h4>مراجعة الجودة</h4><pre>${esc(JSON.stringify(p.qualityReview || {}, null, 2))}</pre></section>
      <div class="form-actions">
        ${drive ? `<a class="btn ghost" href="${esc(drive)}" target="_blank" rel="noopener noreferrer">فتح مجلد Drive ↗</a>` : ''}
        ${p.status === 'IN_REVIEW' ? `<button class="btn primary" type="button" data-product-approve="${esc(p.id)}">اعتماد للتطوير</button>` : ''}
        <button class="btn ghost" type="button" data-close>إغلاق</button>
      </div>
    </div>`;
    if (typeof window.openModal === 'function') window.openModal('productModal');
    else {
      qs('#modalBackdrop')?.classList.add('show');
      qs('#productModal')?.classList.add('show');
    }
  }

  async function approve(id, button) {
    if (button) button.disabled = true;
    try {
      const updated = await request(`/api/products/${encodeURIComponent(id)}/approve`, { method: 'POST' });
      const index = products.findIndex((item) => item.id === id);
      if (index >= 0) products[index] = updated;
      renderProducts(); updateCounts();
      if (typeof window.closeModals === 'function') window.closeModals();
      toast('تم اعتماد المنتج للتطوير. لم يصبح PRODUCT READY بعد.', 'success');
    } catch (error) { toast(error.message, 'error'); }
    finally { if (button) button.disabled = false; }
  }

  async function archive(id, button) {
    if (!window.confirm('هل تريدين أرشفة هذا المنتج الأولي؟ لن يُحذف ملفه من Drive.')) return;
    if (button) button.disabled = true;
    try {
      const updated = await request(`/api/products/${encodeURIComponent(id)}/archive`, { method: 'POST' });
      const index = products.findIndex((item) => item.id === id);
      if (index >= 0) products[index] = updated;
      renderProducts(); updateCounts();
      toast('تمت أرشفة المنتج الأولي', 'success');
    } catch (error) { toast(error.message, 'error'); }
    finally { if (button) button.disabled = false; }
  }

  function showProducts({ push = true } = {}) {
    qsa('.view').forEach((view) => view.classList.remove('active'));
    qs('#view-products')?.classList.add('active');
    qsa('.nav-item,.bottom-nav-item').forEach((item) => item.classList.remove('active'));
    qs('#productsNavBtn')?.classList.add('active');
    const title = qs('#pageTitle'); if (title) title.textContent = 'مركز المنتجات';
    const subtitle = qs('#pageSubtitle'); if (subtitle) subtitle.textContent = 'مسودات تلقائية تنتظر قرارك — لا بيع ولا نشر تلقائي';
    qs('#sidebar')?.classList.remove('open');
    qs('#drawerOverlay')?.classList.remove('show');
    document.body.classList.remove('drawer-open');
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set('product', '1');
      const currentView = url.searchParams.get('view') || 'dashboard';
      history.pushState({ view: currentView, product: true }, '', url);
    }
    loadProducts(false);
  }

  function leaveProductMode() {
    const url = new URL(location.href);
    if (!url.searchParams.has('product')) return;
    url.searchParams.delete('product');
    history.replaceState(history.state, '', url);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a');
    if (!target) return;
    if (target.id === 'productsNavBtn' || target.id === 'productsQuickBtn' || target.id === 'productsFlowBtn' || target.id === 'productsReviewFlowBtn') {
      event.preventDefault(); showProducts(); return;
    }
    if (target.dataset.productDetails) { event.preventDefault(); showDetails(target.dataset.productDetails); return; }
    if (target.dataset.productApprove) { event.preventDefault(); approve(target.dataset.productApprove, target); return; }
    if (target.dataset.productArchive) { event.preventDefault(); archive(target.dataset.productArchive, target); return; }
    if (target.dataset.view || target.dataset.viewLink) leaveProductMode();
  });

  window.addEventListener('popstate', () => {
    setTimeout(() => {
      const url = new URL(location.href);
      if (url.searchParams.get('product') === '1') showProducts({ push: false });
    }, 0);
  });

  qs('#refreshBtn')?.addEventListener('click', () => setTimeout(() => loadProducts(false), 400));
  qs('#refreshIntegrationsBtn')?.addEventListener('click', () => setTimeout(() => loadProducts(false), 400));

  loadProducts(false);
  if (initialProductRequested) setTimeout(() => showProducts({ push: false }), 80);
})();
