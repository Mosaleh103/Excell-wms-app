// ── AUTH.JS FOR WMS ──

// ── AUTH.JS FOR WMS ──

// Bind Login Button
const btnLogin = document.getElementById('btn-login');
if(btnLogin) {
  btnLogin.addEventListener('click', doLogin);
}

// Bind Logout Button
const btnLogout = document.getElementById('btn-logout');
if(btnLogout) {
  btnLogout.addEventListener('click', doLogout);
}

// Password Eye toggles
document.querySelectorAll('.pw-eye').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.getAttribute('data-t');
    if(targetId) {
      const input = document.getElementById(targetId);
      if(input) input.type = input.type === 'password' ? 'text' : 'password';
    }
  });
});

// Check if already logged in
checkSession();

window.CU = null;
window.CP = null;

async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass = document.getElementById('li-pass').value;
  const err = document.getElementById('li-err');
  const btn = document.getElementById('btn-login');

  err.style.display = 'none';
  if (!email || !pass) {
    err.style.display = 'block';
    err.textContent = 'يرجى إدخال البريد وكلمة المرور';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري تسجيل الدخول...';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  
  btn.disabled = false;
  btn.textContent = 'تسجيل الدخول';

  if (error) {
    err.style.display = 'block';
    err.textContent = 'فشل الدخول: ' + (error.message || 'البريد أو كلمة المرور غير صحيحة');
    console.error("Login failed:", error);
    return;
  }

  await initSession(data.user);
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) {
    await initSession(session.user);
  }
}

async function initSession(user) {
  window.CU = user;
  
  // Fetch profile
  const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', window.CU.id).single();
  
  if (error || !prof) {
    const err = document.getElementById('li-err');
    err.style.display = 'block';
    err.textContent = 'لم يتم العثور على بيانات المستخدم، أو ليس لديه Role مسجل.';
    return;
  }

  window.CP = prof;
  
  // Store role for app.js menu builder
  localStorage.setItem('userRole', window.CP.role);
  
  // Hide Login
  document.getElementById('login-screen').style.display = 'none';
  
  // Prepare UI
  document.getElementById('nav-name').textContent = window.CP.full_name || window.CU.email;
  document.getElementById('nav-role').textContent = window.CP.role;
  
  // Navigate to App
  document.getElementById('app').style.display = 'flex';
  
  // Load Dynamic Permissions
  if (typeof loadPermissions === 'function') {
    await loadPermissions();
  }
  
  // Call buildMenu from app.js
  if (typeof buildMenu === 'function') {
    buildMenu();
    // Show Dashboard by default or restore route
    window.Router.start();
  } else {
    console.error("buildMenu function not found!");
  }
}

async function doLogout() {
  await supabase.auth.signOut();
  window.CU = null;
  window.CP = null;
  localStorage.removeItem('userRole');
  
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('li-email').value = '';
  document.getElementById('li-pass').value = '';
}

// ── USERS MANAGEMENT ──

window.init_page_users = async function() {
  loadUsers();
};
// ⚡ Router uses init_users (without 'page_' prefix) — provide alias
window.init_users = window.init_page_users;

async function loadUsers() {
  const tbody = document.getElementById('users-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">جاري التحميل...</td></tr>';
  
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if(error) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">خطأ في تحميل المستخدمين</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا يوجد مستخدمين مسجلين.</td></tr>';
    return;
  }
  
  let htmlStr = '';
  data.forEach(u => {
    let roleBadge = '';
    if (u.role === 'admin') {
      roleBadge = '<span style="background:#dc2626; color:white; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:700;">🔴 Admin</span>';
    } else if (u.role === 'accountant') {
      roleBadge = '<span style="background:#f59e0b; color:white; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:700;">🟡 Accountant</span>';
    } else {
      roleBadge = '<span style="background:#64748b; color:white; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:700;">⚪ User</span>';
    }
        
    const canReset = window.CP && window.CP.role === 'admin';
    const resetBtn = canReset 
      ? `<td><button class="btn bt btn-sm" onclick="openAdminResetModal('${u.id}', '${u.full_name || u.username}')">🔐 إعادة تعيين</button></td>`
      : '<td>-</td>';

    htmlStr += `<tr>
      <td>${u.full_name || '-'}</td>
      <td>${u.username || '-'}</td>
      <td>${roleBadge}</td>
      ${resetBtn}
    </tr>`;
  });
  tbody.innerHTML = htmlStr;
}

// btn-add-user via event delegation (compatible with Router SPA)
document.addEventListener('click', async function(e) {
  if (e.target && e.target.id === 'btn-add-user') {
    const name  = document.getElementById('nu-name')?.value.trim();
    const email = document.getElementById('nu-email')?.value.trim();
    const pass  = document.getElementById('nu-pass')?.value;
    const role  = document.getElementById('nu-role')?.value;

    if (!name || !email || !pass) {
      alert('يرجى تعبئة كافة الحقول');
      return;
    }

    const btnAdd = e.target;
    btnAdd.disabled = true;
    btnAdd.textContent = 'جاري الإضافة...';

    try {
      const functionUrl = `https://ihubaduxdqonvcfhamny.supabase.co/functions/v1/reset-password`;
      const { data: { session: adminSess } } = await supabase.auth.getSession();
      
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminSess?.access_token}`
        },
        body: JSON.stringify({ 
          action: 'create-user',
          name: name,
          email: email,
          new_password: pass,
          role: role 
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'فشل إضافة المستخدم');

      const nameEl  = document.getElementById('nu-name');
      const emailEl = document.getElementById('nu-email');
      const passEl  = document.getElementById('nu-pass');
      if (nameEl)  nameEl.value  = '';
      if (emailEl) emailEl.value = '';
      if (passEl)  passEl.value  = '';
      showMsg(`✅ تم إضافة المستخدم ${name} بنجاح`);
      loadUsers();
    } catch (err) {
      console.error("User creation error:", err);
      alert('خطأ أثناء الإضافة: ' + err.message);
    } finally {
      btnAdd.disabled = false;
      btnAdd.textContent = '➕ إضافة مستخدم';
    }

    const nameEl  = document.getElementById('nu-name');
    const emailEl = document.getElementById('nu-email');
    const passEl  = document.getElementById('nu-pass');
    if (nameEl)  nameEl.value  = '';
    if (emailEl) emailEl.value = '';
    if (passEl)  passEl.value  = '';
    showMsg(`✅ تم إضافة المستخدم ${name} بنجاح`);
    loadUsers();
  }
});

// ── ADMIN PASSWORD RESET LOGIC ──

window.openAdminResetModal = function(uid, name) {
  const modal = document.getElementById('admin-chpw-overlay');
  if(!modal) return;
  
  document.getElementById('admin-chpw-uid').value = uid;
  document.getElementById('admin-chpw-sub').textContent = `جاري التعديل لـ: ${name}`;
  document.getElementById('admin-chpw-new').value = '';
  document.getElementById('admin-chpw-confirm').value = '';
  document.getElementById('admin-chpw-err').textContent = '';
  
  modal.style.display = 'flex';
};

function closeAdminResetModal() {
  const modal = document.getElementById('admin-chpw-overlay');
  if(modal) modal.style.display = 'none';
}

async function doAdminResetPassword() {
  const uid = document.getElementById('admin-chpw-uid').value;
  const pass = document.getElementById('admin-chpw-new').value;
  const conf = document.getElementById('admin-chpw-confirm').value;
  const err = document.getElementById('admin-chpw-err');
  const btn = document.getElementById('btn-admin-chpw-save');

  if (!err || !btn) return;
  err.textContent = '';

  if (!pass || pass.length < 6) {
    err.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    return;
  }
  if (pass !== conf) {
    err.textContent = 'كلمة المرور غير متطابقة';
    return;
  }

  // Define the save operation
  const performSave = async () => {
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
    err.textContent = '';

    try {
      console.log("Attempting to reset password via Edge Function for UID:", uid);
      
      const functionUrl = `https://ihubaduxdqonvcfhamny.supabase.co/functions/v1/reset-password`;
      console.log("Calling Edge Function:", functionUrl);

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ 
          action: 'reset-password',
          user_id: uid, 
          new_password: pass 
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل تغيير كلمة المرور');
      }
      
      showMsg('✅ تم تغيير كلمة المرور بنجاح');
      closeAdminResetModal();
    } catch (e) {
      console.error("Password reset error:", e);
      err.textContent = 'خطأ في العملية: ' + (e.message || 'خطأ غير معروف');
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ التغيير';
    }
  };

  // Trigger confirmation
  if (typeof confirmAction === 'function') {
    confirmAction("هل أنت متأكد من رغبتك في تغيير كلمة المرور لهذا المستخدم؟", performSave);
  } else {
    // Fallback if confirmAction is missing
    if (confirm("هل أنت متأكد من تغيير كلمة المرور؟")) {
      performSave();
    }
  }
}


// Bind Admin Password Reset Buttons via event delegation for better reliability
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'btn-admin-chpw-save') {
    doAdminResetPassword();
  }
  if (e.target && e.target.id === 'btn-admin-chpw-cancel') {
    closeAdminResetModal();
  }
});

