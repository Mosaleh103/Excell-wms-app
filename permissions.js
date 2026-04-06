// ══════════════════════════════════════════════
// permissions.js — Permission Engine v1.0
// Rahlat Al Emtiyaz CRM
// ══════════════════════════════════════════════

// ── Cached permissions (loaded once at login) ──
// Shape: { module: { view, create, edit, delete } }

// ── Roles hierarchy ──
const ROLE_LEVELS = {
  super_admin: 5,
  admin:       4,
  manager:     3,
  supervisor:  2,
  sales:       1
};

// ── Role Arabic labels ──
const ROLE_LABELS = {
  super_admin: 'مالك النظام',
  admin:       'مدير الشركة',
  manager:     'مدير المبيعات',
  supervisor:  'مشرف فريق',
  sales:       'مندوب'
};

// ── Role badge colors ──
const ROLE_COLORS = {
  super_admin: 'bg-purple',
  admin:       'bg-blue',
  manager:     'bg-teal',
  supervisor:  'bg-amber',
  sales:       'bg-green'
};

// ══════════════════════════════════════════════
// LOAD — called once at initApp()
// ══════════════════════════════════════════════
async function loadPermissions() {
  PERMS = {};

  // super_admin → full access, skip DB
  if (CP.role === 'super_admin') {
    const modules = ['dashboard','visits','plan','customers','products','reports','users','setup'];
    modules.forEach(m => {
      PERMS[m] = { view: true, create: true, edit: true, delete: true };
    });
    return;
  }

  const { data, error } = await sb
    .from('user_permissions')
    .select('module, can_view, can_create, can_edit, can_delete')
    .eq('user_id', CU.id);

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

// ══════════════════════════════════════════════
// CHECK — core permission function
// ══════════════════════════════════════════════

/**
 * checkPerm('customers', 'edit') → true/false
 * super_admin always returns true (handled in loadPermissions)
 */
function checkPerm(module, action) {
  if (!PERMS[module]) return false;
  return PERMS[module][action] === true;
}

// Shortcuts
const canView   = m => checkPerm(m, 'view');
const canCreate = m => checkPerm(m, 'create');
const canEdit   = m => checkPerm(m, 'edit');
const canDelete = m => checkPerm(m, 'delete');

// ══════════════════════════════════════════════
// GUARD — block unauthorized actions
// ══════════════════════════════════════════════

/**
 * guardPerm('customers', 'delete', () => deleteCustomer(id))
 * Runs fn only if permitted, otherwise shows error toast
 */
function guardPerm(module, action, fn) {
  if (!checkPerm(module, action)) {
    st('ليس لديك صلاحية لهذه العملية', 'error');
    return false;
  }
  return fn();
}

// ══════════════════════════════════════════════
// UI HELPERS — show/hide elements by permission
// ══════════════════════════════════════════════

/**
 * Apply permissions to a page after render
 * Usage: applyPagePerms('customers')
 */
function applyPagePerms(module) {
  const p = PERMS[module] || {};

  // Hide create buttons
  if (!p.create) {
    document.querySelectorAll(`[data-perm="${module}-create"]`)
      .forEach(el => el.style.display = 'none');
  }

  // Hide edit buttons
  if (!p.edit) {
    document.querySelectorAll(`[data-perm="${module}-edit"]`)
      .forEach(el => el.style.display = 'none');
  }

  // Hide delete buttons
  if (!p.delete) {
    document.querySelectorAll(`[data-perm="${module}-delete"]`)
      .forEach(el => el.style.display = 'none');
  }
}

/**
 * Hide a button/element if no permission
 * Usage: permShow('btn-add-customer', 'customers', 'create')
 */
function permShow(elId, module, action) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = checkPerm(module, action) ? '' : 'none';
}

// ══════════════════════════════════════════════
// RECORD STATUS HELPERS
// ══════════════════════════════════════════════

/**
 * Can user edit this record based on status + role?
 */
function canEditRecord(record, module) {
  if (!checkPerm(module, 'edit')) return false;
  const status = record?.status || 'submitted';

  if (CP.role === 'super_admin' || CP.role === 'admin') return true;
  if (status === 'approved') return false;
  if (status === 'submitted' && CP.role === 'sales') return false;
  return true;
}

/**
 * Status Arabic label + badge class
 */
function statusBadge(status) {
  const map = {
    draft:     { label: 'مسودة',   cls: 'bg-amber' },
    submitted: { label: 'مرسل',    cls: 'bg-blue'  },
    approved:  { label: 'معتمد',   cls: 'bg-green' }
  };
  const s = map[status] || map.submitted;
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

// ══════════════════════════════════════════════
// DATA SCOPE — filter queries by role
// ══════════════════════════════════════════════

/**
 * Returns Supabase query modifier based on role
 * Usage:
 *   let q = sb.from('daily_visits').select('*');
 *   q = applyScopeFilter(q);
 */
function applyScopeFilter(query) {
  switch (CP.role) {
    case 'super_admin':
    case 'admin':
      return query; // see everything

    case 'manager':
      return query; // see all company data

    case 'supervisor':
      return query.eq('team_id', CP.team_id || 'none');

    case 'sales':
      return query.eq('created_by', CU.id);

    default:
      return query.eq('created_by', CU.id);
  }
}

// ══════════════════════════════════════════════
// AUDIT LOG HELPER
// ══════════════════════════════════════════════

/**
 * logAction('INSERT', 'customers', recordId)
 */
async function logAction(action, module, recordId = null) {
  try {
    await sb.from('audit_log').insert({
      user_id:   CU.id,
      action:    action,
      module:    module,
      record_id: recordId ? String(recordId) : null,
      table_name: module
    });
  } catch (e) {
    console.warn('logAction failed:', e.message);
  }
}

// ══════════════════════════════════════════════
// MENU FILTER — returns visible pages by perms
// ══════════════════════════════════════════════
function getVisibleModules() {
  return Object.keys(PERMS).filter(m => PERMS[m].view);
}

function isModuleVisible(module) {
  return canView(module);
}
