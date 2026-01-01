// ============================================
// DSWEB DEBUG LOGGER (GLOBAL)
// ============================================
window.DSLOG = function (label, data = {}) {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`🧠 [DSLOG ${time}] ${label}`, data);
};
