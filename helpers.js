// ==========================================
// HELPERS — Complete with dead-link protection
// ==========================================

import { supabase } from './supabase.js';

const SCHOOL_CACHE_KEY = 'school_profile_cache';
const SCHOOL_CACHE_TTL = 5 * 60 * 1000;
const DEAD_LINKS_KEY = 'dead_links_cache_v2';

export async function getSchoolProfile(force = false) {
  if (!force) {
    try {
      const cached = sessionStorage.getItem(SCHOOL_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed._t < SCHOOL_CACHE_TTL) return parsed.data;
      }
    } catch (e) { /* ignore */ }
  }
  const { data } = await supabase.from('school_settings').select('*').eq('id', 1).single();
  const school = {
    name: data?.institute_name || 'SCHOOL NAME',
    nameBangla: data?.institute_name_bangla || '',
    address: data?.address || '',
    addressBangla: data?.address_bangla || '',
    emis: data?.ein_no || '',
    phone: data?.contact || '',
    phoneBangla: data?.contact_bangla || '',
    website: data?.website || '',
    facebook: data?.facebook_url || '',
    logo: data?.school_logo || '',
    watermark: data?.watermark_logo || '',
    headerImage: data?.header_image || '',
    banner: data?.banner_image || '',
    principal: data?.principal_name || 'Head Teacher',
    principalSignature: data?.principal_signature || '',
  };
  try {
    sessionStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify({ _t: Date.now(), data: school }));
  } catch (e) { /* ignore */ }
  return school;
}

export function clearSchoolCache() {
  try { sessionStorage.removeItem(SCHOOL_CACHE_KEY); } catch (e) { /* */ }
}

/* ============================================================
   ✅ DEAD-LINK DETECTION
   - Checks all <a href="...html"> links
   - Hides those that return 404/error
   - Hides empty parent folders/categories
   - Caches result for the session
   ============================================================ */
export async function hideDeadLinks() {
  // Skip in file:// mode (fetch won't work)
  if (window.location.protocol === 'file:') return;

  let deadLinks = [];
  try {
    const cached = sessionStorage.getItem(DEAD_LINKS_KEY);
    if (cached) {
      deadLinks = JSON.parse(cached);
      applyDeadLinks(deadLinks);
      return;
    }
  } catch (e) { /* ignore */ }

  // Find all internal .html links
  const links = Array.from(document.querySelectorAll('a[href$=".html"]'))
    .filter(a => {
      const href = a.getAttribute('href');
      return href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#');
    });

  // Unique hrefs only
  const uniqueHrefs = [...new Set(links.map(a => a.getAttribute('href')))];

  // Check each in parallel
  await Promise.all(uniqueHrefs.map(async (href) => {
    try {
      const res = await fetch(href, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) deadLinks.push(href);
    } catch (e) {
      deadLinks.push(href);
    }
  }));

  try {
    sessionStorage.setItem(DEAD_LINKS_KEY, JSON.stringify(deadLinks));
  } catch (e) { /* ignore */ }

  applyDeadLinks(deadLinks);
}

function applyDeadLinks(deadLinks) {
  if (!deadLinks || !deadLinks.length) return;

  deadLinks.forEach(href => {
    document.querySelectorAll(`a[href="${href}"]`).forEach(link => {
      link.style.display = 'none';

      // Hide empty sidebar folder
      const folder = link.closest('.menu-folder');
      if (folder) {
        const anyVisible = Array.from(folder.querySelectorAll('.submenu-item'))
          .some(item => item.style.display !== 'none');
        if (!anyVisible) folder.style.display = 'none';
      }

      // Hide empty dashboard category
      const category = link.closest('.db-category');
      if (category) {
        const anyVisible = Array.from(category.querySelectorAll('.db-tile'))
          .some(tile => tile.style.display !== 'none');
        if (!anyVisible) category.style.display = 'none';
      }
    });
  });
}

export function clearDeadLinksCache() {
  try { sessionStorage.removeItem(DEAD_LINKS_KEY); } catch (e) { /* */ }
}

/* ============================================================
   LOG ACTION
   ============================================================ */
let _cachedProfile = null;

export async function logAction(action, tableName, recordId, description = '', details = {}) {
  try {
    if (!_cachedProfile) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      _cachedProfile = {
        id: session.user.id,
        name: prof?.full_name || session.user.email,
        role: prof?.role || 'unknown',
      };
    }
    await supabase.from('audit_log').insert({
      user_id: _cachedProfile.id,
      user_name: _cachedProfile.name,
      user_role: _cachedProfile.role,
      action: String(action).toLowerCase(),
      table_name: tableName || null,
      record_id: recordId ? String(recordId) : null,
      description: description || null,
      details: details || {},
      user_agent: navigator.userAgent.slice(0, 200),
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

/* ============================================================
   VALIDATION
   ============================================================ */
export const validate = {
  phone(v, required = false) {
    if (!v || !v.trim()) return required ? 'ফোন নম্বর দিতে হবে' : null;
    const cleaned = v.replace(/[\s\-\(\)]/g, '');
    if (!/^01[3-9]\d{8}$/.test(cleaned)) return 'সঠিক ১১ ডিজিটের ফোন নম্বর দিন';
    return null;
  },
  email(v, required = false) {
    if (!v || !v.trim()) return required ? 'ইমেইল দিতে হবে' : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'সঠিক ইমেইল ঠিকানা দিন';
    return null;
  },
  required(v, label = 'এই ঘর') {
    if (v === null || v === undefined || String(v).trim() === '') return `${label} দিতে হবে`;
    return null;
  },
  number(v, opts = {}) {
    if (!v && !opts.required) return null;
    const n = Number(v);
    if (isNaN(n)) return 'সংখ্যা দিতে হবে';
    if (opts.min !== undefined && n < opts.min) return `সর্বনিম্ন ${opts.min}`;
    if (opts.max !== undefined && n > opts.max) return `সর্বোচ্চ ${opts.max}`;
    return null;
  },
  length(v, min, max, label = 'এই ঘর') {
    if (!v) return null;
    const s = String(v).trim();
    if (s.length < min) return `${label} কমপক্ষে ${min} অক্ষর হতে হবে`;
    if (max && s.length > max) return `${label} ${max} অক্ষরের বেশি হতে পারবে না`;
    return null;
  },
  date(v, label = 'তারিখ') {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'সঠিক তারিখ দিন';
    return null;
  },
};

export function showValidationErrors(errors) {
  const list = Object.entries(errors).filter(([_, msg]) => msg);
  if (!list.length) return true;
  const msg = list.map(([field, err], i) => `${i + 1}. ${err}`).join('\n');
  alert('⚠️ ত্রুটি:\n\n' + msg);
  return false;
}

/* ============================================================
   AUTH
   ============================================================ */
export async function requireLogin(allowedRoles = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (!profile) { await supabase.auth.signOut(); window.location.href = 'index.html'; return null; }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    alert('এই পেজে ঢোকার অনুমতি নেই');
    window.location.href = 'dashboard.html';
    return null;
  }
  _cachedProfile = {
    id: session.user.id,
    name: profile.full_name || session.user.email,
    role: profile.role || 'unknown',
  };
  return profile;
}

export async function logout() {
  await logAction('logout', null, null, 'User logged out');
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

/* ============================================================
   MENU STRUCTURE
   ============================================================ */
const MENU_STRUCTURE = [
  { type: 'item', href: 'dashboard.html', icon: '🏠', label: 'ড্যাশবোর্ড',
    roles: ['admin','teacher','student','guardian'] },

  { type: 'folder', id: 'students', icon: '🎓', label: 'ছাত্র ব্যবস্থাপনা',
    roles: ['admin'],
    items: [
      { href: 'students.html',   icon: '👥', label: 'ছাত্রছাত্রী',       badge: 'students' },
      { href: 'admission.html',  icon: '📚', label: 'ভর্তি' },
      { href: 'promote.html',    icon: '🎯', label: 'প্রমোশন' },
      { href: 'student-documents.html', icon: '📄', label: 'ছাত্র ডকুমেন্ট' },
    ]},

  { type: 'folder', id: 'staff', icon: '👩‍🏫', label: 'শিক্ষক ও ক্লাস',
    roles: ['admin'],
    items: [
      { href: 'teachers.html',   icon: '👩‍🏫', label: 'শিক্ষক',      badge: 'teachers' },
      { href: 'classes.html',    icon: '🏫', label: 'ক্লাস',          badge: 'classes' },
      { href: 'subjects.html',   icon: '📖', label: 'সাবজেক্ট' },
    ]},

  { type: 'folder', id: 'attendance', icon: '📋', label: 'হাজিরা',
    roles: ['admin','teacher','student','guardian'],
    items: [
      { href: 'attendance.html', icon: '✅', label: 'দৈনিক হাজিরা' },
    ]},

  { type: 'folder', id: 'exams', icon: '📝', label: 'পরীক্ষা ও ফলাফল',
    roles: ['admin','teacher','student','guardian'],
    items: [
      { href: 'exam-names.html',        icon: '📋', label: 'পরীক্ষার নাম',   roles: ['admin'] },
      { href: 'exam-results.html',      icon: '🎯', label: 'নম্বর এন্ট্রি',    roles: ['admin','teacher'] },
      { href: 'exam-attendance.html',   icon: '📄', label: 'হাজিরা শীট',      roles: ['admin','teacher'] },
      { href: 'student-result.html',    icon: '📊', label: 'রেজাল্ট শীট',     roles: ['admin','teacher'] },
      { href: 'tabulation-sheet.html',  icon: '📑', label: 'ট্যাবুলেশন শীট',  roles: ['admin','teacher'] },
      { href: 'report-card.html',       icon: '🖨️', label: 'রিপোর্ট কার্ড',    roles: ['admin','teacher','student','guardian'] },
      { href: 'admit-card.html',        icon: '🎫', label: 'প্রবেশপত্র',       roles: ['admin','teacher'] },
      { href: 'result-publish.html',    icon: '🏆', label: 'রেজাল্ট পাবলিশ',   roles: ['admin','teacher'] },
    ]},

  { type: 'folder', id: 'documents', icon: '📄', label: 'ডকুমেন্ট',
    roles: ['admin','teacher'],
    items: [
      { href: 'id-card.html',           icon: '🪪', label: 'ID Card' },
      { href: 'testimonial-tc.html',    icon: '📜', label: 'Testimonial / TC' },
    ]},

  { type: 'folder', id: 'fees', icon: '💰', label: 'ফি ও হিসাব',
    roles: ['admin'],
    items: [
      { href: 'chart-of-accounts.html', icon: '💰', label: 'হিসাবের খাত' },
      { href: 'expense-management.html', icon: '💸', label: 'খরচ ব্যবস্থাপনা' },
      { href: 'fee-management.html',    icon: '💵', label: 'ফি ব্যবস্থাপনা' },
      { href: 'fee-bulk-assign.html',   icon: '⚡', label: 'এক ক্লিকে ফি' },
      { href: 'fee-due-report.html',    icon: '📊', label: 'ফি বাকি রিপোর্ট' },
      { href: 'bill-details.html',      icon: '📋', label: 'বিল ডিটেইলস' },
      { href: 'due-list-report.html',   icon: '📋', label: 'বাকি রিপোর্ট (Due List)' },
      { href: 'money-receipts.html',    icon: '🧾', label: 'মানি রিসিট' },
    ]},

  { type: 'folder', id: 'info', icon: '📢', label: 'নোটিশ ও রুটিন',
    roles: ['admin','teacher','student','guardian'],
    items: [
      { href: 'notices.html',           icon: '📢', label: 'নোটিশ বোর্ড',    badge: 'notices', roles: ['admin'] },
      { href: 'routine.html',           icon: '📅', label: 'রুটিন' },
      { href: 'monthly-workdays.html',  icon: '📆', label: 'মাসিক কার্যদিবস' },
    ]},

  { type: 'folder', id: 'settings', icon: '⚙️', label: 'সেটিংস',
    roles: ['admin'],
    items: [
      { href: 'school-profile.html',       icon: '🏫', label: 'স্কুল প্রোফাইল' },
      { href: 'sessions.html',             icon: '📅', label: 'একাডেমিক সেশন' },
      { href: 'grade-system.html',         icon: '🎯', label: 'গ্রেড সিস্টেম' },
      { href: 'student-credentials.html',  icon: '🔑', label: 'ছাত্র লগইন এক্সেস' },
    ]},

  { type: 'folder', id: 'tools', icon: '🛠️', label: 'টুলস',
    roles: ['admin'],
    items: [
      { href: 'backup.html',       icon: '💾', label: 'ব্যাকআপ' },
      { href: 'recycle-bin.html',  icon: '🗑️', label: 'Recycle Bin' },
      { href: 'audit-log.html',    icon: '📜', label: 'Audit Log' },
      { href: 'danger-zone.html',  icon: '⚠️', label: 'Danger Zone' },
    ]},
];

const OPEN_KEY = 'school_open_folders';
function getOpenFolders() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; }
}
function setOpenFolders(obj) { localStorage.setItem(OPEN_KEY, JSON.stringify(obj)); }

async function loadBadgeCounts(role) {
  const badges = {};
  try {
    if (role === 'admin' || role === 'teacher') {
      const [s, t, c, n] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('teachers').select('*', { count: 'exact', head: true }),
        supabase.from('classes').select('*', { count: 'exact', head: true }),
        supabase.from('notices').select('*', { count: 'exact', head: true }),
      ]);
      badges.students = s.count ?? 0;
      badges.teachers = t.count ?? 0;
      badges.classes  = c.count ?? 0;
      badges.notices  = n.count ?? 0;
    }
  } catch (e) { console.warn('Badge load failed:', e); }
  return badges;
}

function injectSidebarStyles() {
  if (document.getElementById('sidebar-enhance-styles')) return;
  const style = document.createElement('style');
  style.id = 'sidebar-enhance-styles';
  style.textContent = `
    .sidebar-search { position: relative; margin: 4px 8px 12px; }
    .sidebar-search::before { content: '🔍'; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; pointer-events: none; opacity: 0.6; }
    .sidebar-search input { width: 100%; padding: 9px 12px 9px 34px; border: 2px solid #e5e7eb; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 600; background: #fafbfc; color: #1f2937; transition: all 0.2s; }
    .sidebar-search input:focus { outline: none; border-color: #7c3aed; background: white; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
    .sidebar-search-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: #e5e7eb; border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 11px; color: #6b7280; display: none; align-items: center; justify-content: center; font-weight: 800; transition: all 0.15s; }
    .sidebar-search-clear:hover { background: #d1d5db; color: #374151; }
    .sidebar-search.has-value .sidebar-search-clear { display: flex; }
    .sidebar.searching .menu-folder:not(.search-match), .sidebar.searching .menu-item:not(.search-match) { display: none !important; }
    .sidebar.searching .menu-folder.search-match .folder-items { max-height: none !important; border-left-color: #c4b5fd !important; padding-top: 4px !important; padding-bottom: 4px !important; }
    .sidebar.searching .submenu-item:not(.search-match) { display: none !important; }
    .sidebar-search-no-result { text-align: center; padding: 24px 16px; color: #9ca3af; font-size: 12.5px; font-weight: 600; }
    .menu-item .mi-badge, .submenu-item .mi-badge { margin-left: auto; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 10px; min-width: 22px; text-align: center; letter-spacing: 0.2px; flex-shrink: 0; box-shadow: 0 2px 6px rgba(124,58,237,0.3); }
    .menu-item.active .mi-badge, .submenu-item.active .mi-badge { background: rgba(255,255,255,0.25); box-shadow: none; color: white; }
    .menu-folder .folder-header .mi-badge { background: #f3f4f6; color: #6b7280; box-shadow: none; }
    .menu-folder.open .folder-header .mi-badge { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; }
    .sidebar-divider { height: 1px; background: linear-gradient(90deg, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent); margin: 8px 12px; }
  `;
  document.head.appendChild(style);
}

export function renderLayout(profile, activePage, title) {
  injectSidebarStyles();
  const openState = getOpenFolders();
  const menuHtml = MENU_STRUCTURE.map(node => {
    if (node.roles && !node.roles.includes(profile.role)) return '';
    if (node.type === 'item') {
      const active = activePage === node.href;
      const badge = node.badge ? `<span class="mi-badge" data-badge="${node.badge}">—</span>` : '';
      return `<a href="${node.href}" class="menu-item ${active ? 'active' : ''}" data-search="${node.label.toLowerCase()}"><span class="mi-icon">${node.icon}</span><span class="mi-label">${node.label}</span>${badge}</a>`;
    }
    const visibleItems = node.items.filter(it => !it.roles || it.roles.includes(profile.role));
    if (!visibleItems.length) return '';
    const hasActive = visibleItems.some(it => it.href === activePage);
    let isOpen = hasActive || !!openState[node.id];
    if (hasActive && !openState[node.id]) { openState[node.id] = true; setOpenFolders(openState); }
    const submenu = visibleItems.map(it => {
      const active = activePage === it.href;
      const badge = it.badge ? `<span class="mi-badge" data-badge="${it.badge}">—</span>` : '';
      return `<a href="${it.href}" class="submenu-item ${active ? 'active' : ''}" data-search="${it.label.toLowerCase()}"><span class="mi-icon">${it.icon}</span><span class="mi-label">${it.label}</span>${badge}</a>`;
    }).join('');
    return `<div class="menu-folder ${isOpen ? 'open' : ''}" data-folder="${node.id}"><button type="button" class="folder-header"><span class="mi-icon">${node.icon}</span><span class="mi-label">${node.label}</span><span class="folder-arrow">▾</span></button><div class="folder-items">${submenu}</div></div>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <header class="top">
      <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu"><span></span><span></span><span></span></button>
      <h1>🏫 ${title || 'School Management'}</h1>
      <div class="user"><span>${profile.full_name || 'User'} · ${profile.role}</span><button id="logoutBtn">Logout</button></div>
    </header>
    <div class="sidebar-overlay" id="sidebarOverlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-search" id="sidebarSearchBox">
        <input type="text" id="sidebarSearchInput" placeholder="মেনু খুঁজুন..." autocomplete="off">
        <button class="sidebar-search-clear" id="sidebarSearchClear" type="button" aria-label="Clear">✕</button>
      </div>
      <div id="sidebarMenu">${menuHtml}</div>
      <div class="sidebar-search-no-result" id="sidebarNoResult" style="display:none">🔍 কিছু পাওয়া যায়নি</div>
    </aside>
    <main class="content" id="content"></main>
    <div id="toast"></div>
  `;

  document.getElementById('logoutBtn').onclick = logout;
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  function closeSidebar() { sidebar.classList.remove('mobile-open'); overlay.classList.remove('show'); document.body.classList.remove('sidebar-open'); }
  function openSidebar() { sidebar.classList.add('mobile-open'); overlay.classList.add('show'); document.body.classList.add('sidebar-open'); }
  hamburger.onclick = () => { if (sidebar.classList.contains('mobile-open')) closeSidebar(); else openSidebar(); };
  overlay.onclick = closeSidebar;

  document.querySelectorAll('.menu-item, .submenu-item').forEach(a => {
    a.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); });
  });
  document.querySelectorAll('.menu-folder').forEach(folder => {
    const header = folder.querySelector('.folder-header');
    header.onclick = () => {
      if (sidebar.classList.contains('searching')) return;
      folder.classList.toggle('open');
      const state = getOpenFolders();
      state[folder.dataset.folder] = folder.classList.contains('open');
      setOpenFolders(state);
    };
  });

  const searchBox = document.getElementById('sidebarSearchBox');
  const searchInput = document.getElementById('sidebarSearchInput');
  const searchClear = document.getElementById('sidebarSearchClear');
  const noResult = document.getElementById('sidebarNoResult');

  function performSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      sidebar.classList.remove('searching');
      searchBox.classList.remove('has-value');
      noResult.style.display = 'none';
      document.querySelectorAll('.search-match').forEach(el => el.classList.remove('search-match'));
      return;
    }
    sidebar.classList.add('searching');
    searchBox.classList.add('has-value');
    let matchCount = 0;
    document.querySelectorAll('.submenu-item').forEach(el => {
      const label = (el.dataset.search || '').toLowerCase();
      if (label.includes(q)) { el.classList.add('search-match'); matchCount++; const folder = el.closest('.menu-folder'); if (folder) folder.classList.add('search-match'); }
      else el.classList.remove('search-match');
    });
    document.querySelectorAll('.menu-item').forEach(el => {
      const label = (el.dataset.search || '').toLowerCase();
      if (label.includes(q)) { el.classList.add('search-match'); matchCount++; }
      else el.classList.remove('search-match');
    });
    document.querySelectorAll('.menu-folder').forEach(folder => {
      const hasMatch = folder.querySelector('.submenu-item.search-match');
      if (!hasMatch) folder.classList.remove('search-match');
    });
    noResult.style.display = matchCount === 0 ? 'block' : 'none';
  }
  searchInput.oninput = performSearch;
  searchClear.onclick = () => { searchInput.value = ''; performSearch(); searchInput.focus(); };
  searchInput.onkeydown = (e) => { if (e.key === 'Escape') { searchInput.value = ''; performSearch(); } };

  // ✅ Auto-hide dead links after menu is rendered
  setTimeout(() => hideDeadLinks(), 150);

  (async () => {
    const badges = await loadBadgeCounts(profile.role);
    document.querySelectorAll('[data-badge]').forEach(el => {
      const key = el.dataset.badge;
      const val = badges[key];
      if (val !== undefined && val > 0) el.textContent = val > 999 ? '999+' : val;
      else if (val === 0) el.textContent = '0';
      else el.style.display = 'none';
    });
  })();
}

export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = type; }, 2500);
}

export function esc(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function debounce(fn, delay = 300) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}