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

let CU = null;
let CP = null;

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
    err.textContent = 'البريد أو كلمة المرور غير صحيحة';
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
  CU = user;
  
  // Fetch profile
  const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', CU.id).single();
  
  if (error || !prof) {
    const err = document.getElementById('li-err');
    err.style.display = 'block';
    err.textContent = 'لم يتم العثور على بيانات المستخدم، أو ليس لديه Role مسجل.';
    return;
  }

  CP = prof;
  
  // Store role for app.js menu builder
  localStorage.setItem('userRole', CP.role);
  
  // Hide Login
  document.getElementById('login-screen').style.display = 'none';
  
  // Prepare UI
  document.getElementById('nav-name').textContent = CP.full_name || CU.email;
  document.getElementById('nav-role').textContent = CP.role;
  
  // Navigate to App
  document.getElementById('app').style.display = 'flex';
  
  // Call buildMenu from app.js
  if (typeof buildMenu === 'function') {
    buildMenu();
    // Show Dashboard by default
    showPage('page-dashboard');
  } else {
    console.error("buildMenu function not found!");
  }
}

async function doLogout() {
  await supabase.auth.signOut();
  CU = null;
  CP = null;
  localStorage.removeItem('userRole');
  
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('li-email').value = '';
  document.getElementById('li-pass').value = '';
}
