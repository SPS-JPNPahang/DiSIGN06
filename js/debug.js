// ============================================
// DSWEB DEBUG LOGGER (GLOBAL)
// ============================================
window.DSLOG = function (label, data = {}) {
  // ✅ Only log in development (disable in production)
  const isDevelopment = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
  
  if (!isDevelopment) return;  // Skip logging in production
  
  const time = new Date().toISOString().slice(11, 23);
  console.log(`🧠 [DSLOG ${time}] ${label}`, data);
};
