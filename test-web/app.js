// ==========================================
// WhatsApp Session Manager - Test Panel JS
// ==========================================

let currentSocket = null;

// --- Helpers ---

function getApiUrl() {
  return document.getElementById('apiUrl').value.replace(/\/+$/, '');
}

function getApiKey() {
  return document.getElementById('apiKey').value.trim();
}

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = getApiKey();
  if (key) headers['x-api-key'] = key;
  return headers;
}

function showResult(elementId, data, isError = false) {
  const el = document.getElementById(elementId);
  el.classList.remove('hidden', 'success', 'error', 'info');
  el.classList.add(isError ? 'error' : 'success');
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function showInfo(elementId, data) {
  const el = document.getElementById(elementId);
  el.classList.remove('hidden', 'success', 'error', 'info');
  el.classList.add('info');
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function addSocketLog(event, data) {
  const logBox = document.getElementById('socket-log');
  const logContent = document.getElementById('socket-log-content');
  logBox.classList.remove('hidden');

  const entry = document.createElement('div');
  entry.className = `log-entry event-${event}`;
  const time = new Date().toLocaleTimeString();
  const dataStr = typeof data === 'string'
    ? (data.length > 80 ? data.substring(0, 80) + '...' : data)
    : JSON.stringify(data);
  entry.textContent = `[${time}] ${event}: ${dataStr}`;

  logContent.prepend(entry);

  // Keep max 50 entries
  while (logContent.children.length > 50) {
    logContent.removeChild(logContent.lastChild);
  }
}

function setSocketStatus(status) {
  const badge = document.getElementById('socket-status');
  badge.classList.remove('hidden', 'connected', 'disconnected', 'connecting');
  badge.classList.add(status);
  badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

async function apiCall(method, path, body = null) {
  const url = getApiUrl() + path;
  const options = {
    method,
    headers: getHeaders(),
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, data };
}

// --- Toggle Phone Field ---

function togglePhoneField() {
  const method = document.getElementById('pairingMethod').value;
  const phoneGroup = document.getElementById('phoneGroup');
  phoneGroup.style.display = method === 'code' ? 'block' : 'none';
}

// ==========================================
// 1. Health Check
// ==========================================

async function testHealth() {
  try {
    const { status, data } = await apiCall('GET', '/health');
    if (status === 200 && data.success) {
      showResult('health-result', data);
    } else {
      showResult('health-result', data, true);
    }
  } catch (err) {
    showResult('health-result', `Connection Error: ${err.message}`, true);
  }
}

// ==========================================
// 2. Create Session
// ==========================================

async function createSession() {
  try {
    const sessionId = document.getElementById('createSessionId').value.trim();
    const pairingMethod = document.getElementById('pairingMethod').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();

    const body = {};
    if (sessionId) body.sessionId = sessionId;
    body.pairingMethod = pairingMethod;
    if (pairingMethod === 'code' && phoneNumber) body.phoneNumber = phoneNumber;

    const { status, data } = await apiCall('POST', '/api/session/create', body);

    if (data.success) {
      showResult('create-result', data);

      // Auto-fill other fields with the sessionId
      const sid = data.data?.sessionId || sessionId;
      if (sid) {
        document.getElementById('qrSessionId').value = sid;
        document.getElementById('statusSessionId').value = sid;
        document.getElementById('checkSessionId').value = sid;
        document.getElementById('deleteSessionId').value = sid;
      }

      // Auto-connect socket if QR method
      if (pairingMethod === 'qr' && sid) {
        document.getElementById('qrSessionId').value = sid;
        connectSocket();
      }

      // Show pairing code if code method
      if (pairingMethod === 'code' && data.data?.pairingCode) {
        document.getElementById('pairing-code-value').textContent = data.data.pairingCode;
        document.getElementById('pairing-code-display').classList.remove('hidden');
        document.getElementById('qr-display').classList.add('hidden');
        document.getElementById('connected-display').classList.add('hidden');
        // Also connect socket to listen for connected event
        document.getElementById('qrSessionId').value = sid;
        connectSocket();
      }
    } else {
      showResult('create-result', data, true);
    }
  } catch (err) {
    showResult('create-result', `Error: ${err.message}`, true);
  }
}

// ==========================================
// 3. WebSocket / QR Code
// ==========================================

function connectSocket() {
  const sessionId = document.getElementById('qrSessionId').value.trim();
  if (!sessionId) {
    showResult('create-result', 'Session ID is required for WebSocket', true);
    return;
  }

  // Disconnect existing
  if (currentSocket) {
    currentSocket.disconnect();
    currentSocket = null;
  }

  const baseUrl = getApiUrl();

  setSocketStatus('connecting');
  addSocketLog('info', `Connecting to ${baseUrl}/${sessionId}...`);

  // Reset displays
  document.getElementById('qr-display').classList.add('hidden');
  document.getElementById('pairing-code-display').classList.add('hidden');
  document.getElementById('connected-display').classList.add('hidden');

  currentSocket = io(`${baseUrl}/${sessionId}`, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  currentSocket.on('connect', () => {
    setSocketStatus('connected');
    addSocketLog('info', `Connected (socket.id: ${currentSocket.id})`);
    document.getElementById('btnConnect').classList.add('hidden');
    document.getElementById('btnDisconnect').classList.remove('hidden');
  });

  currentSocket.on('qr', (qrBase64) => {
    addSocketLog('qr', 'QR code received (base64 image)');

    document.getElementById('qr-image').src = qrBase64;
    document.getElementById('qr-display').classList.remove('hidden');
    document.getElementById('pairing-code-display').classList.add('hidden');
    document.getElementById('connected-display').classList.add('hidden');
  });

  currentSocket.on('pairing_code', (data) => {
    addSocketLog('pairing_code', `Code: ${data.code}`);

    document.getElementById('pairing-code-value').textContent = data.code;
    document.getElementById('pairing-code-display').classList.remove('hidden');
    document.getElementById('qr-display').classList.add('hidden');
    document.getElementById('connected-display').classList.add('hidden');
  });

  currentSocket.on('connected', (data) => {
    addSocketLog('connected', `Session ${data.sessionId} connected!`);

    document.getElementById('connected-display').classList.remove('hidden');
    document.getElementById('qr-display').classList.add('hidden');
    document.getElementById('pairing-code-display').classList.add('hidden');
  });

  currentSocket.on('disconnected', (data) => {
    addSocketLog('disconnected', `Reason: ${data.reason}`);
    setSocketStatus('disconnected');

    document.getElementById('qr-display').classList.add('hidden');
    document.getElementById('pairing-code-display').classList.add('hidden');
    document.getElementById('connected-display').classList.add('hidden');
  });

  currentSocket.on('disconnect', (reason) => {
    addSocketLog('info', `Socket disconnected: ${reason}`);
    setSocketStatus('disconnected');
    document.getElementById('btnConnect').classList.remove('hidden');
    document.getElementById('btnDisconnect').classList.add('hidden');
  });

  currentSocket.on('connect_error', (err) => {
    addSocketLog('info', `Connection error: ${err.message}`);
    setSocketStatus('disconnected');
  });
}

function disconnectSocket() {
  if (currentSocket) {
    currentSocket.disconnect();
    currentSocket = null;
  }

  setSocketStatus('disconnected');
  addSocketLog('info', 'Manually disconnected');

  document.getElementById('btnConnect').classList.remove('hidden');
  document.getElementById('btnDisconnect').classList.add('hidden');
  document.getElementById('qr-display').classList.add('hidden');
  document.getElementById('pairing-code-display').classList.add('hidden');
  document.getElementById('connected-display').classList.add('hidden');
}

// ==========================================
// 4. Session Status
// ==========================================

async function checkStatus() {
  try {
    const sessionId = document.getElementById('statusSessionId').value.trim();
    if (!sessionId) {
      showResult('status-result', 'Session ID is required', true);
      return;
    }

    const { status, data } = await apiCall('GET', `/api/session/status/${sessionId}`);

    if (data.success) {
      showResult('status-result', data);
    } else {
      showResult('status-result', data, true);
    }
  } catch (err) {
    showResult('status-result', `Error: ${err.message}`, true);
  }
}

// ==========================================
// 5. List Sessions
// ==========================================

async function listSessions() {
  try {
    const { status, data } = await apiCall('GET', '/api/session/list');

    if (data.success) {
      showResult('list-result', data);

      const sessions = data.data?.sessions || [];
      const table = document.getElementById('sessions-table');
      const tbody = document.getElementById('sessions-tbody');

      tbody.innerHTML = '';

      if (sessions.length > 0) {
        table.classList.remove('hidden');
        sessions.forEach((s) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><code>${s.sessionId}</code></td>
            <td><span class="status-pill ${s.status}">${s.status}</span></td>
            <td>
              <button class="btn btn-secondary btn-small" onclick="quickStatus('${s.sessionId}')">Status</button>
              <button class="btn btn-danger btn-small" onclick="quickDelete('${s.sessionId}')">Delete</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        table.classList.add('hidden');
      }
    } else {
      showResult('list-result', data, true);
    }
  } catch (err) {
    showResult('list-result', `Error: ${err.message}`, true);
  }
}

// Quick actions from table
async function quickStatus(sessionId) {
  document.getElementById('statusSessionId').value = sessionId;
  await checkStatus();
  document.getElementById('status-card').scrollIntoView({ behavior: 'smooth' });
}

async function quickDelete(sessionId) {
  if (!confirm(`Delete session "${sessionId}"?`)) return;
  document.getElementById('deleteSessionId').value = sessionId;
  await deleteSession();
  await listSessions();
}

// ==========================================
// 6. Check Number
// ==========================================

async function checkNumberOnWA() {
  try {
    const sessionId = document.getElementById('checkSessionId').value.trim();
    const number = document.getElementById('checkNumber').value.trim();

    if (!sessionId) {
      showResult('check-result', 'Session ID is required', true);
      return;
    }
    if (!number) {
      showResult('check-result', 'Phone number is required', true);
      return;
    }

    const { status, data } = await apiCall('POST', '/api/session/check-number', {
      sessionId,
      number,
    });

    if (data.success) {
      showResult('check-result', data);
    } else {
      showResult('check-result', data, true);
    }
  } catch (err) {
    showResult('check-result', `Error: ${err.message}`, true);
  }
}

// ==========================================
// 7. Delete Session
// ==========================================

async function deleteSession() {
  try {
    const sessionId = document.getElementById('deleteSessionId').value.trim();
    if (!sessionId) {
      showResult('delete-result', 'Session ID is required', true);
      return;
    }

    if (!confirm(`Are you sure you want to delete session "${sessionId}"?`)) return;

    const { status, data } = await apiCall('DELETE', `/api/session/${sessionId}`);

    if (data.success) {
      showResult('delete-result', data);
    } else {
      showResult('delete-result', data, true);
    }
  } catch (err) {
    showResult('delete-result', `Error: ${err.message}`, true);
  }
}

// ==========================================
// Init
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  togglePhoneField();
});
