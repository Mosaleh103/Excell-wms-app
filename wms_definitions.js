/**
 * wms_definitions.js - v3.0 (ERP-Grade)
 * ✅ Auto Code Generation (Categories + Products)
 * ✅ Product Card Modal with full edit
 * ✅ Validation: batch_no + expiry_date + code + name required
 * ✅ conversion_factor field added
 * ✅ Event delegation (works with Router SPA)
 */

window.productsCache = [];
window.warehousesCache = [];
window.customersCache = [];
window.suppliersCache = [];
window.categoriesCache = [];

// ══════════════════════════════════════════════════════
//  INIT FUNCTIONS (called by Router)
// ══════════════════════════════════════════════════════
window.init_def_products = function() {
  loadWarehousesSelect();
  loadCategoriesForProducts();
  loadProducts();

  // Initialize Product Search Autocomplete for Editing
  const searchWrap = document.getElementById('def-prod-search-wrap');
  if (searchWrap && typeof window.buildProductAutocomplete === 'function') {
    searchWrap.innerHTML = window.buildProductAutocomplete();
    window.initProductAutocomplete(searchWrap, {
      onSelect: (item) => {
        window.editProduct(item.id);
        const clearBtn = document.getElementById('btn-clear-def-search');
        if (clearBtn) clearBtn.style.display = 'inline-block';
      }
    });
  }

  // Initialize category searchable autocomplete after a short delay
  setTimeout(() => {
    const selEl = document.getElementById('prod-sub-cat');
    if (selEl && typeof window.initCategoryAutocomplete === 'function') {
      window.initCategoryAutocomplete(selEl);
    }
  }, 800);
};

window.init_def_categories = function() {
  loadCategories();
};

window.init_def_warehouses = function() {
  loadWarehouses();
};

window.init_def_customers = function() {
  loadCustomers();
};

window.init_def_suppliers = function() {
  loadSuppliers();
};


// ══════════════════════════════════════════════════════
//  WAREHOUSES
// ══════════════════════════════════════════════════════
async function loadWarehouses() {
  const tbody = document.getElementById('def-warehouses-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';

  const { data, error } = await supabase.from('warehouses').select('*').order('created_at', { ascending: false });
  if (error) { showMsg('خطأ في تحميل المستودعات', 'error'); return; }

  warehousesCache = data;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد مستودعات.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(wh => `<tr>
    <td>${wh.name}</td>
    <td>${wh.location || '-'}</td>
    <td>${new Date(wh.created_at).toLocaleDateString('ar-SA')}</td>
  </tr>`).join('');
}

async function loadWarehousesSelect() {
  const sel = document.getElementById('prod-def-wh');
  if (!sel) return;
  const { data, error } = await supabase.from('warehouses').select('id, name').order('name');
  if (!error && data) {
    sel.innerHTML = '<option value="">-- بدون مستودع افتراضي --</option>' +
      data.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }
}


// ══════════════════════════════════════════════════════
//  CATEGORIES — AUTO CODE GENERATION
// ══════════════════════════════════════════════════════
async function loadCategories() {
  const tbody = document.getElementById('def-categories-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">جاري التحميل...</td></tr>';

  const { data, error } = await supabase
    .from('categories')
    .select('*, parent:parent_id(name_ar)')
    .order('category_code', { ascending: true });

  if (error) { showMsg('خطأ في تحميل الفئات', 'error'); return; }

  categoriesCache = data;

  // Populate parent selector
  const parentSel = document.getElementById('cat-parent-id');
  if (parentSel) {
    parentSel.innerHTML = '<option value="">-- اختر الفئة الأصل --</option>' +
      data.map(m => {
        const indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat((m.level || 1) - 1);
        return `<option value="${m.id}">${indent}${m.category_code || ''} - ${m.name_ar || m.name || ''}</option>`;
      }).join('');
  }

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد فئات.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(c => {
    const parentStr = c.parent ? (c.parent.name_ar || c.parent.name || '-') : '-';
    const pad = ((c.level || 1) - 1) * 20;
    return `<tr>
      <td style="text-align:right; padding-right:${pad}px; font-weight:bold; color:var(--excell-blue);">${c.category_code || '-'}</td>
      <td>${c.name_ar || c.name || '-'}</td>
      <td>${c.name_en || '-'}</td>
      <td>مستوى ${c.level || 1}</td>
      <td>${parentStr}</td>
      <td>
        <button class="btn bt btn-sm" onclick="window.editCategory('${c.id}')" data-perm="categories-edit">✏️ تعديل</button>
      </td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
//  PRODUCT CACHE LOADER (called by any page that needs product search)
// ══════════════════════════════════════════════════════
window.ensureProductsCache = async function() {
  if (window.productsCache && window.productsCache.length > 0) return; // already loaded
  const { data, error } = await supabase
    .from('products')
    .select('id, product_code, name, name_en, unit, brand, batch_no, expiry_date')
    .order('product_code');
  if (!error && data) window.productsCache = data;
};

/**
 * Auto generate next category code based on parent selection
 */
async function generateCategoryCode(parentId, isMain) {
  if (isMain) {
    // Top-level: find max top-level code
    const { data } = await supabase
      .from('categories')
      .select('category_code')
      .is('parent_id', null)
      .order('category_code', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return '1001';
    const lastCode = data[0].category_code || '';
    const num = parseInt(lastCode) || 1000;
    return String(num + 1);

  } else {
    // Sub-level: find last child under this parent
    const parent = categoriesCache.find(c => c.id === parentId);
    const parentCode = parent ? (parent.category_code || '') : '';

    const { data } = await supabase
      .from('categories')
      .select('category_code')
      .eq('parent_id', parentId)
      .order('category_code', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) {
      return parentCode + '01';
    }
    const lastCode = data[0].category_code || '';
    // Extract suffix and increment
    const suffix = lastCode.slice(parentCode.length);
    const num = parseInt(suffix) || 0;
    const newSuffix = String(num + 1).padStart(suffix.length || 2, '0');
    return parentCode + newSuffix;
  }
}

/**
 * Auto generate next product code based on category code
 */
async function generateProductCode(categoryId) {
  const cat = categoriesCache.find(c => c.id === categoryId);
  if (!cat || !cat.category_code) return '';
  const catCode = cat.category_code;

  const { data } = await supabase
    .from('products')
    .select('product_code')
    .eq('category_id', categoryId)
    .order('product_code', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) {
    return catCode + '001';
  }
  const lastCode = data[0].product_code || '';
  const suffix = lastCode.slice(catCode.length);
  const num = parseInt(suffix) || 0;
  const newSuffix = String(num + 1).padStart(Math.max(suffix.length || 3, 3), '0');
  return catCode + newSuffix;
}


window.editCategory = function(id) {
  const c = categoriesCache.find(x => x.id === id);
  if (!c) return;

  const title = document.getElementById('form-title-category');
  if (title) title.innerHTML = '✏️ تعديل الفئة';

  document.getElementById('cat-edit-id').value = c.id;
  document.getElementById('cat-code').value = c.category_code || '';
  document.getElementById('cat-name-ar').value = c.name_ar || c.name || '';
  document.getElementById('cat-name-en').value = c.name_en || '';
  
  const typeEl = document.getElementById('cat-type');
  const parentIdEl = document.getElementById('cat-parent-id');
  const pRow = document.getElementById('cat-parent-row');
  
  if (c.parent_id) {
    if (typeEl) typeEl.value = 'sub';
    if (parentIdEl) parentIdEl.value = c.parent_id;
    if (pRow) pRow.style.display = 'block';
  } else {
    if (typeEl) typeEl.value = 'main';
    if (parentIdEl) parentIdEl.value = '';
    if (pRow) pRow.style.display = 'none';
  }
  
  window.navigate('def-categories-form');
};

window.saveCategoryModal = async function(id) {
  const nameAr = document.getElementById('cqm-name-ar')?.value.trim();
  const nameEn = document.getElementById('cqm-name-en')?.value.trim();
  const btn    = document.getElementById('cqm-save-btn');

  if (!nameAr) { showMsg('❌ اسم الفئة بالعربي مطلوب', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }

  const { error } = await supabase
    .from('categories')
    .update({ name_ar: nameAr, name: nameAr, name_en: nameEn || null })
    .eq('id', id);

  if (error) {
    showMsg('❌ خطأ في الحفظ: ' + error.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✔ حفظ التعديل'; }
    return;
  }

  showMsg('✅ تم تحديث الفئة بنجاح!');
  document.getElementById('cat-quick-modal')?.remove();
  loadCategories(); // Refresh the list
};



// ══════════════════════════════════════════════════════
//  CATEGORIES — EVENT BINDING (via delegation)
// ══════════════════════════════════════════════════════
document.addEventListener('click', async function(e) {

  // ── Parent type change → show/hide parent row ──
  if (e.target && e.target.id === 'cat-type') {
    const v = e.target.value;
    const pRow = document.getElementById('cat-parent-row');
    if (pRow) pRow.style.display = v === 'sub' ? 'block' : 'none';
  }

  // ── Auto-generate code when parent selected ──
  if (e.target && e.target.id === 'cat-parent-id') {
    const parentId = e.target.value;
    const editId   = document.getElementById('cat-edit-id')?.value;
    if (!editId && parentId) {
      const code = await generateCategoryCode(parentId, false);
      const catCode = document.getElementById('cat-code');
      if (catCode && !catCode.value) catCode.value = code;
    }
  }

  // ── CANCEL CATEGORY ──
  if (e.target && e.target.id === 'btn-cancel-category') {
    resetCategoryForm();
  }

  // ── SAVE CATEGORY ──
  if (e.target && e.target.id === 'btn-save-category') {
    await saveCategoryHandler();
  }

  // ── CANCEL PRODUCT ──
  if (e.target && e.target.id === 'btn-cancel-product') {
    resetProductForm();
  }

  // ── SAVE PRODUCT ──
  if (e.target && e.target.id === 'btn-save-product') {
    await saveProductHandler();
  }

  // ── SAVE WAREHOUSE ──
  if (e.target && e.target.id === 'btn-save-warehouse') {
    await saveWarehouseHandler();
  }

  // ── SAVE CUSTOMER ──
  if (e.target && e.target.id === 'btn-save-customer') {
    await saveCustomerHandler();
  }

  // ── SAVE SUPPLIER ──
  if (e.target && e.target.id === 'btn-save-supplier') {
    await saveSupplierHandler();
  }

  // ── CLEAR DEF SEARCH ──
  if (e.target && e.target.id === 'btn-clear-def-search') {
    resetProductForm();
    e.target.style.display = 'none';
  }
});

// Auto-generate category code on type change
document.addEventListener('change', async function(e) {
  if (e.target && e.target.id === 'cat-type') {
    const val = e.target.value;
    const pRow = document.getElementById('cat-parent-row');
    if (pRow) pRow.style.display = val === 'sub' ? 'block' : 'none';

    // Auto code for main
    if (val === 'main') {
      const codeEl = document.getElementById('cat-code');
      const editId = document.getElementById('cat-edit-id')?.value;
      if (codeEl && !editId) {
        const code = await generateCategoryCode(null, true);
        codeEl.value = code;
      }
    }
  }

  // When category is selected on product form → auto-generate product code
  if (e.target && e.target.id === 'prod-sub-cat') {
    const catId = e.target.value;
    const editId = document.getElementById('prod-edit-id')?.value;
    if (catId && !editId) {
      const codeEl = document.getElementById('prod-code');
      if (codeEl) {
        codeEl.value = '⏳ جاري التوليد...';
        const newCode = await generateProductCode(catId);
        codeEl.value = newCode;
      }
    }
  }
});

function resetCategoryForm() {
  const title = document.getElementById('form-title-category');
  if (title) title.innerHTML = '➕ إضافة / تعديل فئة';

  const fields = ['cat-edit-id','cat-code','cat-name-ar','cat-name-en'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const typeEl = document.getElementById('cat-type');
  if (typeEl) typeEl.value = 'main';
  const pRow = document.getElementById('cat-parent-row');
  if (pRow) pRow.style.display = 'none';
  const pSel = document.getElementById('cat-parent-id');
  if (pSel) pSel.value = '';
  const btnSave = document.getElementById('btn-save-category');
  if (btnSave) btnSave.textContent = '✔ حفظ الفئة';
  const btnCancel = document.getElementById('btn-cancel-category');
  if (btnCancel) btnCancel.style.display = 'none';
}

async function saveCategoryHandler() {
  const editId = document.getElementById('cat-edit-id')?.value;
  const code   = document.getElementById('cat-code')?.value.trim() || null;
  const nameAr = document.getElementById('cat-name-ar')?.value.trim();
  const nameEn = document.getElementById('cat-name-en')?.value.trim();
  const type   = document.getElementById('cat-type')?.value;
  const parentId = (type === 'sub') ? document.getElementById('cat-parent-id')?.value : null;

  if (!nameAr) return showMsg('يرجى إدخال اسم الفئة بالعربي', 'error');
  if (type === 'sub' && !parentId) return showMsg('يرجى اختيار الفئة الأصل للفرعية', 'error');

  // Auto-generate code if empty
  let finalCode = code;
  if (!finalCode && !editId) {
    finalCode = await generateCategoryCode(parentId, type !== 'sub');
  }

  const payload = {
    category_code: finalCode,
    name_ar: nameAr,
    name_en: nameEn,
    name: nameAr,
    level: type === 'main' ? 1 : 2,
    parent_id: parentId || null
  };

  let error;
  if (editId) {
    const res = await supabase.from('categories').update(payload).eq('id', editId);
    error = res.error;
  } else {
    // Check duplicates
    if (finalCode) {
      const { data: existing } = await supabase
        .from('categories').select('id').eq('category_code', finalCode).limit(1);
      if (existing && existing.length > 0) {
        return showMsg('كود الفئة موجود مسبقاً! يرجى مراجعة الكود.', 'error');
      }
    }
    const res = await supabase.from('categories').insert([payload]);
    error = res.error;
  }

  if (error) return showMsg('خطأ في الحفظ: ' + error.message, 'error');

  showMsg(editId ? '✅ تم تعديل الفئة بنجاح' : '✅ تمت إضافة الفئة بنجاح');
  resetCategoryForm();
  loadCategories();
  loadCategoriesForProducts();
  window.navigate('def-categories');
}


// ══════════════════════════════════════════════════════
//  PRODUCTS — TREE / LIST
// ══════════════════════════════════════════════════════
async function loadCategoriesForProducts() {
  const sel = document.getElementById('prod-sub-cat');
  if (!sel) return;

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('category_code', { ascending: true });

  if (error || !data) return;
  categoriesCache = data;

  sel.innerHTML = '<option value="">-- اختر الفئة (طرفية فقط) --</option>';
  data.forEach(c => {
    const hasChildren = data.some(sub => sub.parent_id === c.id);
    const indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat((c.level || 1) - 1);
    if (hasChildren) {
      sel.innerHTML += `<option value="${c.id}" disabled style="font-weight:bold; color:var(--navy); background:#f2f6fb;">
        ${indent}📁 ${c.category_code || ''} - ${c.name_ar || c.name || ''}
      </option>`;
    } else {
      sel.innerHTML += `<option value="${c.id}" style="color:var(--excell-green); font-weight:bold;">
        ${indent}📌 ${c.category_code || ''} - ${c.name_ar || c.name || ''}
      </option>`;
    }
  });
}

async function loadProducts() {
  const tbody = document.getElementById('def-products-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">جاري التحميل...</td></tr>';

  const { data, error } = await supabase
    .from('products')
    .select('*, warehouses(name), categories(*)')
    .order('product_code', { ascending: true });

  if (error) { showMsg('خطأ في تحميل المنتجات', 'error'); return; }

  productsCache = data;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">لا توجد منتجات.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(p => {
    let catName = p.categories ? (p.categories.name_ar || p.categories.name || '-') : '-';
    if (p.categories && p.categories.parent_id) {
      const parentCat = categoriesCache.find(x => x.id === p.categories.parent_id);
      if (parentCat) catName = `${parentCat.name_ar || parentCat.name} › ${catName}`;
    }
    const unitsInfo = `${p.unit || '-'} (كرتونة: ${p.carton_quantity || 1}, محول: ${p.conversion_factor || 1})`;
    return `<tr>
      <td>${catName}</td>
      <td style="font-weight:bold; color:var(--excell-blue);">${p.product_code || '-'}</td>
      <td>
        <a href="#" onclick="window.openProductCard('${p.id}'); return false;" 
           style="color:var(--excell-blue); font-weight:600; text-decoration:underline dotted;">
          ${p.name || '-'}
        </a>
      </td>
      <td>${p.name_en || '-'}</td>
      <td>${p.brand || '-'}</td>
      <td>${unitsInfo}</td>
      <td>${p.reorder_level || 0}</td>
      <td>
        <button class="btn bt btn-sm" onclick="window.editProduct('${p.id}')" data-perm="products-edit">✏️ تعديل</button>
        <button class="btn bt btn-sm" style="background:var(--excell-blue); color:white;" onclick="window.openProductCard('${p.id}')">🪪 بطاقة</button>
      </td>
    </tr>`;
  }).join('');
}


// ══════════════════════════════════════════════════════
//  PRODUCT CARD MODAL
// ══════════════════════════════════════════════════════
window.openProductCard = function(productId) {
  const p = productsCache.find(x => x.id === productId);
  if (!p) return;

  // Remove existing modal
  document.getElementById('product-card-modal')?.remove();

  const cat = p.categories ? (p.categories.name_ar || p.categories.name || '-') : '-';
  let catFull = cat;
  if (p.categories && p.categories.parent_id) {
    const parentCat = categoriesCache.find(x => x.id === p.categories.parent_id);
    if (parentCat) catFull = `${parentCat.name_ar || parentCat.name} › ${cat}`;
  }

  const modal = document.createElement('div');
  modal.id = 'product-card-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
  `;

  modal.innerHTML = `
    <div style="
      background: white; border-radius: 16px; width: 800px; max-width: 95vw;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.3);
      animation: slideUp 0.3s ease;
    ">
      <!-- Header -->
      <div style="
        background: linear-gradient(135deg, var(--excell-blue, #1a6ab8), #0d4a85);
        color: white; padding: 20px 24px; border-radius: 16px 16px 0 0;
        display: flex; align-items: center; justify-content: space-between;
      ">
        <div>
          <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">🪪 بطاقة صنف</div>
          <div style="font-size: 20px; font-weight: 800;">${p.name || '-'}</div>
          <div style="font-size: 13px; opacity: 0.85; margin-top: 2px;">كود: ${p.product_code || '-'} &nbsp;|&nbsp; ${catFull}</div>
        </div>
        <button onclick="document.getElementById('product-card-modal').remove()" 
          style="background:rgba(255,255,255,0.2); border:none; color:white; 
                 width:36px; height:36px; border-radius:50%; font-size:18px; cursor:pointer;">✕</button>
      </div>

      <!-- Body -->
      <div style="padding: 24px;">
        <input type="hidden" id="pc-prod-id" value="${p.id}">

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          
          <div class="ff">
            <label style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.5px;">كود المنتج</label>
            <div style="font-size:24px; font-weight:900; color:var(--excell-blue,#1a6ab8); 
                        background:#f0f6ff; padding:10px 14px; border-radius:8px; margin-top:4px;">
              ${p.product_code || '-'}
            </div>
          </div>

          <div class="ff">
            <label style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.5px;">التصنيف</label>
            <div style="font-size:14px; color:#334155; background:#f8fafc; 
                        padding:10px 14px; border-radius:8px; margin-top:4px; border:1px solid #e2e8f0;">
              ${catFull}
            </div>
          </div>

          <div class="ff">
            <label>اسم المنتج *</label>
            <input type="text" id="pc-name" value="${(p.name || '').replace(/"/g, '&quot;')}" placeholder="اسم المنتج">
          </div>

          <div class="ff">
            <label>اسم المنتج (إنجليزي)</label>
            <input type="text" id="pc-name-en" value="${(p.name_en || '').replace(/"/g, '&quot;')}" placeholder="Product name in English">
          </div>

          <div class="ff">
            <label>الماركة / Brand</label>
            <input type="text" id="pc-brand" value="${(p.brand || '').replace(/"/g, '&quot;')}" placeholder="مثال: 3M">
          </div>

          <div class="ff">
            <label>الوحدة الأساسية *</label>
            <input type="text" id="pc-unit" value="${(p.unit || '').replace(/"/g, '&quot;')}" placeholder="مثال: حبة، كرتون، لتر">
          </div>

          <div class="ff">
            <label>كمية الكرتونة (Carton Qty)</label>
            <input type="number" id="pc-carton" value="${p.carton_quantity || 1}" min="1">
          </div>

          <div class="ff">
            <label>
              عامل التحويل 
              <span style="font-size:10px; color:#94a3b8;">(وحدة صغيرة → كبيرة)</span>
            </label>
            <input type="number" id="pc-conversion" value="${p.conversion_factor || 1}" min="1" step="0.001" placeholder="مثال: 12 (12 حبة = 1 كرتون)">
          </div>

          <div class="ff" style="display:none;">
            <label>رقم الباتش</label>
            <input type="text" id="pc-batch" value="${(p.batch_no || '').replace(/"/g, '&quot;')}">
          </div>

          <div class="ff" style="display:none;">
            <label>تاريخ الصلاحية</label>
            <input type="date" id="pc-expiry" value="${p.expiry_date || ''}">
          </div>

          <div class="ff">
            <label>حد إعادة الطلب (Reorder)</label>
            <input type="number" id="pc-reorder" value="${p.reorder_level || 0}" min="0">
          </div>

          <div class="ff">
            <label>المستودع الافتراضي</label>
            <select id="pc-def-wh">
              <option value="">-- بدون مستودع --</option>
              ${warehousesCache.map(w => `<option value="${w.id}" ${p.default_warehouse_id === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Required notice -->
        <div style="margin-top: 16px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 12px; color: #92400e;">
          ⚠️ الحقول المطلوبة: <strong>اسم المنتج + الوحدة</strong>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap;">
          <button onclick="window.saveProductCard()" 
            style="background: linear-gradient(135deg, #10b981, #059669); color:white; 
                   border:none; padding: 12px 28px; border-radius: 10px; font-size: 14px; 
                   font-weight: 700; cursor: pointer; flex: 1;">
            💾 حفظ التعديلات
          </button>
          <button onclick="document.getElementById('product-card-modal').remove()" 
            style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
                   padding: 12px 20px; border-radius: 10px; font-size: 14px; cursor: pointer;">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
};


window.saveProductCard = async function() {
  const productId = document.getElementById('pc-prod-id')?.value;
  if (!productId) return;

  const name     = document.getElementById('pc-name')?.value.trim();
  const nameEn   = document.getElementById('pc-name-en')?.value.trim();
  const brand    = document.getElementById('pc-brand')?.value.trim();
  const unit     = document.getElementById('pc-unit')?.value.trim();
  const carton   = document.getElementById('pc-carton')?.value || 1;
  const conv     = carton;
  const batch    = document.getElementById('pc-batch')?.value.trim();
  const expiry   = document.getElementById('pc-expiry')?.value || null;
  const reorder  = document.getElementById('pc-reorder')?.value || 0;
  const defWh    = document.getElementById('pc-def-wh')?.value || null;

  // Validation
  const errors = [];
  if (!name)   errors.push('اسم المنتج');
  if (!unit)   errors.push('الوحدة الأساسية');

  if (errors.length > 0) {
    return showMsg('❌ الحقول التالية مطلوبة: ' + errors.join('، '), 'error');
  }

  const payload = {
    name,
    name_en: nameEn || null,
    brand: brand || null,
    unit,
    carton_quantity: parseFloat(carton),
    conversion_factor: parseFloat(conv),
    batch_no: batch,
    expiry_date: expiry,
    reorder_level: parseFloat(reorder),
    default_warehouse_id: defWh
  };

  const { error } = await supabase.from('products').update(payload).eq('id', productId);

  if (error) {
    showMsg('❌ خطأ في الحفظ: ' + error.message, 'error');
  } else {
    showMsg('✅ تم حفظ بيانات المنتج بنجاح!');
    document.getElementById('product-card-modal')?.remove();
    loadProducts();
  }
};


// ══════════════════════════════════════════════════════
//  PRODUCTS — EDIT FORM (existing form in page)
// ══════════════════════════════════════════════════════
window.editProduct = function(id) {
  const p = productsCache.find(x => x.id === id);
  if (!p) return;

  const setVal = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.value = val !== null && val !== undefined ? val : '';
  };

  setVal('prod-edit-id',    p.id);
  setVal('prod-sub-cat',    p.category_id || '');
  setVal('prod-code',       p.product_code || '');
  setVal('prod-name',       p.name || '');
  setVal('prod-name-en',    p.name_en || '');
  setVal('prod-brand',      p.brand || '');
  setVal('prod-batch',      p.batch_no || '');
  setVal('prod-expiry',     p.expiry_date || '');
  setVal('prod-unit',       p.unit || '');
  setVal('prod-carton-qty', p.carton_quantity || 1);
  setVal('prod-conversion', p.conversion_factor || 1);
  setVal('prod-reorder',    p.reorder_level || 0);
  setVal('prod-def-wh',     p.default_warehouse_id || '');

  const btnSave = document.getElementById('btn-save-product');
  if (btnSave) btnSave.textContent = '✔ تحديث المنتج';
  const btnCancel = document.getElementById('btn-cancel-product');
  if (btnCancel) btnCancel.style.display = 'inline-block';

  const title = document.getElementById('form-title-product');
  if (title) title.innerHTML = '✏️ تعديل بيانات المنتج';
  window.navigate('def-products-form');
};

function resetProductForm() {
  const title = document.getElementById('form-title-product');
  if (title) title.innerHTML = '➕ إضافة / تعديل منتج';

  const fields = ['prod-edit-id','prod-sub-cat','prod-code','prod-name','prod-name-en',
                  'prod-brand','prod-batch','prod-expiry','prod-unit','prod-reorder','prod-def-wh'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'prod-sub-cat' || id === 'prod-def-wh' ? '' : '';
  });
  const cartonEl = document.getElementById('prod-carton-qty');
  if (cartonEl) cartonEl.value = '1';
  const convEl = document.getElementById('prod-conversion');
  if (convEl) convEl.value = '1';
  const reorderEl = document.getElementById('prod-reorder');
  if (reorderEl) reorderEl.value = '0';

  const btnSave = document.getElementById('btn-save-product');
  if (btnSave) btnSave.textContent = '✔ حفظ المنتج';
  const btnCancel = document.getElementById('btn-cancel-product');
  if (btnCancel) btnCancel.style.display = 'none';

  // Clear search box
  const searchWrap = document.getElementById('def-prod-search-wrap');
  if (searchWrap) {
    const inp = searchWrap.querySelector('.p-search');
    if (inp) inp.value = '';
    const hidden = searchWrap.querySelector('.p-select');
    if (hidden) hidden.value = '';
  }
  const clearBtn = document.getElementById('btn-clear-def-search');
  if (clearBtn) clearBtn.style.display = 'none';
}

async function saveProductHandler() {
  const editId    = document.getElementById('prod-edit-id')?.value;
  const code      = document.getElementById('prod-code')?.value.trim();
  const name      = document.getElementById('prod-name')?.value.trim();
  const nameEn    = document.getElementById('prod-name-en')?.value.trim();
  const subCatId  = document.getElementById('prod-sub-cat')?.value;
  const brand     = document.getElementById('prod-brand')?.value.trim();
  const batch     = document.getElementById('prod-batch')?.value.trim();
  const expiry    = document.getElementById('prod-expiry')?.value || null;
  const unit      = document.getElementById('prod-unit')?.value.trim();
  const cartonQty = document.getElementById('prod-carton-qty')?.value || 1;
  const convFactor = cartonQty;
  const reorder   = document.getElementById('prod-reorder')?.value || 0;
  const defWh     = document.getElementById('prod-def-wh')?.value || null;

  // ── Validation ──
  const errors = [];
  if (!subCatId) errors.push('الفئة');
  if (!name)     errors.push('اسم المنتج');
  if (!unit)     errors.push('الوحدة');

  if (errors.length > 0) {
    return showMsg('❌ يرجى تعبئة: ' + errors.join('، '), 'error');
  }

  // Use provided code or auto-generate
  let finalCode = code;
  if (!finalCode && !editId) {
    finalCode = await generateProductCode(subCatId);
  }

  if (!finalCode) return showMsg('❌ تعذر توليد كود المنتج', 'error');

  // Check duplicate code (for new only)
  if (!editId) {
    if (productsCache.some(p => p.product_code === finalCode)) {
      return showMsg('❌ كود المنتج موجود مسبقاً!', 'error');
    }
  }

  const payload = {
    category_id: subCatId,
    product_code: finalCode,
    name,
    name_en: nameEn || null,
    brand: brand || null,
    batch_no: batch,
    expiry_date: expiry,
    unit,
    carton_quantity: parseFloat(cartonQty),
    conversion_factor: parseFloat(convFactor),
    reorder_level: parseFloat(reorder),
    default_warehouse_id: defWh
  };

  let error;
  if (editId) {
    const res = await supabase.from('products').update(payload).eq('id', editId);
    error = res.error;
  } else {
    const res = await supabase.from('products').insert([payload]);
    error = res.error;
  }

  if (error) {
    if (error.code === '23505') showMsg('❌ كود المنتج موجود مسبقاً بقاعدة البيانات!', 'error');
    else showMsg('❌ خطأ في العملية: ' + error.message, 'error');
  } else {
    showMsg(editId ? '✅ تم تحديث المنتج بنجاح' : '✅ تم إضافة المنتج بنجاح');
    resetProductForm();
    loadProducts();
    window.navigate('def-products');
  }
}


// ══════════════════════════════════════════════════════
//  WAREHOUSES HANDLER
// ══════════════════════════════════════════════════════
async function saveWarehouseHandler() {
  const name = document.getElementById('wh-name')?.value.trim();
  const loc  = document.getElementById('wh-loc')?.value.trim();

  if (!name) return showMsg('يرجى إدخال اسم المستودع', 'error');

  const { error } = await supabase.from('warehouses').insert([{ name, location: loc }]);
  if (error) {
    showMsg('خطأ في الإضافة: ' + error.message, 'error');
  } else {
    showMsg('✅ تم إضافة المستودع بنجاح');
    const nameEl = document.getElementById('wh-name');
    const locEl  = document.getElementById('wh-loc');
    if (nameEl) nameEl.value = '';
    if (locEl)  locEl.value  = '';
    loadWarehouses();
    window.navigate('def-warehouses');
  }
}


// ══════════════════════════════════════════════════════
//  CUSTOMERS
// ══════════════════════════════════════════════════════
async function loadCustomers() {
  const tbody = document.getElementById('def-customers-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';

  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if (error) { showMsg('خطأ في تحميل العملاء', 'error'); return; }

  customersCache = data;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا يوجد عملاء.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(c => `<tr>
    <td>${c.name}</td>
    <td>${c.contact_info || '-'}</td>
    <td>${new Date(c.created_at).toLocaleDateString('ar-SA')}</td>
  </tr>`).join('');
}

async function saveCustomerHandler() {
  const name = document.getElementById('cust-name')?.value.trim();
  const info = document.getElementById('cust-info')?.value.trim();

  if (!name) return showMsg('يرجى إدخال اسم العميل', 'error');

  const { error } = await supabase.from('customers').insert([{ name, contact_info: info }]);
  if (error) {
    showMsg('خطأ في الإضافة: ' + error.message, 'error');
  } else {
    showMsg('✅ تم إضافة العميل بنجاح');
    const nameEl = document.getElementById('cust-name');
    const infoEl = document.getElementById('cust-info');
    if (nameEl) nameEl.value = '';
    if (infoEl) infoEl.value = '';
    loadCustomers();
    window.navigate('def-customers');
  }
}


// ══════════════════════════════════════════════════════
//  SUPPLIERS
// ══════════════════════════════════════════════════════
async function loadSuppliers() {
  const tbody = document.getElementById('def-suppliers-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';

  const { data, error } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
  if (error) { showMsg('خطأ في تحميل الموردين', 'error'); return; }

  suppliersCache = data;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا يوجد موردين.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(s => `<tr>
    <td>${s.name}</td>
    <td>${s.contact_info || '-'}</td>
    <td>${new Date(s.created_at).toLocaleDateString('ar-SA')}</td>
  </tr>`).join('');
}

async function saveSupplierHandler() {
  const name = document.getElementById('supp-name')?.value.trim();
  const info = document.getElementById('supp-info')?.value.trim();

  if (!name) return showMsg('يرجى إدخال اسم المورد', 'error');

  const { error } = await supabase.from('suppliers').insert([{ name, contact_info: info }]);
  if (error) {
    showMsg('خطأ في الإضافة: ' + error.message, 'error');
  } else {
    showMsg('✅ تم إضافة المورد بنجاح');
    const nameEl = document.getElementById('supp-name');
    const infoEl = document.getElementById('supp-info');
    if (nameEl) nameEl.value = '';
    if (infoEl) infoEl.value = '';
    loadSuppliers();
    window.navigate('def-suppliers');
  }
}


// ══════════════════════════════════════════════════════
//  CSS for Product Card Animation
// ══════════════════════════════════════════════════════
(function injectModalStyles() {
  if (document.getElementById('product-card-styles')) return;
  const style = document.createElement('style');
  style.id = 'product-card-styles';
  style.textContent = `
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes slideUp { from { transform: translateY(30px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  `;
  document.head.appendChild(style);
})();
