// ══════════════════════════════════════════════
// wms_permissions.js — Web WMS Permission Engine
// ══════════════════════════════════════════════

let PERMS = {};

const MODULE_LABELS = {
  dashboard: 'لوحة التحكم',
  categories: 'الفئات والتصنيفات',
  products: 'المنتجات',
  warehouses: 'المستودعات',
  customers: 'العملاء',
  suppliers: 'الموردين',
  opening: 'رصيد أول المدة',
  receipt: 'استلام بضاعة (IN)',
  issue: 'صرف بضاعة (OUT)',
  transfer: 'تحويل مخزني',
  report_balance: 'أرصدة المخزون',
  users: 'المستخدمين',
  permissions: 'الصلاحيات'
};

const roleDefaults = {
  admin: {
    canManageUsers: true,
    canPost: true,
    canDelete: true
  },
  accountant: {
    canManageUsers: false,
    canPost: true,
    canDelete: false
  },
  user: {
    canManageUsers: false,
    canPost: false,
    canDelete: false
  }
};

window.getUserPermissions = function(user) {
  let perms = roleDefaults[user.role] || roleDefaults.user;

  // Merge with granular DB permissions if available
  // In our system, granular perms are stored in the global PERMS object after loading
  const granular = user.permissions || {};
  
  return { ...perms, ...granular };
};

// ── Load Permissions on Login ──
async function loadPermissions() {
  PERMS = {};
  if (!window.CU || !window.CP) return;

  const { data, error } = await supabase
    .from('user_permissions')
    .select('module, can_view, can_create, can_edit, can_delete')
    .eq('user_id', window.CU.id);

  if (error) {
    console.error('loadPermissions error:', error.message);
    return;
  }

  (data || []).forEach(row => {
    PERMS[row.module] = {
      view:   row.can_view,
      create: row.can_create,
      edit:   row.can_edit,
      delete: row.can_delete
    };
  });
}

// ── Core Checking Functions ──
function checkPerm(module, action) {
  if (!window.CP) return false;
  
  // 1. Super Admin / Admin Bypass
  if (window.CP.role === 'admin' || window.CP.role === 'super_admin') return true;

  // 2. Matrix Override (High Priority)
  // If a specific permission exists in the DB for this user/module/action, it wins.
  if (PERMS[module] && PERMS[module][action] !== undefined) {
    return PERMS[module][action] === true;
  }

  // 3. Role Defaults (Fallback)
  const defaults = roleDefaults[window.CP.role] || roleDefaults.user;
  
  if (module === 'users' || module === 'permissions') {
    return defaults.canManageUsers;
  }

  if (action === 'create' || action === 'edit') return defaults.canPost;
  if (action === 'delete') return defaults.canDelete;
  if (action === 'view') return true; // Default viewable if logged in
  
  return false;
}

window.canView   = m => checkPerm(m, 'view');
window.canCreate = m => checkPerm(m, 'create');
window.canEdit   = m => checkPerm(m, 'edit');
window.canDelete = m => checkPerm(m, 'delete');

// ── UI Visibility Applier ──
window.applyPagePerms = function(module) {
  const canC = window.canCreate(module);
  const canE = window.canEdit(module);
  const canD = window.canDelete(module);
  
  document.querySelectorAll(`[data-perm="${module}-create"]`).forEach(el => el.style.display = canC ? '' : 'none');
  document.querySelectorAll(`[data-perm="${module}-edit"]`).forEach(el => el.style.display = canE ? '' : 'none');
  document.querySelectorAll(`[data-perm="${module}-delete"]`).forEach(el => el.style.display = canD ? '' : 'none');
};

// ══════════════════════════════════════════════
// ── MATRIX UI LOGIC (page-permissions) ──
// ══════════════════════════════════════════════

window.init_page_permissions = async function() {
  const userSelect = document.getElementById('matrix-user-select');
  if (!userSelect) return;
  userSelect.innerHTML = '<option value="">⏳ جاري تحميل المستخدمين...</option>';

  // Use select('*') to avoid column-not-found errors regardless of schema
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (error) {
    const errMsg = error.message || JSON.stringify(error);
    showMsg('❌ خطأ: ' + errMsg, 'error');
    userSelect.innerHTML = `<option value="">❌ ${errMsg}</option>`;
    console.error('[Permissions] Profiles error:', error);
    return;
  }

  if (!data || data.length === 0) {
    userSelect.innerHTML = '<option value="">⚠️ لا يوجد مستخدمون في جدول profiles</option>';
    return;
  }

  userSelect.innerHTML = '<option value="">-- اختر مستخدماً لضبط صلاحياته --</option>';
  data.forEach(u => {
    const label = u.full_name || u.username || u.id;
    let roleLabel = u.role || 'user';
    if (u.role === 'admin') roleLabel = '🔴 مدير نظام';
    else if (u.role === 'accountant') roleLabel = '🟡 محاسب';
    else if (u.role === 'warehouse_keeper') roleLabel = 'أمين مستودع';
    else if (u.role === 'user') roleLabel = '⚪ مستخدم';
    
    userSelect.innerHTML += `<option value="${u.id}">${label} (${roleLabel})</option>`;
  });

  // Reset matrix body
  const tbody = document.getElementById('matrix-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">🔍 يرجى اختيار مستخدم أولاً من القائمة أعلاه</td></tr>';
  const btnSave = document.getElementById('btn-save-matrix');
  if (btnSave) btnSave.style.display = 'none';
};


// ⚡ Router uses init_permissions (without 'page_' prefix) — provide alias
window.init_permissions = window.init_page_permissions;


// Event delegation for permissions page (works with Router SPA)
document.addEventListener('change', async function(e) {
  if (e.target && e.target.id === 'matrix-user-select') {
    await loadMatrixForUser(e.target.value);
  }
});

document.addEventListener('click', async function(e) {
  if (e.target && e.target.id === 'btn-save-matrix') {
    await saveMatrixPermissions();
  }
});

async function loadMatrixForUser(uid) {
  const tbody = document.getElementById('matrix-body');
  const btnSave = document.getElementById('btn-save-matrix');

  if (!uid) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">🔍 يرجى اختيار مستخدم أولاً</td></tr>';
    if (btnSave) btnSave.style.display = 'none';
    return;
  }

  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">⏳ جاري تحميل الصلاحيات...</td></tr>';

  const { data, error } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('user_id', uid);

  if (error) { showMsg('خطأ في تحميل الصلاحيات: ' + error.message, 'error'); return; }

  let rowsHtml = '';
  Object.keys(MODULE_LABELS).forEach(m => {
    const row = (data || []).find(x => x.module === m) || {
      can_view: false, can_create: false, can_edit: false, can_delete: false
    };
    const isViewOnly = m === 'dashboard' || m === 'report_balance';

    rowsHtml += `
      <tr data-module="${m}" style="border-bottom: 1px solid #f1f5f9;">
        <td style="font-weight:600; padding: 10px 14px; color:#1e2d40;">${MODULE_LABELS[m]}</td>
        <td style="text-align:center;"><input type="checkbox" class="p-view" ${row.can_view ? 'checked' : ''} style="width:16px;height:16px;accent-color:#3b82f6;cursor:pointer;"></td>
        <td style="text-align:center;">${isViewOnly
          ? '<span style="color:#d1d5db; font-size:18px;">—</span><input type="hidden" class="p-create" value="false">'
          : `<input type="checkbox" class="p-create" ${row.can_create ? 'checked' : ''} style="width:16px;height:16px;accent-color:#10b981;cursor:pointer;">`
        }</td>
        <td style="text-align:center;">${isViewOnly
          ? '<span style="color:#d1d5db; font-size:18px;">—</span><input type="hidden" class="p-edit" value="false">'
          : `<input type="checkbox" class="p-edit" ${row.can_edit ? 'checked' : ''} style="width:16px;height:16px;accent-color:#f59e0b;cursor:pointer;">`
        }</td>
        <td style="text-align:center;">${isViewOnly
          ? '<span style="color:#d1d5db; font-size:18px;">—</span><input type="hidden" class="p-delete" value="false">'
          : `<input type="checkbox" class="p-delete" ${row.can_delete ? 'checked' : ''} style="width:16px;height:16px;accent-color:#ef4444;cursor:pointer;">`
        }</td>
      </tr>`;
  });

  if (tbody) tbody.innerHTML = rowsHtml;
  if (btnSave) btnSave.style.display = 'inline-block';
}

async function saveMatrixPermissions() {
  const uid = document.getElementById('matrix-user-select')?.value;
  if (!uid) return showMsg('يرجى اختيار مستخدم أولاً', 'error');

  const trs = document.querySelectorAll('#matrix-body tr');
  const updates = [];

  trs.forEach(tr => {
    const m = tr.getAttribute('data-module');
    if (!m) return;
    const v = tr.querySelector('.p-view')?.checked || false;
    const c = tr.querySelector('.p-create')?.checked || false;
    const ed = tr.querySelector('.p-edit')?.checked || false;
    const d = tr.querySelector('.p-delete')?.checked || false;

    updates.push({
      user_id: uid,
      module: m,
      can_view: v,
      can_create: c,
      can_edit: ed,
      can_delete: d
    });
  });

  if (updates.length === 0) return showMsg('لا توجد بيانات للحفظ', 'error');

  const { error } = await supabase
    .from('user_permissions')
    .upsert(updates, { onConflict: 'user_id,module' });

  if (error) showMsg('❌ خطأ في حفظ الصلاحيات: ' + error.message, 'error');
  else showMsg('✅ تم حفظ الصلاحيات للمستخدم بنجاح!');
}
