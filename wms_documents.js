/**
 * wms_documents.js — ERP Document UI v3.0 (SAP/Odoo Level UX)
 * ════════════════════════════════════════════════════════════
 * v1: Basic List + Form
 * v2: Prefill fix + Stock Preview + Inline Validation
 * v3: + Auto Row | Keyboard Flow | Live Post Validation
 *     + Row Error Highlight | Global Loading | Ctrl+S/Enter
 *     + Better Stock Feedback | Sticky Table
 */

// ─── Module State ─────────────────────────────────────────────────────
let _currentDocId  = null;
let _currentDoc    = null;
let _isPosted      = false;
let _stockMap      = {};   // { rowId → { available, required, ok } }
let _isLoading     = false;

// ══════════════════════════════════════════════════════════════════════
//  PAGE 1: DOCUMENTS LIST
// ══════════════════════════════════════════════════════════════════════
window.init_documents = async function () {
  await _loadDocList();
  _bindListFilters();
};

async function _loadDocList(filters = {}) {
  const tbody   = document.getElementById('docs-list-body');
  const countEl = document.getElementById('docs-count');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="tbl-loading">⏳ جاري التحميل...</td></tr>';

  try {
    const { docs, total } = await DocumentService.listDocuments(filters);
    if (countEl) countEl.textContent = total;

    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">📄 لا توجد مستندات. اضغط "مستند جديد" للبدء.</td></tr>';
      return;
    }

    tbody.innerHTML = docs.map(doc => {
      const ti      = _typeInfo(doc.doc_type);
      const si      = _statusInfo(doc.status);
      const date    = doc.doc_date || doc.created_at?.split('T')[0] || '—';
      const wh      = doc.warehouses?.name || '—';
      const postedAt = doc.posted_at
        ? new Date(doc.posted_at).toLocaleDateString('ar-EG') : '—';

      return `<tr onclick="window.openDocumentForm('${doc.id}')">
        <td><span class="mono-bold">${doc.doc_number || '—'}</span></td>
        <td><span class="type-badge" style="background:${ti.bg};color:${ti.color};">${ti.icon} ${ti.label}</span></td>
        <td>${date}</td>
        <td>${wh}</td>
        <td><span class="status-pill" style="background:${si.bg};color:${si.color};border:1px solid ${si.border};">${si.icon} ${si.label}</span></td>
        <td style="font-size:11px;color:#94a3b8;">${postedAt}</td>
        <td><button class="btn bt btn-sm" onclick="event.stopPropagation();window.openDocumentForm('${doc.id}')">🔎</button></td>
      </tr>`;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:red;text-align:center;padding:20px;">❌ ${err.message}</td></tr>`;
  }
}

function _bindListFilters() {
  const doFilter = () => _loadDocList({
    doc_type:   document.getElementById('docs-filter-type')?.value   || undefined,
    status:     document.getElementById('docs-filter-status')?.value || undefined,
    doc_number: document.getElementById('docs-filter-search')?.value || undefined,
    date_from:  document.getElementById('docs-filter-from')?.value   || undefined,
    date_to:    document.getElementById('docs-filter-to')?.value     || undefined,
  });

  ['docs-filter-type','docs-filter-status'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', doFilter));
  document.getElementById('docs-filter-search')?.addEventListener('input', doFilter);
  document.getElementById('docs-filter-from')?.addEventListener('change', doFilter);
  document.getElementById('docs-filter-to')?.addEventListener('change', doFilter);
  document.getElementById('docs-filter-clear')?.addEventListener('click', () => {
    ['docs-filter-type','docs-filter-status','docs-filter-search',
     'docs-filter-from','docs-filter-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    _loadDocList();
  });
}

// ══════════════════════════════════════════════════════════════════════
//  PAGE 2: DOCUMENT FORM
// ══════════════════════════════════════════════════════════════════════
window.init_document_form = async function (routeParam) {
  _currentDocId = null;
  _currentDoc   = null;
  _isPosted     = false;
  _stockMap     = {};

  await Promise.all([
    _fillSelect('df-warehouse', 'warehouses', 'id', 'name', '-- اختر المستودع --'),
    _fillSelect('df-target-wh', 'warehouses', 'id', 'name', '-- المستودع الهدف --'),
    _fillSelect('df-supplier',  'suppliers',  'id', 'name', '-- اختر المورد --'),
    _fillSelect('df-customer',  'customers',  'id', 'name', '-- اختر العميل --'),
    window.ensureProductsCache?.(),
  ]);

  const docId = (routeParam && routeParam !== 'new' && !routeParam.startsWith('new-')) ? routeParam : null;

  const typeEl = document.getElementById('df-type');
  if (docId) {
    _currentDocId = docId;
    await _loadDoc(docId);
  } else {
    _resetForm();
    if (routeParam && routeParam.startsWith('new-')) {
       const type = routeParam.split('-')[1];
       if (typeEl) {
         typeEl.value = type;
         typeEl.disabled = true;
         typeEl.style.backgroundColor = '#f1f5f9';
         typeEl.style.cursor = 'not-allowed';
         typeEl.style.color = 'var(--excell-blue)';
         typeEl.style.fontWeight = 'bold';
       }
       _onTypeChange();
    } else {
       if (typeEl) {
         typeEl.disabled = false;
         typeEl.style.backgroundColor = '';
         typeEl.style.cursor = '';
         typeEl.style.color = '';
         typeEl.style.fontWeight = '';
       }
    }
  }

  document.getElementById('df-type')?.addEventListener('change', _onTypeChange);
  document.getElementById('df-warehouse')?.addEventListener('change', _onWarehouseChange);

  // ── Keyboard Shortcuts ────────────────────────────────────────────
  _bindShortcuts();
};

// ── Load existing document ────────────────────────────────────────────
async function _loadDoc(docId) {
  _setLoading(true, 'جاري تحميل المستند...');
  try {
    const [doc, lines] = await Promise.all([
      DocumentService.getDocument(docId),
      DocumentService.getLines(docId),
    ]);

    _currentDoc = doc;
    _isPosted   = doc.status === 'posted';

    _setVal('df-type',      doc.doc_type);
    _setVal('df-warehouse', doc.warehouses?.id);
    _setVal('df-target-wh', doc.target_wh?.id);
    _setVal('df-supplier',  doc.suppliers?.id);
    _setVal('df-customer',  doc.customers?.id);
    _setVal('df-date',      doc.doc_date || '');
    _setVal('df-notes',     doc.notes    || '');

    document.getElementById('df-doc-number').textContent = doc.doc_number || '—';
    _onTypeChange();
    _renderStatusBadge(doc.status);
    _renderNav(doc.doc_number, doc.doc_type);

    await _renderLines(lines, _isPosted);
    _updateTotal();
    _setReadonly(_isPosted);
    _renderActions(doc.status);

    if (_isPosted && doc.posted_at) {
      const info = document.getElementById('df-posted-info');
      if (info) {
        info.style.display = 'block';
        info.innerHTML = `✅ تم الترحيل بتاريخ: <strong>${new Date(doc.posted_at).toLocaleString('ar-EG')}</strong>`;
      }
    }

  } catch (err) {
    showMsg('❌ خطأ في تحميل المستند: ' + err.message, 'error');
  } finally {
    _setLoading(false);
  }
}

function _resetForm() {
  document.getElementById('df-doc-number').textContent = 'مستند جديد (سيُولَّد تلقائياً)';
  _setVal('df-type', 'RECEIPT');
  _setVal('df-date', new Date().toISOString().split('T')[0]);
  _setVal('df-notes', '');
  ['df-warehouse','df-supplier','df-customer','df-target-wh'].forEach(id => _setVal(id, ''));

  document.getElementById('df-lines-body').innerHTML = '';
  const info = document.getElementById('df-posted-info');
  if (info) info.style.display = 'none';

  _onTypeChange();
  _renderStatusBadge('draft');
  _renderNav(null, null);
  _renderActions('draft');
  _setReadonly(false);
  _updateTotal();
  _updatePostButtonState();
}

// ── Conditional fields ────────────────────────────────────────────────
function _onTypeChange() {
  const type = document.getElementById('df-type')?.value;
  document.getElementById('df-supplier-row').style.display  = type === 'RECEIPT'  ? '' : 'none';
  document.getElementById('df-customer-row').style.display  = type === 'ISSUE'    ? '' : 'none';
  document.getElementById('df-target-wh-row').style.display = type === 'TRANSFER' ? '' : 'none';
}

async function _onWarehouseChange() {
  const wid = document.getElementById('df-warehouse')?.value;
  if (!wid) return;
  for (const tr of document.querySelectorAll('#df-lines-body tr[data-rowid]')) {
    const pid = tr.querySelector('.p-select')?.value;
    const qty = parseFloat(tr.querySelector('.df-qty')?.value || '0');
    if (pid) await _refreshStock(tr, pid, wid, qty);
  }
  _updatePostButtonState();
}

// ══════════════════════════════════════════════════════════════════════
//  LINES MANAGEMENT
// ══════════════════════════════════════════════════════════════════════
async function _renderLines(lines, readonly) {
  const tbody = document.getElementById('df-lines-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const warehouseId = document.getElementById('df-warehouse')?.value;

  for (const line of lines) {
    const rowId = _genId();
    const tr    = _buildRow(rowId, line, readonly);
    tbody.appendChild(tr);

    // ── Prefill autocomplete ──────────────────────────────────────
    const prod = line.products;
    if (prod) {
      const si = tr.querySelector('.p-search');
      const hi = tr.querySelector('.p-select');
      if (si) si.value = `[${prod.product_code}] ${prod.name}`;
      if (hi) hi.value = prod.id;
    }

    if (!readonly) {
      _initRowAC(tr);
    }

    if (warehouseId && line.products?.id) {
      await _refreshStock(tr, line.products.id, warehouseId, line.quantity);
    }

    if (line.expiry_date) _checkExpiry(tr, line.expiry_date);
  }

  // Add one empty row for new documents
  if (!readonly && lines.length === 0) {
    _addNewRow();
  }
}

function _buildRow(rowId, line = {}, readonly = false) {
  const tr = document.createElement('tr');
  tr.dataset.rowid = rowId;

  tr.innerHTML = `
    <td style="min-width:220px;">
      ${readonly
        ? `<div class="prod-label">[${line.products?.product_code || ''}] ${line.products?.name || '—'}</div>`
        : `<div class="ac-wrap" style="position:relative;">
             <input type="text" class="p-search" placeholder="ابحث عن صنف..." autocomplete="off">
             <input type="hidden" class="p-select">
           </div>`
      }
    </td>
    <td>
      <input type="text" class="df-batch" value="${line.batch_no || ''}"
        placeholder="الباتش *" ${readonly ? 'disabled' : ''}
        style="width:120px;" tabindex="0">
    </td>
    <td>
      <input type="date" class="df-expiry" value="${line.expiry_date || ''}"
        ${readonly ? 'disabled' : ''} style="width:130px;">
      <div class="expiry-warn" style="display:none;font-size:10px;margin-top:2px;"></div>
    </td>
    <td>
      <input type="number" class="df-qty" value="${line.quantity || ''}"
        min="0.001" step="0.001" ${readonly ? 'disabled' : ''}
        style="width:80px;" tabindex="0"
        placeholder="0">
    </td>
    <td class="df-stock-cell" style="min-width:100px;">
      <span class="stock-badge">—</span>
    </td>
    ${!readonly ? `<td><button class="btn br btn-sm" title="حذف" onclick="this.closest('tr').remove();window._updateTotal();window._updatePostButtonState();">🗑</button></td>` : '<td></td>'}
  `;

  _bindRowEvents(tr, readonly);
  return tr;
}

function _bindRowEvents(tr, readonly) {
  if (readonly) return;

  const batchInput = tr.querySelector('.df-batch');
  const expiryInput = tr.querySelector('.df-expiry');
  const qtyInput  = tr.querySelector('.df-qty');

  // Expiry change
  expiryInput?.addEventListener('change', () => {
    if (expiryInput.value) _checkExpiry(tr, expiryInput.value);
    _highlightRow(tr);
  });

  // Qty change → stock check + auto row + total + post button
  qtyInput?.addEventListener('input', async () => {
    _updateTotal();
    _highlightRow(tr);
    const pid = tr.querySelector('.p-select')?.value;
    const wid = document.getElementById('df-warehouse')?.value;
    const qty = parseFloat(qtyInput.value || '0');
    if (pid && wid) await _refreshStock(tr, pid, wid, qty);
    _maybeAddAutoRow();
    _updatePostButtonState();
  });

  // Batch change → validate + highlight
  batchInput?.addEventListener('input', () => {
    _highlightRow(tr);
    _updatePostButtonState();
  });

  // ── Keyboard Flow: Tab/Enter navigation ──────────────────────────
  qtyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      _maybeAddAutoRow();
      // Focus product search of last row
      setTimeout(() => {
        const rows = document.querySelectorAll('#df-lines-body tr[data-rowid]');
        const lastRow = rows[rows.length - 1];
        lastRow?.querySelector('.p-search')?.focus();
      }, 50);
    }
  });

  batchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) {
      // Natural tab to expiry then qty — no override needed
    }
  });
}

function _initRowAC(tr) {
  const wrap = tr.querySelector('.ac-wrap');
  if (!wrap || typeof window.initProductAutocomplete !== 'function') return;
  window.initProductAutocomplete(wrap, {
    onSelect: async (item) => {
      if (!item) return;
      const batchInput  = tr.querySelector('.df-batch');
      const expiryInput = tr.querySelector('.df-expiry');
      const wid = document.getElementById('df-warehouse')?.value;
      const type = document.getElementById('df-type')?.value;

      let appliedBatch = false;
      if (wid && ['ISSUE', 'TRANSFER'].includes(type) && item.id) {
        // Smart Batch FIFO Auto-selection
        const stocks = await DocumentService.getAvailableStock(item.id, wid);
        if (stocks && stocks.length > 0) {
          const best = stocks[0];
          if (batchInput) batchInput.value = best.batch_no;
          if (expiryInput && best.expiry_date) {
            expiryInput.value = best.expiry_date;
            _checkExpiry(tr, best.expiry_date);
          }
          const qtyInput = tr.querySelector('.df-qty');
          if (qtyInput && !qtyInput.value) qtyInput.value = '1';
          appliedBatch = true;
        }
      }
      
      if (!appliedBatch) {
        if (batchInput  && item.batch_no)    batchInput.value  = item.batch_no;
        if (expiryInput && item.expiry_date) {
          expiryInput.value = item.expiry_date;
          _checkExpiry(tr, item.expiry_date);
        }
      }

      const qty = parseFloat(tr.querySelector('.df-qty')?.value || '0');
      if (wid && item.id) await _refreshStock(tr, item.id, wid, qty);
      _highlightRow(tr);
      _updatePostButtonState();
      // Auto-focus batch after product selection
      setTimeout(() => batchInput?.focus(), 100);
    }
  });
}

// ── Add new empty row ─────────────────────────────────────────────────
function _addNewRow() {
  if (_isPosted) return;
  const tbody = document.getElementById('df-lines-body');
  if (!tbody) return;
  const rowId = _genId();
  const tr    = _buildRow(rowId, {}, false);
  tbody.appendChild(tr);
  _initRowAC(tr);
  return tr;
}

// ── Auto Row: add row when last row is filled ─────────────────────────
function _maybeAddAutoRow() {
  const rows = document.querySelectorAll('#df-lines-body tr[data-rowid]');
  if (!rows.length) return;
  const lastRow = rows[rows.length - 1];
  const pid = lastRow.querySelector('.p-select')?.value;
  const qty = parseFloat(lastRow.querySelector('.df-qty')?.value || '0');
  if (pid && qty > 0) {
    _addNewRow();
  }
}

// ── Stock Feedback (with required vs available context & Collisions) ──
async function _refreshStock(tr, productId, warehouseId, qty = 0) {
  const badge = tr.querySelector('.stock-badge');
  if (!badge) return;
  badge.textContent = '⏳';
  badge.className = 'stock-badge';

  try {
    const stocks  = await DocumentService.getAvailableStock(productId, warehouseId);
    let avail     = stocks.reduce((s, r) => s + (Number(r.total_stock) || 0), 0);
    const docType = document.getElementById('df-type')?.value;
    const needsStock = ['ISSUE', 'TRANSFER'].includes(docType);

    // Smart Draft Collision Check (Warning without hard reservations)
    let collisionWarn = '';
    if (needsStock) {
      const collisions = await DocumentService.getDraftCollisions(productId, warehouseId, _currentDocId);
      if (collisions > 0) {
        avail -= collisions;
        collisionWarn = `<div style="color:#d97706;font-size:10px;margin-top:2px;background:#fef3c7;padding:2px;border-radius:3px;">
          ⚠️ مسودات أخرى تسحب: ${collisions}
        </div>`;
      }
    }

    const rowId   = tr.dataset.rowid;
    const ok      = avail >= qty;
    _stockMap[rowId] = { available: avail, required: qty, ok };

    let html = '';
    if (!needsStock) {
      // For OPENING/RECEIPT — just show what's there
      html = avail > 0
        ? `<span class="sb-ok">📦 ${avail.toLocaleString()}</span>`
        : `<span style="color:#94a3b8;font-size:11px;">رصيد صفر</span>`;
    } else if (qty > 0 && !ok) {
      html = `<span class="sb-err">🔴 متاح: ${avail} | مطلوب: ${qty}</span>`;
      
      // Multi-Warehouse Intelligence Suggestion
      const global = await DocumentService.getGlobalStock(productId);
      const otherWh = global.find(s => s.warehouse_id !== warehouseId && s.total_stock >= qty);
      if (otherWh) {
         html += `<div style="font-size:10px;margin-top:4px;background:#eff6ff;border:1px solid #bfdbfe;padding:4px;border-radius:4px;">
           💡 متوفر في <strong style="color:#1d4ed8">${otherWh.warehouses.name}</strong> (${otherWh.total_stock})
           <button class="btn btn-outline btn-sm" onclick="window._moveLineToNewDoc('${rowId}')" style="display:block;margin-top:4px;width:100%;font-size:10px;padding:2px;">نقل لمسودة منفصلة</button>
         </div>`;
      }
    } else {
      html = `<span class="sb-ok">🟢 ${avail.toLocaleString()}</span>`;
    }

    badge.innerHTML = html + collisionWarn;

    _highlightRow(tr);
    _updatePostButtonState();

  } catch (err) {
    console.error(err);
    badge.textContent = '—';
  }
}

// ── Row Error Highlighting ────────────────────────────────────────────
function _highlightRow(tr) {
  const rowId  = tr.dataset.rowid;
  const pid    = tr.querySelector('.p-select')?.value;
  const batch  = tr.querySelector('.df-batch')?.value?.trim();
  const qty    = parseFloat(tr.querySelector('.df-qty')?.value || '0');
  const stock  = _stockMap[rowId];
  const type   = document.getElementById('df-type')?.value;
  const needsStock = ['ISSUE', 'TRANSFER'].includes(type);

  const hasError = !pid || !batch || qty <= 0 || (needsStock && stock && !stock.ok);

  tr.classList.toggle('row-error', hasError);
  tr.classList.toggle('row-ok',    !hasError && !!pid && !!batch && qty > 0);
}

// ── Collect all rows + inline validation ─────────────────────────────
function _collectAndValidate() {
  const type    = document.getElementById('df-type')?.value;
  const needExp = ['ISSUE','TRANSFER'].includes(type);
  const rows    = [...document.querySelectorAll('#df-lines-body tr[data-rowid]')];

  // Filter out completely empty rows
  const dataRows = rows.filter(tr => {
    const pid = tr.querySelector('.p-select')?.value;
    const qty = parseFloat(tr.querySelector('.df-qty')?.value || '0');
    return pid || qty > 0;
  });

  if (!dataRows.length) {
    showMsg('❌ أضف صنفاً واحداً على الأقل', 'error');
    return null;
  }

  const lines = [];
  for (const tr of dataRows) {
    const productId = tr.querySelector('.p-select')?.value?.trim();
    const batch     = tr.querySelector('.df-batch')?.value?.trim();
    const expiry    = tr.querySelector('.df-expiry')?.value || null;
    const qty       = parseFloat(tr.querySelector('.df-qty')?.value || '0');

    if (!productId) {
      showMsg('❌ يرجى اختيار صنف في كل الأسطر', 'error');
      tr.querySelector('.p-search')?.focus();
      return null;
    }
    if (!batch) {
      showMsg('❌ رقم الباتش مطلوب', 'error');
      tr.querySelector('.df-batch')?.focus();
      return null;
    }
    if (qty <= 0) {
      showMsg('❌ الكمية يجب أن تكون أكبر من صفر', 'error');
      tr.querySelector('.df-qty')?.focus();
      return null;
    }
    if (needExp && !expiry) {
      showMsg('❌ تاريخ الصلاحية مطلوب عند الصرف أو التحويل', 'error');
      tr.querySelector('.df-expiry')?.focus();
      return null;
    }

    lines.push({ product_id: productId, batch_no: batch, expiry_date: expiry, quantity: qty });
  }
  return lines;
}

// ── Collect header ────────────────────────────────────────────────────
function _collectHeader() {
  const type        = document.getElementById('df-type')?.value;
  const warehouseId = document.getElementById('df-warehouse')?.value;
  if (!warehouseId) { showMsg('❌ يرجى اختيار المستودع', 'error'); return null; }
  if (!type)        { showMsg('❌ يرجى اختيار نوع المستند', 'error'); return null; }
  return {
    doc_type:     type,
    warehouse_id: warehouseId,
    target_wh_id: document.getElementById('df-target-wh')?.value  || null,
    supplier_id:  document.getElementById('df-supplier')?.value   || null,
    customer_id:  document.getElementById('df-customer')?.value   || null,
    doc_date:     document.getElementById('df-date')?.value       || null,
    notes:        document.getElementById('df-notes')?.value      || null,
  };
}

// ── Total ─────────────────────────────────────────────────────────────
window._updateTotal = function () {
  let t = 0;
  document.querySelectorAll('#df-lines-body .df-qty').forEach(i => { t += parseFloat(i.value || '0'); });
  const el = document.getElementById('df-total-qty');
  if (el) el.textContent = (t % 1 === 0 ? t : t.toFixed(3)).toLocaleString();
};

// ── Post Button Live Validation (Disable/Enable) ──────────────────────
function _updatePostButtonState() {
  const postBtn = document.querySelector('[data-action="post"]');
  if (!postBtn || _isPosted) return;

  const rows     = [...document.querySelectorAll('#df-lines-body tr[data-rowid]')];
  const type     = document.getElementById('df-type')?.value;
  const needsStock = ['ISSUE','TRANSFER'].includes(type);
  const wid      = document.getElementById('df-warehouse')?.value;

  const hasWh    = !!wid;
  const dataRows = rows.filter(tr => tr.querySelector('.p-select')?.value);

  const allValid = dataRows.length > 0 && dataRows.every(tr => {
    const rowId = tr.dataset.rowid;
    const pid   = tr.querySelector('.p-select')?.value;
    const batch = tr.querySelector('.df-batch')?.value?.trim();
    const qty   = parseFloat(tr.querySelector('.df-qty')?.value || '0');
    const stock = _stockMap[rowId];

    const basicOk = !!pid && !!batch && qty > 0;
    const stockOk = !needsStock || !stock || stock.ok;
    return basicOk && stockOk;
  });

  const isValid = hasWh && allValid;
  postBtn.disabled = !isValid;
  postBtn.title    = isValid ? '' : 'تحقق من: المستودع، الأصناف، الباتش، الكميات، والرصيد';
  postBtn.classList.toggle('btn-disabled-hint', !isValid);
}

// ── Expiry check ──────────────────────────────────────────────────────
function _checkExpiry(tr, dateStr) {
  const warnEl = tr.querySelector('.expiry-warn');
  if (!warnEl || !dateStr) return;
  const days = Math.floor((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0) {
    warnEl.innerHTML = `<span style="color:#dc2626;font-weight:700;">⛔ منتهي الصلاحية!</span>`;
    warnEl.style.display = 'block';
  } else if (days <= 30) {
    warnEl.innerHTML = `<span style="color:#d97706;">⚠️ ينتهي خلال ${days} يوم</span>`;
    warnEl.style.display = 'block';
  } else {
    warnEl.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════════

window.docAction_save = async function () {
  const header = _collectHeader(); if (!header) return;
  const lines  = _collectAndValidate(); if (!lines) return;
  _setLoading(true, '💾 جاري الحفظ...');
  try {
    let doc;
    if (_currentDocId) {
      doc = await DocumentService.updateHeader(_currentDocId, header);
    } else {
      doc = await DocumentService.createDraft(header);
      _currentDocId = doc.id;
    }
    await DocumentService.saveLines(_currentDocId, lines);
    _currentDoc = doc;
    document.getElementById('df-doc-number').textContent = doc.doc_number;
    _renderStatusBadge('draft');
    _renderActions('draft');
    window.history.replaceState(null, '', '#document-form/' + _currentDocId);
    showMsg(`✅ تم الحفظ — ${doc.doc_number}`);
  } catch (err) {
    showMsg('❌ ' + err.message, 'error');
  } finally {
    _setLoading(false);
  }
};

window.docAction_post = async function () {
  if (!_currentDocId) { showMsg('❌ احفظ المسودة أولاً', 'error'); return; }
  const lines = _collectAndValidate(); if (!lines) return;

  confirmAction(`تأكيد ترحيل المستند "${_currentDoc?.doc_number}"؟`, async () => {
    _setLoading(true, '📌 جاري الترحيل...');
    try {
      await DocumentService.saveLines(_currentDocId, lines);
      const doc = await DocumentService.postDocument(_currentDocId);
      _currentDoc = doc;
      _isPosted   = true;

      _renderStatusBadge('posted');
      _renderActions('posted');
      _setReadonly(true);

      const info = document.getElementById('df-posted-info');
      if (info) {
        info.style.display = 'block';
        info.innerHTML = `✅ تم الترحيل بتاريخ: <strong>${new Date(doc.posted_at).toLocaleString('ar-EG')}</strong>`;
      }
      showMsg(`✅ تم الاعتماد والترحيل — ${doc.doc_number}`);
    } catch (err) {
      showMsg('❌ ' + err.message, 'error');
    } finally {
      _setLoading(false);
    }
  });
};

window.docAction_unpost = async function () {
  if (!_currentDocId) return;
  confirmAction(`إعادة المستند "${_currentDoc?.doc_number}" لمسودة؟\nسيتم حذف حركات المخزون المرتبطة.`, async () => {
    _setLoading(true, '↩ جاري الإعادة...');
    try {
      const doc = await DocumentService.unpostDocument(_currentDocId);
      _currentDoc = doc;
      _isPosted   = false;
      _renderStatusBadge('draft');
      _renderActions('draft');
      _setReadonly(false);
      document.getElementById('df-posted-info').style.display = 'none';
      showMsg('↩ تم إعادة المستند لمسودة');
    } catch (err) {
      showMsg('❌ ' + err.message, 'error');
    } finally {
      _setLoading(false);
    }
  });
};

window.docAction_delete = async function () {
  if (!_currentDocId) return;
  confirmAction(`حذف المستند "${_currentDoc?.doc_number}" نهائياً؟`, async () => {
    _setLoading(true, '🗑 جاري الحذف...');
    try {
      await DocumentService.deleteDocument(_currentDocId);
      showMsg('🗑 تم الحذف');
      window.navigate('documents');
    } catch (err) {
      showMsg('❌ ' + err.message, 'error');
    } finally {
      _setLoading(false);
    }
  });
};

// ── Keyboard Shortcuts ────────────────────────────────────────────────
function _bindShortcuts() {
  // Remove any previous listener to avoid duplicates
  document.removeEventListener('keydown', _handleShortcut);
  document.addEventListener('keydown', _handleShortcut);
}

function _handleShortcut(e) {
  // Only active when on the form page
  if (!document.getElementById('page-document-form')?.classList.contains('active')) return;
  if (_isPosted) return;

  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    window.docAction_save();
  }
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    window.docAction_post();
  }
}

// ── Global Loading State ──────────────────────────────────────────────
function _setLoading(state, msg = '') {
  _isLoading = state;
  // Disable/enable all action buttons
  document.querySelectorAll('#df-action-bar button').forEach(btn => {
    btn.disabled = state;
  });
  // Show loading message in status bar
  const smsg = document.getElementById('smsg');
  if (smsg) smsg.textContent = state ? msg : 'جاهز';
}

// ══════════════════════════════════════════════════════════════════════
//  RENDER HELPERS
// ══════════════════════════════════════════════════════════════════════
function _renderActions(status) {
  const bar     = document.getElementById('df-action-bar');
  if (!bar) return;

  const module  = 'documents';
  const canC    = window.canCreate(module);
  const canD    = window.canDelete(module);
  const isPosted = status === 'posted';

  bar.innerHTML = `
    ${(!isPosted && canC)  ? `<button class="btn bg" data-action="post" onclick="window.docAction_post()" title="Ctrl+Enter">📌 اعتماد وترحيل</button>` : ''}
    ${(!isPosted && canC)  ? `<button class="btn bp" data-action="save" onclick="window.docAction_save()" title="Ctrl+S">💾 حفظ مسودة</button>` : ''}
    ${(isPosted && canD)   ? `<button class="btn ba" onclick="window.docAction_unpost()">↩ إعادة لمسودة</button>` : ''}
    ${canD                 ? `<button class="btn br" onclick="window.docAction_delete()">🗑 حذف</button>` : ''}
    <button class="btn btn-outline" onclick="window.navigate('documents')">← القائمة</button>
    ${(!isPosted && canC)  ? `<span style="font-size:11px;color:#94a3b8;margin-right:auto;align-self:center;">💡 Ctrl+S للحفظ · Ctrl+Enter للترحيل</span>` : ''}
  `;

  // Set initial post button state
  setTimeout(_updatePostButtonState, 0);
}

function _renderStatusBadge(status) {
  const el = document.getElementById('df-status-badge');
  if (!el) return;
  const si = _statusInfo(status);
  el.innerHTML = `<span class="status-pill" style="background:${si.bg};color:${si.color};border:1px solid ${si.border};padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;">${si.icon} ${si.label}</span>`;
}

function _renderNav(docNumber, docType) {
  const nav = document.getElementById('df-nav-bar');
  if (!nav) return;
  if (!docNumber) { nav.innerHTML = ''; return; }
  nav.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="window._navDoc('prev','${docNumber}','${docType}')">◀ السابق</button>
    <code style="font-size:12px;color:#64748b;padding:0 8px;">${docNumber}</code>
    <button class="btn btn-outline btn-sm" onclick="window._navDoc('next','${docNumber}','${docType}')">التالي ▶</button>
  `;
}

async function _navDoc(dir, cn, ct) {
  try {
    const adj = await DocumentService.getAdjacentDocument(cn, ct, dir);
    if (!adj) { showMsg(dir === 'next' ? 'لا يوجد مستند تالٍ' : 'لا يوجد مستند سابق', 'info'); return; }
    window.navigate('document-form/' + adj.id);
  } catch (err) { showMsg('❌ ' + err.message, 'error'); }
}
window._navDoc = _navDoc;

window._moveLineToNewDoc = async function (rowId) {
  const tr = document.querySelector(`tr[data-rowid="${rowId}"]`);
  if (!tr) return;
  const pid   = tr.querySelector('.p-select')?.value;
  const batch = tr.querySelector('.df-batch')?.value;
  const exp   = tr.querySelector('.df-expiry')?.value;
  const qty   = parseFloat(tr.querySelector('.df-qty')?.value || '0');
  
  if (!pid) return;
  
  _setLoading(true, 'جاري بناء المسودة البديلة...');
  try {
     const global = await DocumentService.getGlobalStock(pid);
     const currentWh = document.getElementById('df-warehouse')?.value;
     const otherWh = global.find(s => s.warehouse_id !== currentWh && s.total_stock >= qty);
     if (!otherWh) throw new Error('الرصيد لم يعد متوفراً في المستودع البديل.');

     const header = _collectHeader();
     if (!header) throw new Error('يجب اختيار تفاصيل الرأس أولاً ليتم نسخها.');
     header.warehouse_id = otherWh.warehouse_id;
     
     // Create new document on the alternate warehouse
     const newDoc = await DocumentService.createDraft(header);
     await DocumentService.addLine(newDoc.id, {
        product_id: pid, batch_no: batch || otherWh.batch_no, 
        expiry_date: exp || otherWh.expiry_date || null, quantity: qty
     });
     
     // Remove from current UI
     tr.remove();
     _updateTotal();
     _updatePostButtonState();
     
     showMsg(`✅ تم نقل السطر لمسودة جديدة: ${newDoc.doc_number}.`, 'success');
  } catch (err) {
     showMsg('❌ خطأ: ' + err.message, 'error');
  } finally {
     _setLoading(false);
  }
};

function _setReadonly(readonly) {
  ['df-type','df-warehouse','df-target-wh','df-supplier','df-customer','df-date','df-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = readonly;
  });
  document.querySelectorAll('#df-lines-body input').forEach(el => el.disabled = readonly);
  document.querySelectorAll('#df-lines-body button').forEach(el => el.style.display = readonly ? 'none' : '');
  const addBtn = document.getElementById('df-btn-add-line');
  if (addBtn) addBtn.style.display = readonly ? 'none' : '';
}

// ── Event Delegation ──────────────────────────────────────────────────
document.addEventListener('click', function (e) {
  if (e.target?.id === 'df-btn-add-line') { _addNewRow(); }
  if (e.target?.id === 'btn-new-document') { window.navigate('document-form/new'); }
});

// ── Utilities ─────────────────────────────────────────────────────────
async function _fillSelect(id, table, val, label, ph) {
  const el = document.getElementById(id);
  if (!el) return;
  const { data } = await supabase.from(table).select(`${val},${label}`).order(label);
  el.innerHTML = `<option value="">${ph}</option>` +
    (data || []).map(r => `<option value="${r[val]}">${r[label]}</option>`).join('');
}
function _setVal(id, val) { const el = document.getElementById(id); if (el && val != null) el.value = val; }
function _genId()         { return 'r' + Math.random().toString(36).slice(2, 9); }

function _typeInfo(t) {
  return ({ OPENING:{label:'رصيد افتتاحي',color:'#7c3aed',bg:'#ede9fe',icon:'🎯'},
            RECEIPT: {label:'استلام (GRN)', color:'#059669',bg:'#d1fae5',icon:'📥'},
            ISSUE:   {label:'صرف (GIV)',    color:'#d97706',bg:'#fef3c7',icon:'📤'},
            TRANSFER:{label:'تحويل',        color:'#0284c7',bg:'#e0f2fe',icon:'🔄'} }[t]
    || {label:t||'—',color:'#64748b',bg:'#f1f5f9',icon:'📋'});
}

function _statusInfo(s) {
  return ({ draft:   {label:'مسودة', color:'#92400e',bg:'#fef3c7',border:'#fde68a',icon:'📝'},
            posted:  {label:'مرحّل',color:'#065f46',bg:'#d1fae5',border:'#a7f3d0',icon:'✅'},
            canceled:{label:'ملغي',  color:'#991b1b',bg:'#fee2e2',border:'#fecaca',icon:'❌'} }[s]
    || {label:s,color:'#64748b',bg:'#f1f5f9',border:'#e2e8f0',icon:'📋'});
}

// ── Public ────────────────────────────────────────────────────────────
window.openDocumentForm  = (id) => window.navigate('document-form/' + id);
window._updateTotal      = window._updateTotal;
window._updatePostButtonState = _updatePostButtonState;
