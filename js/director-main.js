// ============================================
// DIRECTOR DASHBOARD - MAIN
// Authentication, Dashboard, Button Management
// ============================================

// State management
let currentRequests = [];
let currentRequest = null;

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(screenId) {
  document.querySelectorAll('[id$="Screen"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

function showLoading(text = 'Memproses...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ============================================
// AUTHENTICATION
// ============================================
async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    Toast.error('Sila isi email dan password');
    return;
  }
  
  showLoading('Mengesahkan...');
  
  try {
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'verify',
        email: email,
        password: password
      })
    });
    
    const result = await response.json();
    
    hideLoading();
    
    if (result.ok) {
      sessionStorage.setItem('directorAuth', 'true');
      sessionStorage.setItem('directorEmail', email);
      
      Toast.success('Login berjaya!');
      
      setTimeout(() => {
        showScreen('dashboardScreen');
        loadDashboard();
      }, 500);
    } else {
      Toast.error(result.message || 'Email atau password salah');
    }
    
  } catch (err) {
    hideLoading();
    Toast.error('Ralat sambungan: ' + err.message);
  }
}

function logout() {
  // Show confirmation modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-sm w-full">
      <h3 class="text-lg font-bold mb-4 text-gray-800">Log Keluar?</h3>
      <p class="text-gray-600 mb-6">Adakah anda pasti ingin log keluar?</p>
      <div class="flex gap-3">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-smooth btn">
          Batal
        </button>
        <button onclick="confirmLogout()" class="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-smooth btn">
          Ya, Log Keluar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function confirmLogout() {
  // Close modal
  document.querySelector('.fixed.inset-0').remove();
  
  sessionStorage.clear();
  Toast.info('Anda telah log keluar');
  setTimeout(() => location.reload(), 1000);
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
  showLoading('Memuatkan permohonan...');
  
  // Update current date display
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    const now = new Date();
    const formatted = now.toLocaleDateString('ms-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    dateEl.textContent = formatted;
  }
  
  try {
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'getPending'
      })
    });
    
    const result = await response.json();
    
    hideLoading();
    
    if (result.ok) {
      currentRequests = result.requests;
      renderRequestsList();
      
      if (result.requests.length > 0) {
        Toast.success(`${result.requests.length} permohonan pending`);
      }
    } else {
      Toast.error('Gagal memuatkan data: ' + result.message);
    }
    
  } catch (err) {
    hideLoading();
    Toast.error('Ralat: ' + err.message);
  }
}

function renderRequestsList() {
  const container = document.getElementById('requestsList');
  
  if (currentRequests.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-lg font-semibold">Tiada permohonan pending</p>
        <p class="text-sm mt-2">Semua permohonan telah diproses</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = currentRequests.map(req => `
    <div class="bg-white rounded-lg shadow-soft p-4 hover:shadow-lg transition-smooth cursor-pointer"
         onclick="viewRequest('${req.requestId}')">
      <div class="flex justify-between items-start mb-3">
        <div>
          <p class="font-bold text-lg text-gray-800">${req.requestId}</p>
          <p class="text-sm text-gray-500">${req.tarikhMohon}</p>
        </div>
        <span class="bg-yellow-100 text-yellow-800 text-xs px-3 py-1 rounded-full font-semibold">
          PENDING
        </span>
      </div>
      
      <div class="space-y-1 text-sm">
        <p class="text-gray-700"><strong>Pemohon:</strong> ${req.namaPemohon}</p>
        <p class="text-gray-700"><strong>Sektor:</strong> ${req.sektor}</p>
        <p class="text-gray-600"><strong>Tajuk:</strong> ${req.tajukSurat}</p>
        <p class="text-sm text-gray-600 mb-3"><strong>Perihal:</strong> ${req.perihal || '-'}</p>
      </div>
      
      <button class="mt-3 w-full bg-blue-900 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition-smooth">
        Lihat & Tandatangan →
      </button>
    </div>
  `).join('');
}

// ============================================
// BUTTON STATE MANAGEMENT
// ============================================
function updateButtonsAfterSignature() {
  // Hide TANDATANGAN button (already signed)
  const signBtn = document.querySelector('button[onclick="showSignaturePad()"]');
  if (signBtn) {
    signBtn.classList.add('hidden');
  }
  
  // Change REJECT to BATAL (cancel signature)
  const rejectBtn = document.getElementById('rejectBtn');
  if (rejectBtn) {
    rejectBtn.textContent = '🔄 BATAL TANDATANGAN';
    rejectBtn.className = 'flex-1 bg-gray-500 text-white py-4 rounded-lg font-bold text-lg hover:bg-gray-600 transition-smooth';
    rejectBtn.onclick = cancelSignature;
  }
  
  // Show PREVIEW button
  const previewBtn = document.getElementById('previewBtn');
  if (previewBtn) {
    previewBtn.classList.remove('hidden');
  }
  
  // Create SAHKAN button if not exists
  let confirmBtn = document.getElementById('confirmSignBtn');
  if (!confirmBtn) {
    confirmBtn = document.createElement('button');
    confirmBtn.id = 'confirmSignBtn';
    confirmBtn.className = 'flex-1 bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition-smooth';
    confirmBtn.innerHTML = '✓ SAHKAN & SIMPAN';
    confirmBtn.onclick = showPreviewBeforeConfirm;
    
    // Insert at the end of button container
    const btnContainer = document.querySelector('#viewerScreen .flex.gap-3');
    if (btnContainer) {
      btnContainer.appendChild(confirmBtn);
    }
  }
}

function resetButtons() {
  // Show TANDATANGAN button
  const signBtn = document.querySelector('button[onclick="showSignaturePad()"]');
  if (signBtn) {
    signBtn.classList.remove('hidden');
  }
  
  // Reset REJECT button
  const rejectBtn = document.getElementById('rejectBtn');
  if (rejectBtn) {
    rejectBtn.textContent = '✗ TOLAK';
    rejectBtn.className = 'flex-1 bg-red-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-red-700 transition-smooth';
    rejectBtn.onclick = rejectRequest;
  }
  
  // Hide PREVIEW button
  const previewBtn = document.getElementById('previewBtn');
  if (previewBtn) {
    previewBtn.classList.add('hidden');
  }
  
  // Remove SAHKAN button
  const confirmBtn = document.getElementById('confirmSignBtn');
  if (confirmBtn) {
    confirmBtn.remove();
  }
}

function cancelSignature() {
  // Prevent duplicate modals
  if (document.querySelector('.fixed.inset-0.bg-black.bg-opacity-75')) return;
  
  // Show confirmation modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-sm w-full">
      <h3 class="text-lg font-bold mb-4 text-gray-800">Batal Tandatangan?</h3>
      <p class="text-gray-600 mb-6">Buang tandatangan dan mula semula?</p>
      <div class="flex gap-3">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-smooth btn">
          Tidak
        </button>
        <button onclick="confirmCancelSignature()" class="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-smooth btn">
          Ya, Buang
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function confirmCancelSignature() {
  // Close modal
  document.querySelector('.fixed.inset-0').remove();
  
  // Remove signature preview
  removeSignaturePreview();
  signatureDataUrl = null;
  
  // Reset buttons
  resetButtons();
  
  Toast.info('Tandatangan telah dibatalkan');
}

// ============================================
// REJECT REQUEST
// ============================================
function rejectRequest() {
  // Show custom modal instead of browser prompt
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectModal').classList.remove('hidden');
}

function cancelReject() {
  document.getElementById('rejectModal').classList.add('hidden');
}

async function confirmReject() {
  const reason = document.getElementById('rejectReason').value.trim();
  
  if (!reason) {
    Toast.warning('Sebab tolakan diperlukan');
    return;
  }
  
  // Hide modal
  document.getElementById('rejectModal').classList.add('hidden');
  
  showLoading('Memproses...');
  
  try {
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'reject',
        requestId: currentRequest.requestId,
        reason: reason
      })
    });
    
    const result = await response.json();
    
    hideLoading();
    
    if (result.ok) {
      Toast.success('Permohonan telah ditolak. Email telah dihantar.');
      
      setTimeout(() => {
        backToDashboard();
        loadDashboard();
      }, 1500);
    } else {
      Toast.error('Gagal: ' + result.message);
    }
    
  } catch (err) {
    hideLoading();
    Toast.error('Ralat: ' + err.message);
  }
}

// ============================================
// NAVIGATION
// ============================================
function backToDashboard() {
  showScreen('dashboardScreen');
  currentRequest = null;
  
  // Reset PDF viewer state
  if (typeof resetPdfViewer === 'function') {
    resetPdfViewer();
  }
}

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  // Setup preview button
  const viewerScreen = document.getElementById('viewerScreen');
  if (viewerScreen) {
    const actionButtons = viewerScreen.querySelector('.flex.gap-3');
    if (actionButtons && !document.getElementById('previewBtn')) {
      const previewBtn = document.createElement('button');
      previewBtn.id = 'previewBtn';
      previewBtn.className = 'hidden flex-1 bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition-smooth';
      previewBtn.textContent = '👁️ PREVIEW';
      previewBtn.onclick = showPreviewBeforeConfirm;
      
      // Insert before first button
      actionButtons.insertBefore(previewBtn, actionButtons.children[0]);
    }
  }
  
  // Check authentication
  if (sessionStorage.getItem('directorAuth') === 'true') {
    showScreen('dashboardScreen');
    loadDashboard();
  } else {
    showScreen('loginScreen');
  }
  
  // Enter key login
  const loginPassword = document.getElementById('loginPassword');
  if (loginPassword) {
    loginPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') login();
    });
  }
});
