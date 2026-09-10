const CATEGORIES = [
  { id: 'inspection', name: 'Property inspection / site visit', statute: 'Operation, management' },
  { id: 'financials', name: 'Financial statement / P&L review', statute: 'Operation, management' },
  { id: 'leasing', name: 'Leasing activity', statute: 'Leasing' },
  { id: 'vendor', name: 'Vendor / contractor coordination', statute: 'Operation, construction' },
  { id: 'acquisition', name: 'Acquisition due diligence / underwriting', statute: 'Acquisition' },
  { id: 'construction', name: 'Construction / capital improvement oversight', statute: 'Construction, redevelopment' },
  { id: 'financing', name: 'Financing / lender calls, loan review', statute: 'Acquisition, operation' },
  { id: 'investor', name: 'Property-specific investor / partner meetings', statute: 'Operation, management' },
  { id: 'staff', name: 'Staff / property manager supervision', statute: 'Operation, management' },
];

const root = document.getElementById('root');
let state = {
  screen: API.getToken() ? 'log' : 'auth',
  authMode: 'login', // 'login' | 'signup' | 'redeem'
  selectedCategory: CATEGORIES[0].id,
  hours: 1,
  properties: [],
  selectedProperty: null,
  entries: [],
  dashboard: null,
  addingProperty: false,
  error: '',
};

function render() {
  if (state.screen === 'auth') return renderAuth();
  return renderApp();
}

function authHelperText() {
  if (state.authMode === 'signup') {
    return "Setting this up for the first time? Start here, you'll get an invite code afterward to share with your spouse.";
  }
  if (state.authMode === 'redeem') {
    return 'Your spouse already set this up? Enter the invite code they gave you.';
  }
  return '';
}

function renderAuth() {
  root.innerHTML = `
    <div class="auth-card">
      <div class="brand"><div class="mark">${markSvg()}</div>REPS Standing</div>
      <div class="tagline">Track your hours toward Real Estate Professional Status</div>
      <div class="tabs">
        <div class="tabbtn ${state.authMode === 'login' ? 'active' : ''}" data-mode="login">Log In</div>
        <div class="tabbtn ${state.authMode === 'signup' ? 'active' : ''}" data-mode="signup">New Household</div>
        <div class="tabbtn ${state.authMode === 'redeem' ? 'active' : ''}" data-mode="redeem">Join as Spouse</div>
      </div>
      ${authHelperText() ? `<p class="tab-hint">${authHelperText()}</p>` : ''}
      <form id="authForm">
        <input class="input" type="email" name="email" placeholder="Email" required />
        <input class="input" type="password" name="password" placeholder="Password (at least 8 characters)" minlength="8" required />
        ${state.authMode === 'redeem' ? '<input class="input" name="inviteCode" placeholder="Invite code from your spouse" required />' : ''}
        <button class="cta" type="submit">${authSubmitLabel()}</button>
      </form>
      ${state.error ? `<div class="error">${state.error}</div>` : ''}
      ${state.authMode === 'signup' ? '<p class="hint">Creates a new household. You will get an invite code to share with your spouse.</p>' : ''}
    </div>
  `;

  document.querySelectorAll('.tabbtn').forEach(el => {
    el.onclick = () => { state.authMode = el.dataset.mode; state.error = ''; render(); };
  });

  document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const password = fd.get('password');
    try {
      let result;
      if (state.authMode === 'login') result = await API.login(email, password);
      else if (state.authMode === 'signup') {
        result = await API.signup(email, password);
        alert(`Household created. Your spouse invite code is: ${result.inviteCode}\nShare this with your spouse so they can join their own account.`);
      } else {
        result = await API.redeemInvite(email, password, fd.get('inviteCode'));
      }
      API.setToken(result.token);
      state.screen = 'log';
      state.error = '';
      await loadProperties();
      render();
    } catch (err) {
      state.error = err.message;
      render();
    }
  };
}

function authSubmitLabel() {
  if (state.authMode === 'login') return 'Log In';
  if (state.authMode === 'signup') return 'Create Household';
  return 'Join Household';
}

function markSvg() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M4 16l6-8 4 5 6-9" stroke="#D8AA6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function loadProperties() {
  state.properties = await API.getProperties();
  if (!state.selectedProperty && state.properties.length > 0) {
    state.selectedProperty = state.properties[0].id;
  }
}

async function loadDashboard() {
  state.dashboard = await API.getDashboard();
  state.entries = await API.getEntries();
}

function renderApp() {
  root.innerHTML = `
    <div class="card">
      <div class="topbar">
        <div class="brand-sm">${markSvg()} REPS Standing</div>
        <div class="profile-btn" id="logoutBtn">Log out</div>
      </div>
      <div class="content" id="content"></div>
      <div class="tabbar">
        <div class="tab ${state.screen === 'log' ? 'active' : ''}" data-screen="log">LOG</div>
        <div class="tab ${state.screen === 'dashboard' ? 'active' : ''}" data-screen="dashboard">DASHBOARD</div>
      </div>
    </div>
  `;
  document.getElementById('logoutBtn').onclick = () => { API.clearToken(); state.screen = 'auth'; render(); };
  document.querySelectorAll('.tab').forEach(el => {
    el.onclick = async () => {
      state.screen = el.dataset.screen;
      if (state.screen === 'dashboard') await loadDashboard();
      render();
    };
  });

  if (state.screen === 'log') renderLogScreen();
  else renderDashboardScreen();
}

function renderLogScreen() {
  const content = document.getElementById('content');
  const noProps = state.properties.length === 0;
  content.innerHTML = `
    <div class="title">Log today's work</div>
    <div class="sub">Pick a property, tap what you did, done.</div>

    ${noProps ? `
      <div class="welcome">
        <h3>Welcome to REPS Standing</h3>
        <p>This tracks your hours toward Real Estate Professional Status, the IRS test that lets your rental losses offset other income, if you clear 750 hours a year and materially participate.</p>
        <div class="step"><div class="num">1</div><span>Add the property you're invested in below</span></div>
        <div class="step"><div class="num">2</div><span>Each time you do qualifying work, tap the activity and log the hours</span></div>
        <div class="step"><div class="num">3</div><span>Check the Dashboard tab anytime, export a CPA-ready report at year end</span></div>
      </div>
    ` : ''}

    <span class="label">Property</span>
    <div class="pillrow" id="pillrow">
      ${state.properties.map(p => `
        <div class="pill ${state.selectedProperty === p.id ? 'active' : ''}" data-id="${p.id}">
          ${escapeHtml(p.name)} <span class="pill-x" data-remove="${p.id}">×</span>
        </div>
      `).join('')}
      <div class="pill add" id="addPropertyBtn">+ Add property</div>
    </div>
    <div class="addrow ${state.addingProperty ? 'show' : ''}" id="addRow">
      <input class="addinput" id="newPropInput" placeholder="e.g. Maple Ridge Apartments" />
      <button class="addbtn" id="addPropSubmit">Add</button>
    </div>

    <span class="label" style="margin-top:16px; display:block;">What did you do</span>
    <div id="catList">
      ${CATEGORIES.map(c => `
        <div class="check ${state.selectedCategory === c.id ? 'sel' : ''}" data-cat="${c.id}">
          <div style="flex:1;"><div class="name">${c.name}</div><div class="meta">${c.statute}</div></div>
          <div class="radio"></div>
        </div>
      `).join('')}
    </div>

    <span class="label">Hours spent</span>
    <div class="stepper">
      <span style="font-size:12px; color:var(--w70);">Time on this activity</span>
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="step-btn" id="stepDown">–</div>
        <div class="step-val" id="stepVal">${state.hours}</div>
        <div class="step-btn" id="stepUp">+</div>
      </div>
    </div>

    <span class="label">Note</span>
    <textarea class="textarea" id="noteInput" rows="2" placeholder="One line on what you did…"></textarea>
    <span class="label">Evidence reference (optional)</span>
    <textarea class="textarea" id="evidenceInput" rows="2" placeholder="e.g. calendar invite title, email subject"></textarea>

    <button class="cta" id="saveBtn" ${!state.selectedProperty ? 'disabled' : ''}>${state.selectedProperty ? 'Save Entry' : 'Add a property to log hours'}</button>
    <div class="savemsg" id="saveMsg"></div>
  `;

  document.querySelectorAll('#pillrow .pill[data-id]').forEach(el => {
    el.onclick = () => { state.selectedProperty = el.dataset.id; renderLogScreen(); };
  });
  document.querySelectorAll('[data-remove]').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      await API.removeProperty(el.dataset.remove);
      await loadProperties();
      renderLogScreen();
    };
  });
  document.getElementById('addPropertyBtn').onclick = () => { state.addingProperty = true; renderLogScreen(); document.getElementById('newPropInput').focus(); };
  document.getElementById('addPropSubmit').onclick = async () => {
    const name = document.getElementById('newPropInput').value.trim();
    if (!name) return;
    const created = await API.addProperty(name);
    state.addingProperty = false;
    await loadProperties();
    state.selectedProperty = created.id;
    renderLogScreen();
  };
  document.querySelectorAll('#catList .check').forEach(el => {
    el.onclick = () => { state.selectedCategory = el.dataset.cat; renderLogScreen(); };
  });
  document.getElementById('stepDown').onclick = () => { state.hours = Math.max(0.5, +(state.hours - 0.5).toFixed(1)); document.getElementById('stepVal').textContent = state.hours; };
  document.getElementById('stepUp').onclick = () => { state.hours = +(state.hours + 0.5).toFixed(1); document.getElementById('stepVal').textContent = state.hours; };

  const saveBtn = document.getElementById('saveBtn');
  if (state.selectedProperty) {
    saveBtn.onclick = async () => {
      try {
        await API.addEntry({
          propertyId: state.selectedProperty,
          categoryId: state.selectedCategory,
          hours: state.hours,
          note: document.getElementById('noteInput').value,
          evidenceReference: document.getElementById('evidenceInput').value,
        });
        document.getElementById('saveMsg').textContent = 'Entry saved';
        document.getElementById('noteInput').value = '';
        document.getElementById('evidenceInput').value = '';
        state.hours = 1;
        setTimeout(() => { const m = document.getElementById('saveMsg'); if (m) m.textContent = ''; }, 2200);
        renderLogScreen();
      } catch (err) {
        document.getElementById('saveMsg').textContent = err.message;
      }
    };
  }
}

function renderDashboardScreen() {
  const content = document.getElementById('content');
  const d = state.dashboard;
  if (!d) { content.innerHTML = '<div class="empty">Loading…</div>'; return; }

  const circ = 2 * Math.PI * 30;
  content.innerHTML = `
    <div class="title">${d.year} year to date</div>
    <div class="sub">Two tests. One clear picture.</div>

    <div class="ring-row">
      <div class="ring-card">
        <div class="ring-wrap">
          <svg width="76" height="76" style="transform:rotate(-90deg)">
            <circle cx="38" cy="38" r="30" stroke="rgba(255,255,255,0.1)" stroke-width="6" fill="none"/>
            <circle cx="38" cy="38" r="30" stroke="#D8AA6E" stroke-width="6" fill="none" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - d.pctThreshold / 100)}"/>
          </svg>
          <div class="ring-num">${d.pctThreshold}%</div>
        </div>
        <div class="ring-title">${d.totalHours} / 750 hrs</div>
        <div class="ring-sub">${d.paceDiff >= 0 ? `${d.paceDiff} hrs ahead of pace` : `${Math.abs(d.paceDiff)} hrs behind pace`}</div>
      </div>
      <div class="ring-card">
        <div class="ring-wrap">
          <svg width="76" height="76" style="transform:rotate(-90deg)">
            <circle cx="38" cy="38" r="30" stroke="rgba(255,255,255,0.1)" stroke-width="6" fill="none"/>
            <circle cx="38" cy="38" r="30" stroke="#E8C594" stroke-width="6" fill="none" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - d.pctTimeshare / 100)}"/>
          </svg>
          <div class="ring-num">${d.pctTimeshare}%</div>
        </div>
        <div class="ring-title">Time-share test</div>
        <div class="ring-sub">Of ${d.annualBaseHours} total work hrs</div>
      </div>
    </div>

    <div class="settings-row">
      <span style="font-size:11.5px; color:var(--w70);">Total annual working hours</span>
      <input class="num-input" type="number" id="baseInput" value="${d.annualBaseHours}" />
    </div>

    <div class="pace">
      ${d.paceDiff >= 0
        ? `You're ${d.paceDiff} hours ahead of pace to hit 750 by December 31.`
        : `You're ${Math.abs(d.paceDiff)} hours behind pace — worth catching up this month.`}
    </div>

    <span class="label">Recent activity</span>
    ${state.entries.length === 0 ? '<div class="empty">No entries logged yet.</div>' : ''}
    ${state.entries.slice(0, 8).map(e => `
      <div class="log-item">
        <div class="log-detail"><div class="t">${e.category ? e.category.name : ''} — ${escapeHtml(e.property_name)}</div><div class="d">${e.entry_date}</div></div>
        <div class="log-hrs">${e.hours}h</div>
      </div>
    `).join('')}

    <button class="export-btn" id="exportBtn" ${state.entries.length === 0 ? 'disabled' : ''}>Export year-end CPA packet</button>
  `;

  document.getElementById('baseInput').onchange = async (e) => {
    await API.updateSettings(Number(e.target.value) || 1);
    await loadDashboard();
    renderDashboardScreen();
  };
  const exportBtn = document.getElementById('exportBtn');
  if (state.entries.length > 0) {
    exportBtn.onclick = async () => {
      const blob = await API.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `REPS-Standing-${d.year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

(async function init() {
  if (API.getToken()) {
    try {
      await loadProperties();
    } catch (err) {
      state.screen = 'auth';
    }
  }
  render();
})();
