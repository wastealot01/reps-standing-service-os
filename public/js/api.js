const API = (() => {
  function getToken() { return localStorage.getItem('reps_token'); }
  function setToken(t) { localStorage.setItem('reps_token', t); }
  function clearToken() { localStorage.removeItem('reps_token'); }

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, { ...options, headers });
    if (res.status === 401 && token) {
      clearToken();
      window.location.reload();
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ? JSON.stringify(body.error) : `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) return res.blob();
    return res.json();
  }

  return {
    getToken, setToken, clearToken,
    signup: (email, password) => request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
    redeemInvite: (email, password, inviteCode) => request('/auth/invite/redeem', { method: 'POST', body: JSON.stringify({ email, password, inviteCode }) }),
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    getProperties: () => request('/properties'),
    addProperty: (name) => request('/properties', { method: 'POST', body: JSON.stringify({ name }) }),
    removeProperty: (id) => request(`/properties/${id}`, { method: 'DELETE' }),
    addEntry: (entry) => request('/entries', { method: 'POST', body: JSON.stringify(entry) }),
    getEntries: () => request('/entries'),
    getDashboard: () => request('/entries/dashboard'),
    updateSettings: (annualBaseHours) => request('/settings', { method: 'PATCH', body: JSON.stringify({ annualBaseHours }) }),
    exportCsv: async () => {
      const token = getToken();
      const res = await fetch('/api/export/csv', { headers: { Authorization: `Bearer ${token}` } });
      return res.blob();
    },
    getOutlookStatus: () => request('/outlook/status'),
    connectOutlookUrl: () => `/api/outlook/connect?token=${encodeURIComponent(getToken())}`,
    getOutlookEvents: () => request('/outlook/events'),
    disconnectOutlook: () => request('/outlook/disconnect', { method: 'POST' }),
    getOutlookSuggestions: () => request('/outlook/suggestions'),
    dismissOutlookSuggestion: (id) => request(`/outlook/suggestions/${id}/dismiss`, { method: 'POST' }),
    approveOutlookSuggestion: (id) => request(`/outlook/suggestions/${id}/approve`, { method: 'POST' }),
  };
})();
