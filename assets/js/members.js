/* members.js — Google Sign-In + approved users + admin panel */
(function () {
  'use strict';

  // הגדרות — צריך לעדכן את ה-CLIENT_ID לאחד אמיתי של Google Cloud
  const GOOGLE_CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
  const REPO_OWNER = 'yossi6742853';
  const REPO_NAME = 'maale-amos';

  let currentUser = null;       // { email, name, picture }
  let approvedUsers = [];        // [{ email, name, approvedAt }]
  let admins = [];               // [email1, email2]
  let pendingUsers = [];         // [{ email, name, picture, requestedAt }]
  let userRole = 'guest';       // guest | pending | member | admin

  // === Helpers ===
  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function decodeJwt(token) {
    try {
      const payload = token.split('.')[1];
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
      return JSON.parse(decodeURIComponent(escape(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))));
    } catch (e) { return null; }
  }

  // === Load approved & admins from repo (or localStorage fallback) ===
  async function loadAccessLists() {
    try {
      const r = await fetch('access/approved_users.json?t=' + Date.now());
      if (r.ok) approvedUsers = await r.json();
    } catch (e) {
      try { approvedUsers = JSON.parse(localStorage.getItem('ma_approved') || '[]'); } catch { approvedUsers = []; }
    }
    try {
      const r = await fetch('access/admins.json?t=' + Date.now());
      if (r.ok) admins = await r.json();
    } catch (e) {
      try { admins = JSON.parse(localStorage.getItem('ma_admins') || '["6742853@gmail.com"]'); } catch { admins = ['6742853@gmail.com']; }
    }
    try {
      const stored = localStorage.getItem('ma_pending');
      pendingUsers = stored ? JSON.parse(stored) : [];
    } catch { pendingUsers = []; }
  }

  // === Determine role ===
  function determineRole() {
    if (!currentUser) return 'guest';
    const email = (currentUser.email || '').toLowerCase();
    if (admins.map(a => String(a).toLowerCase()).includes(email)) return 'admin';
    if (approvedUsers.some(u => String(u.email || '').toLowerCase() === email)) return 'member';
    return 'pending';
  }

  // === Sign in ===
  window.handleCredentialResponse = function (response) {
    const data = decodeJwt(response.credential);
    if (!data || !data.email) {
      alert('כשל באימות. אנא נסה שוב.');
      return;
    }
    currentUser = {
      email: data.email,
      name: data.name || data.email,
      picture: data.picture || '',
      sub: data.sub,
    };
    localStorage.setItem('ma_user', JSON.stringify(currentUser));

    // אם זה משתמש חדש (pending) — הוסף לרשימה
    const role = determineRole();
    if (role === 'pending' && !pendingUsers.some(p => p.email === currentUser.email)) {
      pendingUsers.push({
        email: currentUser.email,
        name: currentUser.name,
        picture: currentUser.picture,
        requestedAt: new Date().toISOString(),
      });
      localStorage.setItem('ma_pending', JSON.stringify(pendingUsers));
    }
    renderState();
  };

  window.signOut = function () {
    currentUser = null;
    localStorage.removeItem('ma_user');
    renderState();
    if (window.google && window.google.accounts) {
      window.google.accounts.id.disableAutoSelect();
    }
  };

  // === Render UI by state ===
  function renderState() {
    userRole = determineRole();

    if (userRole === 'guest') {
      show('signed-out'); hide('signed-in');
      // אתחל את כפתור Google Sign-In
      if (window.google && window.google.accounts) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: window.handleCredentialResponse,
        });
        window.google.accounts.id.renderButton(
          $('google-signin-btn'),
          { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'he' }
        );
      }
      return;
    }

    hide('signed-out'); show('signed-in');
    $('user-avatar').src = currentUser.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=1a4d3e&color=fff`;
    $('user-name').textContent = currentUser.name;
    $('user-email').textContent = currentUser.email;

    if (userRole === 'pending') {
      $('user-role').textContent = 'ממתין לאישור';
      $('user-role').className = 'role-badge';
      $('user-role').style.background = '#fbbf24';
      $('user-role').style.color = '#1a4d3e';
      show('pending-approval');
      hide('member-area');
    } else if (userRole === 'member') {
      $('user-role').textContent = 'חבר קהילה';
      $('user-role').className = 'role-badge role-member';
      hide('pending-approval');
      show('member-area');
      hide('admin-tab-btn');
      loadMemberDashboard();
    } else if (userRole === 'admin') {
      $('user-role').textContent = 'מנהל';
      $('user-role').className = 'role-badge role-admin';
      hide('pending-approval');
      show('member-area');
      show('admin-tab-btn');
      loadMemberDashboard();
      loadAdminPanel();
    }

    // טאבים
    document.querySelectorAll('#member-tabs .btn').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // פרופיל
    $('profile-name').value = currentUser.name;
    $('profile-email').value = currentUser.email;
    const stored = JSON.parse(localStorage.getItem('ma_profile_' + currentUser.email) || '{}');
    $('profile-phone').value = stored.phone || '';
    $('profile-address').value = stored.address || '';
  }

  function switchTab(name) {
    document.querySelectorAll('#member-tabs .btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    ['dashboard','phones','docs','profile','admin'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('hidden', t !== name);
    });
    if (name === 'phones') renderMemberPhones();
  }

  // === Member dashboard ===
  async function loadMemberDashboard() {
    const D = await MA.onDataReady();
    const ann = $('recent-announcements');
    const ev = $('recent-events');
    if (D.announcements && D.announcements.length) {
      ann.innerHTML = D.announcements.slice(0, 5).map(a => {
        const title = typeof a === 'string' ? a : (a.title || a.text || '');
        return `<div style="padding:8px;border-bottom:1px solid var(--border)">${MA.escape(title)}</div>`;
      }).join('');
    } else ann.innerHTML = '<p class="muted">אין הודעות חדשות</p>';

    if (D.events && D.events.length) {
      ev.innerHTML = D.events.slice(0, 5).map(e =>
        `<div style="padding:8px;border-bottom:1px solid var(--border)"><strong>${MA.escape(e.title || e.name)}</strong><div class="muted" style="font-size:0.85rem">${e.date ? MA.formatDate(e.date) : ''}</div></div>`
      ).join('');
    } else ev.innerHTML = '<p class="muted">אין אירועים מתוכננים</p>';
  }

  function renderMemberPhones() {
    const D = MA_DATA;
    const phones = D.phones || [];
    const KEY = { name: ['n', 'name'], phone: ['p', 'phone'], whatsapp: ['w', 'wp'] };
    const val = (o, k) => { for (const x of KEY[k]) if (o[x] != null) return o[x]; return ''; };
    const render = (list) => {
      const rows = list.slice(0, 300).map(p => `
        <tr>
          <td>${MA.escape(val(p, 'name'))}</td>
          <td>${val(p, 'phone') ? `<a href="tel:${val(p, 'phone')}">${val(p, 'phone')}</a>` : '—'}</td>
          <td>${val(p, 'whatsapp') ? `<a href="https://wa.me/972${String(val(p, 'whatsapp')).replace(/[^0-9]/g, '').replace(/^0/, '')}" target="_blank">💬</a>` : '—'}</td>
        </tr>
      `).join('');
      $('member-phones-table').innerHTML = `<div class="table-wrap"><table><thead><tr><th>שם</th><th>טלפון</th><th>WA</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    };
    render(phones);
    $('member-phone-search').oninput = (e) => {
      const t = e.target.value.toLowerCase();
      render(t ? phones.filter(p => String(val(p, 'name')).toLowerCase().includes(t) || String(val(p, 'phone')).toLowerCase().includes(t)) : phones);
    };
  }

  // === Profile save ===
  window.saveProfile = function () {
    const data = {
      phone: $('profile-phone').value.trim(),
      address: $('profile-address').value.trim(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('ma_profile_' + currentUser.email, JSON.stringify(data));
    $('profile-status').innerHTML = '<div class="alert alert-success">הפרופיל נשמר בהצלחה</div>';
    setTimeout(() => { $('profile-status').innerHTML = ''; }, 3000);
  };

  // === Admin panel ===
  function loadAdminPanel() {
    renderPendingList();
    renderApprovedList();
    const pat = localStorage.getItem('ma_pat') || '';
    $('admin-pat').value = pat ? '•'.repeat(20) : '';
  }

  function renderPendingList() {
    const list = $('pending-list');
    if (!pendingUsers.length) {
      list.innerHTML = '<p class="muted">אין בקשות ממתינות</p>';
      return;
    }
    list.innerHTML = pendingUsers.map((u, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border)">
        <img src="${u.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=1a4d3e&color=fff`}" class="member-avatar" style="width:36px;height:36px">
        <div style="flex:1">
          <div><strong>${MA.escape(u.name)}</strong></div>
          <div class="muted" style="font-size:0.85rem">${MA.escape(u.email)} · ${MA.formatDate(u.requestedAt)}</div>
        </div>
        <button class="btn btn-primary" onclick="window.approveUser(${i})">
          <i class="bi bi-check"></i> אשר
        </button>
        <button class="btn btn-outline" onclick="window.rejectUser(${i})">
          <i class="bi bi-x"></i> דחה
        </button>
      </div>
    `).join('');
  }

  function renderApprovedList() {
    const list = $('approved-list');
    if (!approvedUsers.length) {
      list.innerHTML = '<p class="muted">אין חברים מאושרים עדיין</p>';
      return;
    }
    list.innerHTML = approvedUsers.map((u, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div><strong>${MA.escape(u.name || u.email)}</strong></div>
          <div class="muted" style="font-size:0.85rem">${MA.escape(u.email)} · אושר ${u.approvedAt ? MA.formatDate(u.approvedAt) : ''}</div>
        </div>
        <button class="btn btn-outline" onclick="window.removeApproved(${i})">
          <i class="bi bi-trash"></i> הסר
        </button>
      </div>
    `).join('');
  }

  window.approveUser = function (idx) {
    const u = pendingUsers[idx];
    approvedUsers.push({ email: u.email, name: u.name, approvedAt: new Date().toISOString() });
    pendingUsers.splice(idx, 1);
    localStorage.setItem('ma_approved', JSON.stringify(approvedUsers));
    localStorage.setItem('ma_pending', JSON.stringify(pendingUsers));
    renderPendingList();
    renderApprovedList();
    pushToGitHub('access/approved_users.json', approvedUsers, 'admin: approve ' + u.email);
  };

  window.rejectUser = function (idx) {
    if (!confirm('להסיר את הבקשה?')) return;
    pendingUsers.splice(idx, 1);
    localStorage.setItem('ma_pending', JSON.stringify(pendingUsers));
    renderPendingList();
  };

  window.removeApproved = function (idx) {
    const u = approvedUsers[idx];
    if (!confirm(`להסיר את ${u.email} מרשימת המאושרים?`)) return;
    approvedUsers.splice(idx, 1);
    localStorage.setItem('ma_approved', JSON.stringify(approvedUsers));
    renderApprovedList();
    pushToGitHub('access/approved_users.json', approvedUsers, 'admin: remove ' + u.email);
  };

  // === Publish news ===
  window.publishNews = async function () {
    const title = $('new-news-title').value.trim();
    const summary = $('new-news-summary').value.trim();
    const date = $('new-news-date').value || new Date().toISOString().slice(0, 10);
    if (!title) {
      $('news-status').innerHTML = '<div class="alert alert-error">חובה למלא כותרת</div>';
      return;
    }
    try {
      // קרא data.json הנוכחי
      const r = await fetch('data.json?t=' + Date.now());
      const data = await r.json();
      data.news = data.news || [];
      data.news.unshift({ title, summary, date, addedBy: currentUser.email });
      await pushToGitHub('data.json', data, 'admin: publish news - ' + title);
      $('news-status').innerHTML = '<div class="alert alert-success">הכתבה פורסמה בהצלחה!</div>';
      $('new-news-title').value = '';
      $('new-news-summary').value = '';
      $('new-news-date').value = '';
    } catch (e) {
      $('news-status').innerHTML = `<div class="alert alert-error">שגיאה: ${e.message}</div>`;
    }
  };

  // === Upload banner ===
  window.uploadBanner = async function () {
    const fileInput = $('banner-file');
    const file = fileInput.files[0];
    if (!file) {
      $('banner-status').innerHTML = '<div class="alert alert-error">בחר קובץ תמונה</div>';
      return;
    }
    const pat = getPat();
    if (!pat) {
      $('banner-status').innerHTML = '<div class="alert alert-error">חסר GitHub PAT — לחץ "הגדרות מתקדמות" והגדר.</div>';
      return;
    }

    $('banner-status').innerHTML = '<div class="alert alert-info">מעלה...</div>';
    const ext = file.name.split('.').pop().toLowerCase();
    const safeName = (file.name.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const path = `images/uploads/${Date.now()}_${safeName}`;

    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result.split(',')[1];
      try {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
        const r = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + pat,
            'Accept': 'application/vnd.github+json',
          },
          body: JSON.stringify({
            message: 'admin: upload banner ' + safeName,
            content: b64,
          }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        $('banner-status').innerHTML = `<div class="alert alert-success">הועלה בהצלחה: <code>${path}</code></div>`;
        fileInput.value = '';
      } catch (e) {
        $('banner-status').innerHTML = `<div class="alert alert-error">שגיאה: ${e.message}</div>`;
      }
    };
    reader.readAsDataURL(file);
  };

  // === GitHub helpers ===
  function getPat() { return localStorage.getItem('ma_pat') || ''; }

  window.savePat = function () {
    const v = $('admin-pat').value.trim();
    if (!v) return;
    if (v.startsWith('•')) return; // already saved
    localStorage.setItem('ma_pat', v);
    $('pat-status').innerHTML = '<div class="alert alert-success">Token נשמר</div>';
    $('admin-pat').value = '•'.repeat(20);
    setTimeout(() => { $('pat-status').innerHTML = ''; }, 3000);
  };

  async function pushToGitHub(path, content, message) {
    const pat = getPat();
    if (!pat) {
      console.warn('No PAT — saved locally only');
      return false;
    }
    try {
      // קרא SHA נוכחי
      const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
      const getRes = await fetch(getUrl, { headers: { 'Authorization': 'token ' + pat } });
      let sha = null;
      if (getRes.ok) {
        const cur = await getRes.json();
        sha = cur.sha;
      }
      const body = {
        message,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      };
      if (sha) body.sha = sha;
      const putRes = await fetch(getUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + pat,
          'Accept': 'application/vnd.github+json',
        },
        body: JSON.stringify(body),
      });
      if (!putRes.ok) throw new Error('GitHub push fail: ' + putRes.status);
      return true;
    } catch (e) {
      console.error('GitHub push fail', e);
      return false;
    }
  }

  // === Init ===
  document.addEventListener('DOMContentLoaded', async () => {
    await loadAccessLists();
    // החזר משתמש שכבר התחבר
    const stored = localStorage.getItem('ma_user');
    if (stored) {
      try { currentUser = JSON.parse(stored); } catch { currentUser = null; }
    }
    // המתן ל-Google API
    let waited = 0;
    while ((!window.google || !window.google.accounts) && waited < 50) {
      await new Promise(r => setTimeout(r, 100));
      waited++;
    }
    renderState();
  });
})();
