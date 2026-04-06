// ══════════════════════════════════════════════════════
// permissions-ui.js — v2.0 (inline styles, no CSS deps)
// ══════════════════════════════════════════════════════

const MODULES_DEF = [
  { key:'dashboard', label:'لوحة التحكم',   icon:'📊' },
  { key:'visits',    label:'الزيارات',       icon:'📍' },
  { key:'plan',      label:'الخطة الشهرية', icon:'📅' },
  { key:'customers', label:'العملاء',        icon:'👥' },
  { key:'products',  label:'المنتجات',       icon:'📦' },
  { key:'reports',   label:'التقارير',       icon:'📈' },
  { key:'users',     label:'المستخدمون',     icon:'🔑' },
  { key:'setup',     label:'الإعدادات',      icon:'⚙️'  },
];

const ACTIONS = [
  { key:'can_view',   label:'عرض',   color:'#3b82f6' },
  { key:'can_create', label:'إضافة', color:'#10b981' },
  { key:'can_edit',   label:'تعديل', color:'#f59e0b' },
  { key:'can_delete', label:'حذف',   color:'#ef4444' },
];

const ROLE_LABELS_P = { admin:'مدير الشركة', manager:'مدير المبيعات', supervisor:'مشرف فريق', sales:'مندوب' };
const ROLE_COLORS_P = { admin:'#1a6ab8', manager:'#06b6d4', supervisor:'#f59e0b', sales:'#10b981' };

let permState = {};
let permUsers = [];
let selectedUserId = null;

// ══════════════════════════════════════════════════════
// LOAD
// ══════════════════════════════════════════════════════
async function loadPermissionsUI() {
  const container = document.getElementById('perm-container');
  if (!container) { console.error('perm-container not found'); return; }

  container.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;font-size:14px;">⏳ جاري تحميل الصلاحيات...</div>';

  const [{ data: users, error: e1 }, { data: perms, error: e2 }] = await Promise.all([
    sb.from('profiles').select('id,fullname,role').order('fullname'),
    sb.from('user_permissions').select('*')
  ]);

  if (e1) { container.innerHTML = `<div style="padding:40px;color:red;">خطأ: ${e1.message}</div>`; return; }
  if (e2) { container.innerHTML = `<div style="padding:40px;color:red;">خطأ: ${e2.message}</div>`; return; }

  permUsers = (users||[]).filter(u => u.role !== 'super_admin');

  permState = {};
  permUsers.forEach(u => {
    permState[u.id] = {};
    MODULES_DEF.forEach(m => {
      permState[u.id][m.key] = { can_view:false, can_create:false, can_edit:false, can_delete:false };
    });
  });
  (perms||[]).forEach(p => {
    if (permState[p.user_id]?.[p.module] !== undefined) {
      permState[p.user_id][p.module] = {
        can_view:   !!p.can_view,
        can_create: !!p.can_create,
        can_edit:   !!p.can_edit,
        can_delete: !!p.can_delete,
      };
    }
  });

  selectedUserId = permUsers[0]?.id || null;
  renderPermUI();
}

// ══════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════
function renderPermUI() {
  const container = document.getElementById('perm-container');
  if (!container) return;

  const sidebar = permUsers.map(u => `
    <div id="pui-${u.id}" onclick="permSelectUser('${u.id}')"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;
             border-bottom:1px solid #dde6f0;transition:background .15s;
             ${u.id===selectedUserId ? 'background:#eef2ff;border-right:3px solid #6366f1;' : 'background:white;'}">
      <div style="width:34px;height:34px;border-radius:50%;
                  background:${ROLE_COLORS_P[u.role]||'#10b981'};
                  display:flex;align-items:center;justify-content:center;
                  color:white;font-weight:700;font-size:14px;flex-shrink:0;">
        ${u.fullname.charAt(0)}
      </div>
      <div>
        <div style="font-weight:600;font-size:13px;color:#1e2d40;">${u.fullname}</div>
        <div style="font-size:11px;color:#64748b;margin-top:1px;">${ROLE_LABELS_P[u.role]||u.role}</div>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div style="display:flex;min-height:520px;border-top:1px solid #dde6f0;">
      <div style="width:250px;flex-shrink:0;border-left:1px solid #dde6f0;">
        <div style="padding:10px 14px;border-bottom:1px solid #dde6f0;
                    font-weight:700;font-size:13px;background:#f8fafc;color:#1e2d40;">
          👤 المستخدمون (${permUsers.length})
        </div>
        <div style="overflow-y:auto;max-height:520px;">${sidebar}</div>
      </div>
      <div id="perm-matrix-area" style="flex:1;padding:16px;overflow-x:auto;background:white;">
        ${selectedUserId ? buildMatrix() : '<div style="padding:40px;text-align:center;color:#64748b;">اختر مستخدماً</div>'}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════
// BUILD MATRIX
// ══════════════════════════════════════════════════════
function buildMatrix() {
  const user = permUsers.find(u => u.id === selectedUserId);
  if (!user) return '<div style="padding:40px;text-align:center;color:#64748b;">مستخدم غير موجود</div>';
  const uPerms = permState[selectedUserId] || {};

  const rows = MODULES_DEF.map(m => {
    const mp = uPerms[m.key] || {};
    const allOn = ACTIONS.every(a => mp[a.key]);

    const toggles = ACTIONS.map(a => {
      const on = !!mp[a.key];
      return `<td style="text-align:center;padding:10px 8px;">
        <div onclick="permOnChange('${selectedUserId}','${m.key}','${a.key}',!permState['${selectedUserId}']['${m.key}']['${a.key}'])"
          style="width:40px;height:22px;border-radius:11px;background:${on ? a.color : '#d1d5db'};
                 cursor:pointer;position:relative;transition:background .2s;margin:0 auto;"
          id="ptgl-${selectedUserId}-${m.key}-${a.key}">
          <span style="position:absolute;top:3px;${on ? 'right:3px;' : 'left:3px;'}
                       width:16px;height:16px;background:white;border-radius:50%;
                       transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.3);"
            id="pdot-${selectedUserId}-${m.key}-${a.key}"></span>
        </div>
      </td>`;
    }).join('');

    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 14px;font-size:13px;font-weight:500;white-space:nowrap;color:#1e2d40;">
        ${m.icon} ${m.label}
      </td>
      ${toggles}
      <td style="text-align:center;padding:10px 8px;">
        <input type="checkbox" ${allOn?'checked':''} id="pall-${m.key}"
          onchange="permToggleRow('${m.key}',this.checked)"
          style="width:16px;height:16px;cursor:pointer;accent-color:#7c3aed;">
      </td>
    </tr>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="background:${ROLE_COLORS_P[user.role]||'#10b981'};color:white;
                     padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;">
          ${ROLE_LABELS_P[user.role]||user.role}
        </span>
        <strong style="font-size:15px;color:#1e2d40;">${user.fullname}</strong>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn bp btn-sm" onclick="permApplyTemplate('${user.id}','${user.role}')">🔄 تطبيق الافتراضي</button>
        <button class="btn ba btn-sm" onclick="permCopyModal('${user.id}')">📋 نسخ من مستخدم</button>
        <button class="btn bg" onclick="permSave('${user.id}')">💾 حفظ التغييرات</button>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:right;padding:10px 14px;font-weight:700;
                     border-bottom:2px solid #dde6f0;min-width:140px;color:#1e2d40;">الوحدة</th>
          ${ACTIONS.map(a => `
            <th style="text-align:center;padding:8px;min-width:70px;
                       border-bottom:2px solid #dde6f0;">
              <div style="color:${a.color};font-weight:700;">${a.label}</div>
              <button onclick="permToggleCol('${a.key}')"
                style="font-size:10px;padding:2px 6px;border:1px solid #dde6f0;
                       border-radius:4px;background:transparent;color:#64748b;
                       cursor:pointer;margin-top:4px;">الكل</button>
            </th>`).join('')}
          <th style="text-align:center;padding:8px;min-width:60px;
                     border-bottom:2px solid #dde6f0;font-weight:700;color:#7c3aed;">الكل</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════
// INTERACTIONS
// ══════════════════════════════════════════════════════
function permSelectUser(userId) {
  selectedUserId = userId;
  permUsers.forEach(u => {
    const el = document.getElementById('pui-' + u.id);
    if (!el) return;
    el.style.background   = u.id===userId ? '#eef2ff' : 'white';
    el.style.borderRight  = u.id===userId ? '3px solid #6366f1' : '';
  });
  const area = document.getElementById('perm-matrix-area');
  if (area) area.innerHTML = buildMatrix();
}

function permOnChange(userId, module, action, value) {
  if (!permState[userId]?.[module]) return;
  permState[userId][module][action] = value;

  // Update toggle visual
  const tgl = document.getElementById(`ptgl-${userId}-${module}-${action}`);
  const dot = document.getElementById(`pdot-${userId}-${module}-${action}`);
  const color = ACTIONS.find(a=>a.key===action)?.color || '#3b82f6';
  if (tgl) tgl.style.background = value ? color : '#d1d5db';
  if (dot) { dot.style.right = value ? '3px' : ''; dot.style.left = value ? '' : '3px'; }

  // Auto-enable view
  if (value && action !== 'can_view') {
    permState[userId][module]['can_view'] = true;
    const vt = document.getElementById(`ptgl-${userId}-${module}-can_view`);
    const vd = document.getElementById(`pdot-${userId}-${module}-can_view`);
    if (vt) vt.style.background = '#3b82f6';
    if (vd) { vd.style.right = '3px'; vd.style.left = ''; }
  }

  // Update row "all" checkbox
  const allOn = ACTIONS.every(a => permState[userId][module][a.key]);
  const rowAll = document.getElementById(`pall-${module}`);
  if (rowAll) rowAll.checked = allOn;
}

function permToggleRow(module, checked) {
  ACTIONS.forEach(a => {
    permState[selectedUserId][module][a.key] = checked;
    const tgl = document.getElementById(`ptgl-${selectedUserId}-${module}-${a.key}`);
    const dot = document.getElementById(`pdot-${selectedUserId}-${module}-${a.key}`);
    if (tgl) tgl.style.background = checked ? a.color : '#d1d5db';
    if (dot) { dot.style.right = checked ? '3px' : ''; dot.style.left = checked ? '' : '3px'; }
  });
}

function permToggleCol(actionKey) {
  const allOn = MODULES_DEF.every(m => permState[selectedUserId]?.[m.key]?.[actionKey]);
  const newVal = !allOn;
  const color = ACTIONS.find(a=>a.key===actionKey)?.color || '#3b82f6';

  MODULES_DEF.forEach(m => {
    permState[selectedUserId][m.key][actionKey] = newVal;
    const tgl = document.getElementById(`ptgl-${selectedUserId}-${m.key}-${actionKey}`);
    const dot = document.getElementById(`pdot-${selectedUserId}-${m.key}-${actionKey}`);
    if (tgl) tgl.style.background = newVal ? color : '#d1d5db';
    if (dot) { dot.style.right = newVal ? '3px' : ''; dot.style.left = newVal ? '' : '3px'; }

    if (newVal && actionKey !== 'can_view') {
      permState[selectedUserId][m.key]['can_view'] = true;
      const vt = document.getElementById(`ptgl-${selectedUserId}-${m.key}-can_view`);
      const vd = document.getElementById(`pdot-${selectedUserId}-${m.key}-can_view`);
      if (vt) vt.style.background = '#3b82f6';
      if (vd) { vd.style.right = '3px'; vd.style.left = ''; }
    }
    const allRowOn = ACTIONS.every(a => permState[selectedUserId][m.key][a.key]);
    const rowAll = document.getElementById(`pall-${m.key}`);
    if (rowAll) rowAll.checked = allRowOn;
  });
}

// ══════════════════════════════════════════════════════
// SAVE
// ══════════════════════════════════════════════════════
async function permSave(userId) {
  st('جاري الحفظ...','loading');
  const uPerms = permState[userId];
  const rows = MODULES_DEF.map(m => ({
    user_id:    userId,  module: m.key,
    can_view:   uPerms[m.key]?.can_view   || false,
    can_create: uPerms[m.key]?.can_create || false,
    can_edit:   uPerms[m.key]?.can_edit   || false,
    can_delete: uPerms[m.key]?.can_delete || false,
  }));
  const { error } = await sb.from('user_permissions').upsert(rows, { onConflict:'user_id,module' });
  if (error) { st('خطأ: '+error.message,'error'); return; }
  await logAction('UPDATE','user_permissions',userId);
  st('✓ تم حفظ الصلاحيات');
}

// ══════════════════════════════════════════════════════
// APPLY TEMPLATE
// ══════════════════════════════════════════════════════
async function permApplyTemplate(userId, role) {
  const ok = await confirm(`تطبيق الصلاحيات الافتراضية لـ "${ROLE_LABELS_P[role]||role}"؟`, '🔄');
  if (!ok) return;
  st('جاري التطبيق...','loading');
  const { error } = await sb.rpc('apply_default_permissions', { p_user_id:userId, p_role:role });
  if (error) { st('خطأ: '+error.message,'error'); return; }
  st('✓ تم تطبيق القالب');
  await loadPermissionsUI();
}

// ══════════════════════════════════════════════════════
// COPY PERMISSIONS
// ══════════════════════════════════════════════════════
function permCopyModal(targetUserId) {
  const targetUser = permUsers.find(u => u.id===targetUserId);
  const others = permUsers.filter(u => u.id!==targetUserId);
  document.getElementById('copy-perm-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'copy-perm-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-title">📋 نسخ الصلاحيات</div>
      <div class="modal-sub">نسخ إلى: <strong>${targetUser?.fullname}</strong></div>
      <div class="lf" style="margin-top:12px;">
        <label>نسخ من مستخدم</label>
        <select id="copy-from-select" class="sel">
          <option value="">— اختر مستخدم —</option>
          ${others.map(u=>`<option value="${u.id}">${u.fullname} (${ROLE_LABELS_P[u.role]||u.role})</option>`).join('')}
        </select>
      </div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn bg" onclick="permExecuteCopy('${targetUserId}')">نسخ الصلاحيات</button>
        <button class="btn bp" onclick="document.getElementById('copy-perm-modal').remove()">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function permExecuteCopy(targetUserId) {
  const sourceId = document.getElementById('copy-from-select').value;
  if (!sourceId) { alert('اختر مستخدماً أولاً'); return; }
  permState[targetUserId] = JSON.parse(JSON.stringify(permState[sourceId]));
  document.getElementById('copy-perm-modal').remove();
  await permSave(targetUserId);
  const area = document.getElementById('perm-matrix-area');
  if (area) area.innerHTML = buildMatrix();
}
