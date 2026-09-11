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
  selectedCategories: [CATEGORIES[0].id],
  hours: 1,
  note: '',
  evidence: '',
  entryDate: new Date().toISOString().slice(0, 10),
  properties: [],
  selectedProperty: null,
  entries: [],
  dashboard: null,
  addingProperty: false,
  error: '',
  outlookConnected: null,
  outlookEvents: [],
  showOutlookEvents: false,
  outlookSuggestions: [],
  pendingSuggestionId: null,
  saveStatus: '',
  saveMsgText: '',
  showWalkthrough: false,
  walkthroughStep: 0,
  showOutlookInfo: false,
};

function render() {
  if (state.screen === 'auth') return renderAuth();
  return renderApp();
}

function authHelperText() {
  if (state.authMode === 'signup') {
    return "First time setting this up? Start here — you'll get an invite code afterward to share with your spouse.";
  }
  if (state.authMode === 'redeem') {
    return 'Your spouse already created the household? Enter the invite code they gave you.';
  }
  return '';
}

function renderAuth() {
  root.innerHTML = `
    <div class="auth-card">
      <div class="auth-header">
        <div class="mark mark-lg">${markSvg(26)}</div>
        <div class="brand-name">REPS Standing</div>
      </div>

      <div class="intro-panel">
        <p>REPS Standing helps you track hours toward Real Estate Professional Status (IRC §469). Log qualifying activity in seconds, and export a CPA-ready report each year.</p>
      </div>

      <div class="tabs">
        <div class="tabbtn ${state.authMode === 'login' ? 'active' : ''}" data-mode="login">Log In</div>
        <div class="tabbtn ${state.authMode === 'signup' ? 'active' : ''}" data-mode="signup">New Household</div>
        <div class="tabbtn ${state.authMode === 'redeem' ? 'active' : ''}" data-mode="redeem">Join as Spouse</div>
      </div>
      ${authHelperText() ? `<p class="tab-hint">${authHelperText()}</p>` : ''}

      <form id="authForm">
        <input class="input" type="email" name="email" placeholder="Email" autocapitalize="none" autocorrect="off" spellcheck="false" required />
        <input class="input" type="password" name="password" placeholder="Password (at least 8 characters)" minlength="8" required />
        ${state.authMode === 'redeem' ? '<input class="input" name="inviteCode" placeholder="Invite code from your spouse" required />' : ''}
        <button class="cta" type="submit">${authSubmitLabel()}</button>
      </form>
      ${state.error ? `<div class="error">${state.error}</div>` : ''}

      <div class="disclaimer">
        REPS Standing is an hour-tracking tool only. It does not provide tax, legal, or financial advice, and does not determine or guarantee your eligibility for Real Estate Professional Status. This tool makes no representation as to the accuracy of self-reported entries and is not responsible for any tax position taken based on data recorded here. Consult a qualified CPA or tax attorney before relying on this information for tax filing purposes.
      </div>
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
      await loadOutlookState();
      let seenWalkthrough = false;
      try { seenWalkthrough = !!localStorage.getItem('reps-walkthrough-seen'); } catch (e) {}
      if (!seenWalkthrough) { state.showWalkthrough = true; state.walkthroughStep = 0; }
      render();
    } catch (err) {
      state.error = err.message;
      render();
    }
  };
}

async function loadOutlookState() {
  try {
    const status = await API.getOutlookStatus();
    state.outlookConnected = status.connected;
    if (state.outlookConnected) {
      state.outlookSuggestions = await API.getOutlookSuggestions();
    }
  } catch (err) {
    state.outlookConnected = false;
  }
}

function authSubmitLabel() {
  if (state.authMode === 'login') return 'Log In';
  if (state.authMode === 'signup') return 'Create Household';
  return 'Join Household';
}

function markSvg(size) {
  const s = size || 13;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"><path d="M4 16l6-8 4 5 6-9" stroke="#D8AA6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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

const WALKTHROUGH_STEPS = [
  {
    title: 'Welcome to REPS Standing',
    body: 'This tracks your hours toward Real Estate Professional Status, the IRS test that lets your rental losses offset other income if you clear 750 hours a year and materially participate. A quick tour, four steps.',
  },
  {
    title: 'Add your property',
    body: 'On the Log tab, tap "+ Add property" and name the deal you\'re invested in. You only do this once per property, then it\'s there every time you log hours.',
  },
  {
    title: 'Log activity in seconds',
    body: 'Check off everything you did, more than one is fine, dial in the hours, and add a quick note. If Outlook is connected, you can pull the note straight from a real calendar event instead of typing it.',
  },
  {
    title: 'Watch your progress',
    body: 'The Dashboard tab shows both IRS tests at a glance and tells you if you\'re ahead of or behind pace for 750 hours. At year end, export a CPA-ready report in one tap.',
  },
];

function renderWalkthrough() {
  const step = WALKTHROUGH_STEPS[state.walkthroughStep];
  const isLast = state.walkthroughStep === WALKTHROUGH_STEPS.length - 1;
  return `
    <div class="wt-overlay" id="wtOverlay">
      <div class="wt-modal">
        <div class="wt-dots">
          ${WALKTHROUGH_STEPS.map((_, i) => `<div class="wt-dot ${i === state.walkthroughStep ? 'active' : ''}"></div>`).join('')}
        </div>
        <div class="wt-title">${step.title}</div>
        <div class="wt-body">${step.body}</div>
        <div class="wt-actions">
          <div class="wt-skip" id="wtSkip">${isLast ? '' : 'Skip'}</div>
          <div style="display:flex; gap:8px;">
            ${state.walkthroughStep > 0 ? '<div class="wt-btn wt-btn-secondary" id="wtBack">Back</div>' : ''}
            <div class="wt-btn" id="wtNext">${isLast ? 'Done' : 'Next'}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function closeWalkthrough() {
  state.showWalkthrough = false;
  try { localStorage.setItem('reps-walkthrough-seen', '1'); } catch (e) {}
  renderApp();
}

function bindWalkthroughEvents() {
  const skip = document.getElementById('wtSkip');
  if (skip) skip.onclick = closeWalkthrough;
  const back = document.getElementById('wtBack');
  if (back) back.onclick = () => { state.walkthroughStep -= 1; renderApp(); };
  const next = document.getElementById('wtNext');
  if (next) next.onclick = () => {
    if (state.walkthroughStep === WALKTHROUGH_STEPS.length - 1) closeWalkthrough();
    else { state.walkthroughStep += 1; renderApp(); }
  };
}

function renderOutlookInfoModal() {
  return `
    <div class="wt-overlay" id="outlookInfoOverlay">
      <div class="wt-modal">
        <div class="wt-title">Connect your Outlook calendar</div>
        <div class="wt-body">
          Clicking continue opens a real Microsoft sign-in window, this app never sees your
          password. Once you approve it, REPS Standing can read your calendar events from the
          last 7 days, read-only, nothing is ever created, changed, or deleted on your calendar.
          <br><br>
          That lets you pick a real meeting to prefill a log entry's note, instead of retyping
          what it was about. You can disconnect this anytime.
        </div>
        <div class="wt-actions">
          <div class="wt-skip" id="outlookInfoCancel">Cancel</div>
          <div class="wt-btn" id="outlookInfoContinue">Continue to Microsoft</div>
        </div>
      </div>
    </div>
  `;
}

function renderApp() {
  root.innerHTML = `
    <div class="card">
      <div class="topbar">
        <div class="brand-sm">${markSvg(13)} REPS Standing</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="help-btn" id="helpBtn" title="How to use REPS Standing">?</div>
          <div class="profile-btn" id="logoutBtn">Log out</div>
        </div>
      </div>
      <div class="content" id="content"></div>
      <div class="tabbar">
        <div class="tab ${state.screen === 'log' ? 'active' : ''}" data-screen="log">LOG</div>
        <div class="tab ${state.screen === 'dashboard' ? 'active' : ''}" data-screen="dashboard">DASHBOARD</div>
      </div>
    </div>
    ${state.showWalkthrough ? renderWalkthrough() : ''}
    ${state.showOutlookInfo ? renderOutlookInfoModal() : ''}
  `;
  document.getElementById('logoutBtn').onclick = () => { API.clearToken(); state.screen = 'auth'; render(); };
  document.getElementById('helpBtn').onclick = () => { state.walkthroughStep = 0; state.showWalkthrough = true; renderApp(); };

  const outlookCancel = document.getElementById('outlookInfoCancel');
  if (outlookCancel) outlookCancel.onclick = () => { state.showOutlookInfo = false; renderApp(); };
  const outlookContinue = document.getElementById('outlookInfoContinue');
  if (outlookContinue) outlookContinue.onclick = () => { window.location.href = API.connectOutlookUrl(); };
  document.querySelectorAll('.tab').forEach(el => {
    el.onclick = async () => {
      state.screen = el.dataset.screen;
      if (state.screen === 'dashboard') await loadDashboard();
      render();
    };
  });

  if (state.showWalkthrough) bindWalkthroughEvents();

  if (state.screen === 'log') renderLogScreen();
  else renderDashboardScreen();
}

function renderSuggestionsSection() {
  if (!state.outlookConnected || state.outlookSuggestions.length === 0) return '';
  return `
    <div class="suggest-panel">
      <div class="suggest-header">Suggested from your calendar (${state.outlookSuggestions.length})</div>
      ${state.outlookSuggestions.map((s, i) => `
        <div class="suggest-item">
          <div class="suggest-info">
            <div class="t">${escapeHtml(s.subject || '(no subject)')}</div>
            <div class="d">${new Date(s.event_start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              ${s.suggested_category_ids && s.suggested_category_ids.length > 0
                ? ' · ' + s.suggested_category_ids.map(id => { const c = findLocalCategory(id); return c ? c.name : id; }).join(', ')
                : ' · no category match, pick manually'}
            </div>
          </div>
          <div class="suggest-actions">
            <div class="suggest-use" data-idx="${i}">Log this</div>
            <div class="suggest-dismiss" data-dismiss-idx="${i}">×</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function findLocalCategory(id) {
  return CATEGORIES.find(c => c.id === id);
}

function renderOutlookSection() {
  if (state.outlookConnected === null) return '';
  if (!state.outlookConnected) {
    return `
      <div class="outlook-row">
        <span class="outlook-text">Pull today's activity straight from your calendar.</span>
        <div class="outlook-btn" id="connectOutlookBtn">Connect Outlook</div>
      </div>
    `;
  }
  return `
    <div class="outlook-row">
      <span class="outlook-text">Outlook connected.</span>
      <div class="outlook-btn" id="importOutlookBtn">${state.showOutlookEvents ? 'Hide events' : 'Import from Outlook'}</div>
    </div>
    ${state.showOutlookEvents ? `
      <div class="outlook-events" id="outlookEventsList">
        ${state.outlookEvents.length === 0 ? '<div class="empty">Loading recent events…</div>' : ''}
        ${state.outlookEvents.map((e, i) => `
          <div class="outlook-event" data-idx="${i}">
            <div class="t">${escapeHtml(e.subject || '(no subject)')}</div>
            <div class="d">${new Date(e.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function renderLogScreen() {
  const content = document.getElementById('content');
  const noProps = state.properties.length === 0;
  content.innerHTML = `
    <div class="log-grid">
    <div class="log-col-left">
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

    ${renderSuggestionsSection()}
    ${renderOutlookSection()}

    <span class="label" style="margin-top:16px; display:block;">What did you do (select all that apply)</span>
    <div id="catList">
      ${CATEGORIES.map(c => `
        <div class="check ${state.selectedCategories.includes(c.id) ? 'sel' : ''}" data-cat="${c.id}">
          <div style="flex:1;"><div class="name">${c.name}</div><div class="meta">${c.statute}</div></div>
          <div class="checkbox"></div>
        </div>
      `).join('')}
    </div>
    </div>

    <div class="log-col-right">
    <span class="label">Date</span>
    <input class="input" type="date" id="entryDateInput" value="${state.entryDate}" max="${new Date().toISOString().slice(0, 10)}" />

    <span class="label" style="margin-top:14px; display:block;">Hours spent</span>
    <div class="stepper">
      <span style="font-size:12px; color:var(--w70);">Time on this activity</span>
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="step-btn" id="stepDown">–</div>
        <div class="step-val" id="stepVal">${state.hours}</div>
        <div class="step-btn" id="stepUp">+</div>
      </div>
    </div>

    <span class="label">Note</span>
    <textarea class="textarea" id="noteInput" rows="2" placeholder="One line on what you did…">${escapeHtml(state.note)}</textarea>
    <span class="label">Evidence reference (optional)</span>
    <textarea class="textarea" id="evidenceInput" rows="2" placeholder="e.g. calendar invite title, email subject">${escapeHtml(state.evidence)}</textarea>

    <button class="cta" id="saveBtn" ${!state.selectedProperty ? 'disabled' : ''}>${state.selectedProperty ? 'Save Entry' : 'Add a property to log hours'}</button>
    <div class="savemsg ${state.saveStatus ? 'show ' + state.saveStatus : ''}" id="saveMsg">${state.saveMsgText || ''}</div>
    </div>
    </div>
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

  const connectBtn = document.getElementById('connectOutlookBtn');
  if (connectBtn) connectBtn.onclick = () => { state.showOutlookInfo = true; renderApp(); };

  const importBtn = document.getElementById('importOutlookBtn');
  if (importBtn) {
    importBtn.onclick = async () => {
      state.showOutlookEvents = !state.showOutlookEvents;
      if (state.showOutlookEvents && state.outlookEvents.length === 0) {
        renderLogScreen();
        try {
          state.outlookEvents = await API.getOutlookEvents();
        } catch (err) {
          state.outlookEvents = [];
        }
      }
      renderLogScreen();
    };
  }
  document.querySelectorAll('.outlook-event').forEach(el => {
    el.onclick = () => {
      const event = state.outlookEvents[Number(el.dataset.idx)];
      if (!event) return;
      state.note = event.subject || '';
      state.evidence = `Outlook calendar event: "${event.subject}"`;
      const eventDate = new Date(event.start).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      state.entryDate = eventDate <= today ? eventDate : today;
      state.showOutlookEvents = false;
      renderLogScreen();
    };
  });
  document.querySelectorAll('.suggest-use').forEach(el => {
    el.onclick = () => {
      const s = state.outlookSuggestions[Number(el.dataset.idx)];
      if (!s) return;
      state.note = s.subject || '';
      state.evidence = `Outlook calendar event: "${s.subject}"`;
      const eventDate = new Date(s.event_start).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      state.entryDate = eventDate <= today ? eventDate : today;
      if (s.suggested_category_ids && s.suggested_category_ids.length > 0) {
        state.selectedCategories = s.suggested_category_ids.slice();
      }
      state.pendingSuggestionId = s.id;
      renderLogScreen();
    };
  });
  document.querySelectorAll('.suggest-dismiss').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const s = state.outlookSuggestions[Number(el.dataset.dismissIdx)];
      if (!s) return;
      state.outlookSuggestions = state.outlookSuggestions.filter(x => x.id !== s.id);
      renderLogScreen();
      try { await API.dismissOutlookSuggestion(s.id); } catch (err) {}
    };
  });
  document.querySelectorAll('#catList .check').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.cat;
      const i = state.selectedCategories.indexOf(id);
      if (i === -1) state.selectedCategories.push(id);
      else if (state.selectedCategories.length > 1) state.selectedCategories.splice(i, 1);
      renderLogScreen();
    };
  });
  document.getElementById('stepDown').onclick = () => { state.hours = Math.max(0.5, +(state.hours - 0.5).toFixed(1)); document.getElementById('stepVal').textContent = state.hours; };
  document.getElementById('stepUp').onclick = () => { state.hours = +(state.hours + 0.5).toFixed(1); document.getElementById('stepVal').textContent = state.hours; };
  document.getElementById('noteInput').oninput = (e) => { state.note = e.target.value; };
  document.getElementById('evidenceInput').oninput = (e) => { state.evidence = e.target.value; };
  document.getElementById('entryDateInput').onchange = (e) => { state.entryDate = e.target.value; };

  const saveBtn = document.getElementById('saveBtn');
  if (state.selectedProperty) {
    saveBtn.onclick = async () => {
      try {
        await API.addEntry({
          propertyId: state.selectedProperty,
          categoryIds: state.selectedCategories,
          hours: state.hours,
          note: state.note,
          evidenceReference: state.evidence,
          entryDate: state.entryDate,
        });
        if (state.pendingSuggestionId) {
          const approvedId = state.pendingSuggestionId;
          state.outlookSuggestions = state.outlookSuggestions.filter(s => s.id !== approvedId);
          state.pendingSuggestionId = null;
          API.approveOutlookSuggestion(approvedId).catch(() => {});
        }
        state.hours = 1;
        state.selectedCategories = [CATEGORIES[0].id];
        state.note = '';
        state.evidence = '';
        state.entryDate = new Date().toISOString().slice(0, 10);
        state.saveStatus = 'success';
        state.saveMsgText = '✓ Entry saved';
        renderLogScreen();
        setTimeout(() => {
          state.saveStatus = '';
          state.saveMsgText = '';
          const m = document.getElementById('saveMsg');
          if (m) { m.className = 'savemsg'; m.textContent = ''; }
        }, 2600);
      } catch (err) {
        state.saveStatus = 'error';
        state.saveMsgText = err.message;
        renderLogScreen();
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
    <div class="dash-grid">
    <div class="dash-col-left">
    <div class="title">${d.year} year to date</div>
    <div class="sub">Two tests. One clear picture.</div>

    <div class="progress-panel">
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

    <div class="panel-divider"></div>

    <div class="settings-row">
      <span style="font-size:11.5px; color:var(--w70);">Total annual working hours</span>
      <input class="num-input" type="number" id="baseInput" value="${d.annualBaseHours}" />
    </div>

    <div class="pace ${d.totalHours === 0 ? 'pace-neutral' : ''}">
      ${d.totalHours === 0
        ? 'Log your first activity on the Log tab to start tracking progress toward 750 hours.'
        : d.paceDiff >= 0
          ? `You're ${d.paceDiff} hours ahead of pace to hit 750 by December 31.`
          : `You're ${Math.abs(d.paceDiff)} hours behind pace — worth catching up this month.`}
    </div>
    </div>
    </div>

    <div class="dash-col-right">
    <span class="label">Recent activity</span>
    ${state.entries.length === 0 ? '<div class="empty">No entries logged yet.</div>' : ''}
    ${state.entries.slice(0, 8).map(e => `
      <div class="log-item">
        <div class="log-detail"><div class="t">${(e.categories || []).map(c => c.name).join(', ')} — ${escapeHtml(e.property_name)}</div><div class="d">${e.entry_date}</div></div>
        <div class="log-hrs">${e.hours}h</div>
      </div>
    `).join('')}

    <button class="export-btn" id="exportBtn" ${state.entries.length === 0 ? 'disabled' : ''}>Export year-end CPA packet</button>
    </div>
    </div>
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
    await loadOutlookState();
  }
  render();
})();
