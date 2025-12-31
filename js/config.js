// ============================================
// SHARED CONFIGURATION
// ============================================

const CONFIG = {
  // API Endpoint
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbwxP23n7JKjQga6IgXngQRpt99lFyTtbFCfqlAXDF5mFAqhg3yKklutOTqwvHmJCbC0/exec',
  
  // File size limit (10MB)
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  
  // Status constants
  STATUS: {
    PENDING: 'Pending',
    SIGNED: 'Signed',
    REJECTED: 'Rejected'
  },
  
  // PDF settings
  PDF: {
    DEFAULT_ZOOM: 0.5,
    MIN_ZOOM: 0.5,
    MAX_ZOOM: 3.0,
    ZOOM_STEP: 0.25
  },
  
  // Signature settings
  SIGNATURE: {
    DEFAULT_WIDTH: 200,
    DEFAULT_HEIGHT: 80,
    LINE_WIDTH: 3.5,
    LINE_COLOR: '#000000'
  }
};

// ============================================
// CUSTOM TOAST NOTIFICATIONS
// ============================================

const Toast = {
  show(message, type = 'info', duration = 3000) {
    // Remove existing toasts
    const existing = document.querySelectorAll('.custom-toast');
    existing.forEach(t => t.remove());
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `custom-toast custom-toast-${type}`;
    
    const icon = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    }[type] || 'ℹ';
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
    
    return toast;
  },
  
  success(message, duration) {
    return this.show(message, 'success', duration);
  },
  
  error(message, duration) {
    return this.show(message, 'error', duration);
  },
  
  warning(message, duration) {
    return this.show(message, 'warning', duration);
  },
  
  info(message, duration) {
    return this.show(message, 'info', duration);
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

const Utils = {
  // Format date to Malaysia format
  formatDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleString('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  
  // Extract file ID from Google Drive URL
  extractFileId(url) {
    if (!url) return null;
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/open\?id=([a-zA-Z0-9_-]+)/
    ];
    
    for (let pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  },
  
  // Convert file to base64
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
  
  // Validate file
  validateFile(file) {
    if (!file) {
      throw new Error('Sila pilih fail PDF');
    }
    
    if (file.type !== 'application/pdf') {
      throw new Error('Format fail tidak sah. Hanya PDF dibenarkan.');
    }
    
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      throw new Error('Fail terlalu besar. Maksimum 10MB.');
    }
    
    return true;
  }
};
