/**
 * wms_registry.js — Document Registry v1.0
 * ✅ List all documents from inventory_transactions
 * ✅ Filter by doc_no, date, type, warehouse
 * ✅ Open full document modal
 * ✅ Admin-only edit via Reverse Transaction
 */

// Admin check (linked to existing permissions system in wms_permissions.js)
Object.defineProperty(window, 'isAdmin', {
  get() {
    return window.CP && (window.CP.role === 'admin' || window.CP.role === 'super_admin');
  },
  configurable: true
});

// ─── Page Init ────────────────────────────────────────────────────────────
window.init_doc_registry = async function () {
  await loadRegistry();
  bindRegistryFilters();
};

let _registryData = [];

// ─── Load documents (grouped by reference_no) ─────────────────────────────
async function loadRegistry() {
  const tbody = document.getElementById('reg-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">⏳ جاري التحميل...</td></tr>`;

  const { data, error } = await supabase
    .from('inventory_transactions')
    .select(`
      id,
      reference_no,
      transaction_type,
      reference_type,
      created_at,
      warehouse_id,
      from_warehouse,
      to_warehouse,
      quantity,
      product_id,
      batch_no,
      expiry_date,
      unit,
      notes,
      warehouses!warehouse_id(name),
      products!product_id(name, product_code, name_en)
    `)
    .not('reference_no', 'is', null)
    .not('reference_no', 'eq', '')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:red;">${error.message}</td></tr>`;
    showMsg('❌ خطأ في تحميل السجل: ' + error.message, 'error');
    return;
  }

  // Group by reference_no
  const grouped = {};
  (data || []).forEach(row => {
    const key = row.reference_no;
    if (!grouped[key]) {
      grouped[key] = {
        reference_no: key,
        reference_type: row.reference_type,
        transaction_type: row.transaction_type,
        created_at: row.created_at,
        warehouse: row.warehouses?.name || '—',
        warehouse_id: row.warehouse_id,
        lines: []
      };
    }
    grouped[key].lines.push(row);
  });

  _registryData = Object.values(grouped).sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );

  renderRegistry(_registryData);
}

function getTypeLabel(ref_type, tx_type) {
  const map = {
    opening: { label: 'رصيد افتتاحي', color: '#7c3aed', bg: '#ede9fe', icon: '🎯' },
    purchase: { label: 'استلام (GRN)', color: '#059669', bg: '#d1fae5', icon: '📥' },
    sale: { label: 'صرف (GIV)', color: '#d97706', bg: '#fef3c7', icon: '📤' },
    transfer: { label: 'تحويل', color: '#0284c7', bg: '#e0f2fe', icon: '🔄' },
  };
  return map[ref_type] || map[tx_type] || { label: ref_type || tx_type, color: '#64748b', bg: '#f1f5f9', icon: '📋' };
}

function renderRegistry(items) {
  const tbody = document.getElementById('reg-tbody');
  const countEl = document.getElementById('reg-count');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">لا توجد مستندات</td></tr>`;
    if (countEl) countEl.textContent = '0';
    return;
  }

  if (countEl) countEl.textContent = items.length;

  tbody.innerHTML = items.map(doc => {
    const typeInfo = getTypeLabel(doc.reference_type, doc.transaction_type);
    const dateStr = new Date(doc.created_at).toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const timeStr = new Date(doc.created_at).toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit'
    });
    const lineCount = doc.lines.length;

    // Detect reversal docs (REV-)  
    const isReversal = doc.reference_no?.startsWith('REV-');
    const rowStyle = isReversal ? 'background:#fff7f7;color:#999;' : '';

    return `
      <tr style="cursor:pointer;${rowStyle}" onclick="window.openDocModal('${doc.reference_no}')">
        <td style="font-weight:700;color:var(--excell-blue);font-family:monospace;">
          ${doc.reference_no}
          ${isReversal ? '<span style="font-size:10px;color:#dc2626;margin-right:4px;">[عكسي]</span>' : ''}
        </td>
        <td>
          <span style="background:${typeInfo.bg};color:${typeInfo.color};padding:3px 8px;border-radius:20px;font-size:12px;font-weight:700;">
            ${typeInfo.icon} ${typeInfo.label}
          </span>
        </td>
        <td>${dateStr}</td>
        <td style="font-size:11px;color:#64748b;">${timeStr}</td>
        <td>${doc.warehouse}</td>
        <td style="text-align:center;">${lineCount} صنف</td>
        <td>
          <button class="btn bt btn-sm" onclick="event.stopPropagation();window.openDocModal('${doc.reference_no}')">🔎 عرض</button>
          ${window.isAdmin ? `<button class="btn br btn-sm" style="margin-right:4px;" onclick="event.stopPropagation();window.editDocModal('${doc.reference_no}')">✏️ تعديل</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Filter logic ──────────────────────────────────────────────────────────
function bindRegistryFilters() {
  const docInput = document.getElementById('reg-search-doc');
  const dateInput = document.getElementById('reg-search-date');
  const typeInput = document.getElementById('reg-search-type');

  function applyFilters() {
    const docTerm = (docInput?.value || '').toLowerCase().trim();
    const dateTerm = dateInput?.value || '';
    const typeTerm = typeInput?.value || '';

    const filtered = _registryData.filter(doc => {
      const matchDoc = !docTerm || (doc.reference_no || '').toLowerCase().includes(docTerm);
      const matchDate = !dateTerm || doc.created_at.startsWith(dateTerm);
      const matchType = !typeTerm || doc.reference_type === typeTerm || doc.transaction_type === typeTerm;
      return matchDoc && matchDate && matchType;
    });
    renderRegistry(filtered);
  }

  docInput?.addEventListener('input', applyFilters);
  dateInput?.addEventListener('input', applyFilters);
  typeInput?.addEventListener('change', applyFilters);

  document.getElementById('reg-clear-filters')?.addEventListener('click', () => {
    if (docInput) docInput.value = '';
    if (dateInput) dateInput.value = '';
    if (typeInput) typeInput.value = '';
    renderRegistry(_registryData);
  });

  document.getElementById('reg-refresh')?.addEventListener('click', loadRegistry);
}

// ─── View Document Modal ───────────────────────────────────────────────────
window.openDocModal = function (docNo) {
  const doc = _registryData.find(d => d.reference_no === docNo);
  if (!doc) return;

  document.getElementById('doc-modal-overlay')?.remove();

  const typeInfo = getTypeLabel(doc.reference_type, doc.transaction_type);
  const dateStr = new Date(doc.created_at).toLocaleString('ar-EG');

  const linesHtml = doc.lines.map(line => {
    const prodName = line.products?.name || '—';
    const prodCode = line.products?.product_code || '';
    const warehouse = line.warehouses?.name || '—';
    const sign = ['IN', 'OPENING', 'TRANSFER_IN'].includes(line.transaction_type) ? '▲' : '▼';
    const signColor = sign === '▲' ? '#059669' : '#dc2626';
    return `
      <tr>
        <td style="font-family:monospace;color:var(--excell-blue);">${prodCode}</td>
        <td>${prodName}</td>
        <td>${line.batch_no || '—'}</td>
        <td>${line.expiry_date ? new Date(line.expiry_date).toLocaleDateString('ar-EG') : '—'}</td>
        <td style="font-weight:700;color:${signColor};">${sign} ${Math.abs(line.quantity)}</td>
        <td>${warehouse}</td>
      </tr>
    `;
  }).join('');

  const isAdmin = window.isAdmin === true;

  const overlay = document.createElement('div');
  overlay.id = 'doc-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:8000;
    display:flex;align-items:center;justify-content:center;padding:16px;
    backdrop-filter:blur(4px);animation:fadeIn 0.2s ease;
  `;
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;width:900px;max-width:98vw;max-height:90vh;overflow-y:auto;
                box-shadow:0 25px 60px rgba(0,0,0,0.25);animation:slideUp 0.3s ease;font-family:'Tajawal',sans-serif;direction:rtl;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,${typeInfo.color},#0d4a85);color:white;padding:20px 24px;
                  border-radius:16px 16px 0 0;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:11px;opacity:0.8;margin-bottom:2px;">${typeInfo.icon} ${typeInfo.label}</div>
          <div style="font-size:22px;font-weight:800;font-family:monospace;">${docNo}</div>
          <div style="font-size:12px;opacity:0.85;margin-top:3px;">📅 ${dateStr} &nbsp;&nbsp; 🏭 ${doc.warehouse}</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          ${isAdmin ? `<button onclick="window.editDocModal('${docNo}')" 
            style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;
                   padding:8px 16px;border-radius:8px;font-family:'Tajawal',sans-serif;cursor:pointer;font-size:13px;">
            ✏️ تعديل
          </button>` : ''}
          <button onclick="window.printDocModal('${docNo}')"
            style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;
                   padding:8px 16px;border-radius:8px;font-family:'Tajawal',sans-serif;cursor:pointer;font-size:13px;">
            🖨️ طباعة
          </button>
          <button onclick="document.getElementById('doc-modal-overlay').remove()"
            style="background:rgba(255,255,255,0.15);border:none;color:white;width:36px;height:36px;
                   border-radius:50%;font-size:20px;cursor:pointer;">✕</button>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e2e8f0;color:#475569;">كود</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e2e8f0;color:#475569;">المنتج</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e2e8f0;color:#475569;">الباتش</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e2e8f0;color:#475569;">الصلاحية</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e2e8f0;color:#475569;">الكمية</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #e2e8f0;color:#475569;">المستودع</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>
        <div style="margin-top:16px;text-align:center;">
          <span style="font-size:12px;color:#94a3b8;">إجمالي الأصناف: ${doc.lines.length}</span>
        </div>
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

// ─── Print Document ────────────────────────────────────────────────────────
window.printDocModal = function (docNo) {
  const doc = _registryData.find(d => d.reference_no === docNo);
  if (!doc) return;
  const typeInfo = getTypeLabel(doc.reference_type, doc.transaction_type);

  const linesHtml = doc.lines.map(line => `
    <tr>
      <td>${line.products?.product_code || '—'}</td>
      <td>${line.products?.name || '—'}</td>
      <td>${line.batch_no || '—'}</td>
      <td>${line.expiry_date || '—'}</td>
      <td>${Math.abs(line.quantity)}</td>
    </tr>
  `).join('');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8">
    <style>
      body{font-family:'Tajawal',Arial,sans-serif;direction:rtl;padding:20px;font-size:13px;}
      h2{color:#1a6ab8;} table{width:100%;border-collapse:collapse;margin-top:10px;}
      th{background:#1a6ab8;color:white;padding:8px;} td{border:1px solid #ddd;padding:8px;}
      .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a6ab8;padding-bottom:10px;margin-bottom:16px;}
      @media print { .no-print{display:none;} }
    </style>
    </head><body>
    <div class="hdr">
      <div><h2>شركة رحلة الامتياز للتجارة</h2><p>نظام إدارة المخازن (WMS)</p></div>
      <div><strong>${typeInfo.icon} ${typeInfo.label}</strong><br>${docNo}</div>
    </div>
    <table>
      <thead><tr><th>الكود</th><th>المنتج</th><th>الباتش</th><th>الصلاحية</th><th>الكمية</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <p style="margin-top:20px;color:#64748b;">التاريخ: ${new Date(doc.created_at).toLocaleString('ar-EG')} &nbsp;|&nbsp; المستودع: ${doc.warehouse}</p>
    <button class="no-print" onclick="window.print()" style="margin-top:10px;padding:8px 20px;background:#1a6ab8;color:white;border:none;border-radius:6px;cursor:pointer;">🖨️ طباعة</button>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 500);
};

// ─── Edit Document Modal (Admin Only) ─────────────────────────────────────
window.editDocModal = async function (docNo) {
  if (!window.isAdmin) { showMsg('❌ هذه الميزة للمشرفين فقط', 'error'); return; }

  const doc = _registryData.find(d => d.reference_no === docNo);
  if (!doc) return;

  document.getElementById('doc-edit-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'doc-edit-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9000;
    display:flex;align-items:center;justify-content:center;padding:16px;
    backdrop-filter:blur(4px);
  `;

  const rowsHtml = doc.lines.map((line, idx) => {
    const prodName = line.products?.name || '—';
    const prodCode = line.products?.product_code || '';
    return `
      <tr data-line-id="${line.id}" data-product-id="${line.product_id}">
        <td style="font-family:monospace;color:#1a6ab8;">${prodCode}</td>
        <td>${prodName}</td>
        <td><input type="text" class="edit-batch" value="${line.batch_no || ''}" 
               style="width:100px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;"></td>
        <td><input type="date" class="edit-expiry" value="${line.expiry_date || ''}"
               style="padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;"></td>
        <td><input type="number" class="edit-qty" value="${Math.abs(line.quantity)}" min="0.01" step="0.01"
               style="width:80px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-weight:700;"></td>
        <td>${line.warehouses?.name || '—'}</td>
      </tr>
    `;
  }).join('');

  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;width:900px;max-width:98vw;max-height:92vh;overflow-y:auto;
                box-shadow:0 25px 60px rgba(0,0,0,0.3);font-family:'Tajawal',sans-serif;direction:rtl;">
      <div style="background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;padding:18px 24px;
                  border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:11px;opacity:0.8;">🔒 Admin | تعديل مستند</div>
          <div style="font-size:20px;font-weight:800;font-family:monospace;">${docNo}</div>
          <div style="font-size:11px;opacity:0.8;margin-top:2px;">⚠️ التعديل ينشئ قيداً عكسياً تلقائياً (ERP Standard)</div>
        </div>
        <button onclick="document.getElementById('doc-edit-overlay').remove()"
          style="background:rgba(255,255,255,0.2);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px;">✕</button>
      </div>
      <div style="padding:20px;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#991b1b;">
          ⚠️ تنبيه: سيتم إنشاء قيد عكسي يلغي المعاملات القديمة ثم قيود جديدة بالقيم المحدّثة.
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px;text-align:right;">الكود</th>
              <th style="padding:8px;text-align:right;">المنتج</th>
              <th style="padding:8px;text-align:right;">الباتش</th>
              <th style="padding:8px;text-align:right;">الصلاحية</th>
              <th style="padding:8px;text-align:right;">الكمية</th>
              <th style="padding:8px;text-align:right;">المستودع</th>
            </tr>
          </thead>
          <tbody id="edit-doc-rows">${rowsHtml}</tbody>
        </table>
        <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end;">
          <button onclick="document.getElementById('doc-edit-overlay').remove()"
            style="padding:10px 20px;border:1px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer;font-family:'Tajawal',sans-serif;">
            إلغاء
          </button>
          <button id="btn-confirm-edit-doc"
            onclick="window.confirmEditDoc('${docNo}')"
            style="padding:10px 24px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;
                   border:none;border-radius:8px;cursor:pointer;font-family:'Tajawal',sans-serif;font-weight:700;">
            💾 تأكيد التعديل
          </button>
        </div>
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window.confirmEditDoc = async function (docNo) {
  const btn = document.getElementById('btn-confirm-edit-doc');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التعديل...'; }

  const doc = _registryData.find(d => d.reference_no === docNo);
  if (!doc) return;

  const rows = document.querySelectorAll('#edit-doc-rows tr[data-line-id]');
  const newLines = [];

  rows.forEach(row => {
    const lineId    = row.getAttribute('data-line-id');
    const prodId    = row.getAttribute('data-product-id');
    const batch     = row.querySelector('.edit-batch')?.value?.trim() || '';
    const expiry    = row.querySelector('.edit-expiry')?.value || null;
    const qty       = parseFloat(row.querySelector('.edit-qty')?.value || '0');
    newLines.push({ lineId, prodId, batch, expiry, qty });
  });

  if (newLines.some(l => l.qty <= 0)) {
    showMsg('❌ الكمية يجب أن تكون أكبر من صفر', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 تأكيد التعديل'; }
    return;
  }

  try {
    const userId = (await supabase.auth.getUser()).data?.user?.id;
    const revRef = 'REV-' + docNo;
    const timestamp = new Date().toISOString();

    // Step 1: Create reverse transactions (undo originals)
    const reversals = doc.lines.map(orig => ({
      product_id:       orig.product_id,
      warehouse_id:     orig.warehouse_id,
      batch_no:         orig.batch_no,
      expiry_date:      orig.expiry_date,
      transaction_type: ['IN','OPENING','TRANSFER_IN'].includes(orig.transaction_type) ? 'OUT' : 'IN',
      quantity:         Math.abs(orig.quantity),
      unit:             orig.unit || 'unit',
      quantity_in_base: Math.abs(orig.quantity),
      reference_type:   'reversal',
      reference_no:     revRef,
      notes:            `قيد عكسي للمستند: ${docNo}`,
      created_by:       userId
    }));

    const { error: revErr } = await supabase.from('inventory_transactions').insert(reversals);
    if (revErr) throw revErr;

    // Step 2: Insert corrected transactions
    const corrected = newLines.map(nl => {
      const orig = doc.lines.find(l => l.id === nl.lineId);
      if (!orig) return null;
      return {
        product_id:       nl.prodId || orig.product_id,
        warehouse_id:     orig.warehouse_id,
        batch_no:         nl.batch || orig.batch_no,
        expiry_date:      nl.expiry || orig.expiry_date,
        transaction_type: orig.transaction_type,
        quantity:         nl.qty,
        unit:             orig.unit || 'unit',
        quantity_in_base: nl.qty,
        reference_type:   orig.reference_type,
        reference_no:     docNo + '-EDIT',
        notes:            `تعديل على المستند: ${docNo}`,
        created_by:       userId
      };
    }).filter(Boolean);

    const { error: corrErr } = await supabase.from('inventory_transactions').insert(corrected);
    if (corrErr) throw corrErr;

    showMsg(`✅ تم تعديل المستند ${docNo} وإنشاء القيد العكسي ${revRef} بنجاح`);
    document.getElementById('doc-edit-overlay')?.remove();
    document.getElementById('doc-modal-overlay')?.remove();
    await loadRegistry();

  } catch (err) {
    showMsg('❌ خطأ في التعديل: ' + (err.message || err), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '💾 تأكيد التعديل'; }
  }
};
