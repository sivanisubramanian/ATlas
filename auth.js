const { createClient } = supabase;
const _supabase = createClient('https://vtacdzdatiwcmvwygnow.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0YWNkemRhdGl3Y212d3lnbm93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzMxNjYsImV4cCI6MjA5NDY0OTE2Nn0.4kDVhCqQDqC2baR4Ncca6GiCVveeyzq1eLtpJf3_sQE');

const MODULES = ['ankle', 'knee', 'terminology'];
const MODULE_NAMES = {ankle: 'Ankle Anatomy', knee: 'Knee Anatomy', terminology: 'Medical Terminology'};

async function initAuth() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (session) {
    await handleAuthUser(session.user);
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.querySelector('.app').style.display = 'none';
    document.querySelector('nav').style.display = 'none';
  }
}

async function handleAuthUser(user) {
  const { data: profile } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return;
  if (profile.role === 'at') {
    showATDashboard(profile);
  } else {
    showStudentApp(profile);
  }
}

function showAuth(screen) {
  document.querySelectorAll('.auth-screen').forEach(s => s.style.display = 'none');
  const map = {landing:'auth-landing', login:'auth-login', 'student-signup':'auth-student-signup', 'at-signup':'auth-at-signup'};
  const el = document.getElementById(map[screen]);
  if (el) el.style.display = 'flex';
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  const btn = document.querySelector('#auth-login .auth-submit');
  btn.disabled = true; btn.textContent = 'Logging in...';
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Log In'; return; }
  await handleAuthUser(data.user);
}

async function handleStudentSignup() {
  const name = document.getElementById('student-name').value.trim();
  const email = document.getElementById('student-email').value.trim();
  const password = document.getElementById('student-password').value;
  const school = document.getElementById('student-school').value.trim();
  const code = document.getElementById('student-code').value.trim().toUpperCase();
  const errEl = document.getElementById('student-error');
  errEl.style.display = 'none';
  if (!name || !email || !password || !school || !code) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  const { data: classData, error: classError } = await _supabase.from('classes').select('id').eq('join_code', code).single();
  if (classError || !classData) { errEl.textContent = 'Class code not found. Check with your AT.'; errEl.style.display = 'block'; return; }
  const btn = document.querySelector('#auth-student-signup .auth-submit');
  btn.disabled = true; btn.textContent = 'Creating account...';
  const { data, error } = await _supabase.auth.signUp({ email, password, options: { data: { full_name: name, role: 'student', school } } });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Create Account'; return; }
  await _supabase.from('class_memberships').insert({ class_id: classData.id, student_id: data.user.id });
  await handleAuthUser(data.user);
}

async function handleATSignup() {
  const name = document.getElementById('at-name').value.trim();
  const email = document.getElementById('at-email').value.trim();
  const password = document.getElementById('at-password').value;
  const school = document.getElementById('at-school').value.trim();
  const errEl = document.getElementById('at-error');
  errEl.style.display = 'none';
  if (!name || !email || !password || !school) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  const btn = document.querySelector('#auth-at-signup .auth-submit');
  btn.disabled = true; btn.textContent = 'Creating account...';
  const { data, error } = await _supabase.auth.signUp({ email, password, options: { data: { full_name: name, role: 'at', school } } });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Create Account'; return; }
  const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  await _supabase.from('classes').insert({ at_id: data.user.id, class_name: school + ' AT Class', join_code: joinCode });
  await handleAuthUser(data.user);
}

async function showStudentApp(profile) {
  document.getElementById('auth-overlay').style.display = 'none';
  document.querySelector('.app').style.display = 'flex';
  document.querySelector('nav').style.display = 'flex';
  const nav = document.querySelector('nav');
  if (!document.getElementById('nav-logout')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'nav-logout';
    logoutBtn.textContent = 'Log Out';
    logoutBtn.onclick = handleLogout;
    logoutBtn.style.cssText = "background:rgba(255,255,255,0.15);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:0.84rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif";
    nav.appendChild(logoutBtn);
  }
  await loadStudentProgress(profile.id);
}

async function loadStudentProgress(studentId) {
  const { data } = await _supabase.from('progress').select('*').eq('student_id', studentId);
  if (data) {
    data.forEach(row => {
      if (row.status === 'complete') { progress.completed.add(row.module_key); }
      else if (row.status === 'in_progress') { progress.inProgress.add(row.module_key); }
    });
    updateDashboardStats();
    MODULES.forEach(key => { if (progress.completed.has(key)) updateModuleCardUI(key); });
  }
}

async function saveProgress(moduleKey, status) {
  const { data: { user } } = await _supabase.auth.getUser();
  if (!user) return;
  await _supabase.from('progress').upsert({ student_id: user.id, module_key: moduleKey, status: status, updated_at: new Date().toISOString() }, { onConflict: 'student_id,module_key' });
}

const _origMarkInProgress = markModuleInProgress;
const _origMarkComplete = markModuleComplete;
window.markModuleInProgress = async function(key) { _origMarkInProgress(key); await saveProgress(key, 'in_progress'); };
window.markModuleComplete = async function(key) { _origMarkComplete(key); await saveProgress(key, 'complete'); };

async function showATDashboard(profile) {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('at-dashboard-overlay').style.display = 'block';
  document.getElementById('at-welcome-name').textContent = profile.full_name || profile.email;
  const { data: classData } = await _supabase.from('classes').select('*').eq('at_id', profile.id).single();
  if (!classData) return;
  document.getElementById('at-class-code').textContent = classData.join_code;
  const { data: members } = await _supabase.from('class_memberships').select('student_id').eq('class_id', classData.id);
  if (!members || members.length === 0) {
    document.getElementById('at-students-list').innerHTML = '<div style="color:var(--muted);font-size:0.88rem;background:var(--white);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center">No students have joined yet. Share your class code with them!</div>';
    return;
  }
  const studentIds = members.map(m => m.student_id);
  const { data: students } = await _supabase.from('profiles').select('*').in('id', studentIds);
  const { data: allProgress } = await _supabase.from('progress').select('*').in('student_id', studentIds);
  renderATStudents(students, allProgress);
}

function renderATStudents(students, allProgress) {
  const container = document.getElementById('at-students-list');
  container.innerHTML = '<h2 style="font-family:Syne,sans-serif;font-size:1.1rem;font-weight:700;margin-bottom:16px;color:var(--text)">Students (' + students.length + ')</h2>';
  students.forEach(student => {
    const sp = (allProgress || []).filter(p => p.student_id === student.id);
    const pills = MODULES.map(key => {
      const prog = sp.find(p => p.module_key === key);
      const status = prog ? prog.status : 'not_started';
      const label = status === 'complete' ? '&#10003; ' : status === 'in_progress' ? '&#8594; ' : '';
      return '<span class="at-progress-pill ' + status + '">' + label + MODULE_NAMES[key] + '</span>';
    }).join('');
    container.innerHTML += '<div class="at-student-card"><div class="at-student-name">' + (student.full_name || 'Unknown') + '</div><div class="at-student-email">' + student.email + '</div><div class="at-progress-grid">' + pills + '</div></div>';
  });
}

async function handleLogout() { await _supabase.auth.signOut(); location.reload(); }
window.addEventListener('load', initAuth);
