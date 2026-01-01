// ============================================
// DIRECTOR DASHBOARD - PDF VIEWER & SIGNATURE
// PDF Loading, Signature Drawing, Processing
// ============================================

// PDF State
let pdfDocument = null;
let pdfBytes = null;
let currentPage = 1;
let totalPages = 0;
let currentZoom = CONFIG.PDF.DEFAULT_ZOOM;
let pdfContext = null;

// Signature State
let signatureDataUrl = null;
let signaturePreview = null;
let signatureContext = null;
let isDrawing = false;

// Drag & Resize State
let isDragging = false;
let isResizing = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPointerX = 0;  // ✅ TAMBAH: tracking awal
let initialPointerY = 0;  // ✅ TAMBAH: tracking awal
let hasMoved = false;     // ✅ TAMBAH: threshold flag
let resizeHandle = null;
let lastPointerX = null;
let activePointerId = null;

// ✅ LOCK STATE
let signatureLocked = true;
let lockIcon = null;

// ✅ RAF (RequestAnimationFrame) untuk smooth drag
let rafId = null;
let pendingX = null;
let pendingY = null;

// ✅ MARKING MODE STATE
let markingMode = false;
let locationMarker = null;
let markerX = null;
let markerY = null;

// ============================================
// VIEW REQUEST & LOAD PDF
// ============================================
async function viewRequest(requestId) {
  currentRequest = currentRequests.find(r => r.requestId === requestId);
  
  if (!currentRequest) {
    Toast.error('Request tidak dijumpai');
    return;
  }
  
  showScreen('viewerScreen');
  document.getElementById('viewerTitle').textContent = currentRequest.requestId;
  
  currentPage = 1;
  currentZoom = CONFIG.PDF.DEFAULT_ZOOM;

  resetButtons();

  await loadPdf();
}

async function loadPdf() {
  showLoading('Memuatkan PDF...');
  
  try {
    const fileId = Utils.extractFileId(currentRequest.pdfPendingUrl);
    
    if (!fileId) {
      throw new Error('Invalid PDF URL');
    }
    
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'getPdf',
        fileId: fileId
      })
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.message);
    }
    
    // Convert base64 to bytes
    const base64 = result.base64;
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    pdfBytes = bytes;
    
    // Load with PDF.js
    const loadingTask = pdfjsLib.getDocument({data: bytes});
    pdfDocument = await loadingTask.promise;
    totalPages = pdfDocument.numPages;
    
    // Mark as viewed
    markAsViewed();
    
    updatePageInfo();
    await renderPage();
    
    hideLoading();
    Toast.success('PDF berjaya dimuatkan');
    
  } catch (err) {
    hideLoading();
    Toast.error('Gagal memuatkan PDF: ' + err.message);
    backToDashboard();
  }
}

async function markAsViewed() {
  try {
    await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'markViewed',
        requestId: currentRequest.requestId
      })
    });
  } catch (err) {
    console.log('Failed to mark as viewed:', err);
  }
}

// ============================================
// PDF RENDERING
// ============================================
async function renderPage() {
  if (!pdfDocument) {
    console.error('No PDF document loaded');
    return;
  }
  
  try {
    const page = await pdfDocument.getPage(currentPage);
    const canvas = document.getElementById('pdfCanvas');
    
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }
    
    pdfContext = canvas.getContext('2d');
    
    // ================================
    // ✅ FIT PDF TO CONTAINER WIDTH
    // ================================
    const container = document.getElementById('pdfViewerContainer');

    // Original PDF size (scale = 1)
    const unscaledViewport = page.getViewport({ scale: 1 });

    // Lebar container sebenar
    const containerWidth = container.clientWidth;

    // Scale supaya PDF hampir penuh lebar (90% for padding)
    const fitScale = (containerWidth * 0.9) / unscaledViewport.width;

    // Apply zoom as multiplier
    const finalScale = fitScale * currentZoom;

    // Final viewport
    const viewport = page.getViewport({ scale: finalScale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    console.log('Rendering - Zoom:', currentZoom, 'Scale:', (currentZoom * 1.5).toFixed(2), 'Canvas:', canvas.width, 'x', canvas.height);
    
    // Clear canvas
    pdfContext.clearRect(0, 0, canvas.width, canvas.height);
    
    // Render
    const renderTask = page.render({
      canvasContext: pdfContext,
      viewport: viewport
    });
    
    await renderTask.promise;
    
    console.log('Page rendered successfully');
    
    // Update zoom display
    document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
    
    // Re-render signature if exists
    if (signaturePreview) {
      repositionSignaturePreview();
    }
    
  } catch (err) {
    console.error('renderPage error:', err);
    Toast.error('Gagal render PDF: ' + err.message);
  }
}

function updatePageInfo() {
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prevPageBtn').disabled = currentPage === 1;
  document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    updatePageInfo();
    renderPage();
  }
}

function nextPage() {
  if (currentPage < totalPages) {
    currentPage++;
    updatePageInfo();
    renderPage();
  }
}

function zoomIn() {
  currentZoom = Math.min(currentZoom + CONFIG.PDF.ZOOM_STEP, CONFIG.PDF.MAX_ZOOM);
  document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
  renderPage();
}

function zoomOut() {
  currentZoom = Math.max(currentZoom - CONFIG.PDF.ZOOM_STEP, CONFIG.PDF.MIN_ZOOM);
  document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
  renderPage();
}

function resetPdfViewer() {
  // ✅ CLEANUP: Reset marking mode
  if (markingMode) {
    markingMode = false;
    const container = document.getElementById('pdfViewerContainer');
    if (container) container.classList.remove('marking-mode');
  }
  
  // ✅ CLEANUP: Remove location marker
  removeLocationMarker();
  
  // ✅ RESET position variables
  markerX = null;
  markerY = null;
  
  // ✅ CLEANUP: Reset button states
  document.getElementById('markLocationBtn')?.classList.remove('hidden');
  document.getElementById('cancelMarkBtn')?.classList.add('hidden');
  document.getElementById('changePositionBtn')?.classList.add('hidden');
  document.getElementById('signBtn')?.classList.add('hidden');
  
  // Existing resets
  pdfDocument = null;
  pdfBytes = null;
  currentPage = 1;
  totalPages = 0;
  currentZoom = CONFIG.PDF.DEFAULT_ZOOM;
  signatureDataUrl = null;
  removeSignaturePreview();
}

// ============================================
// SIGNATURE PAD
// ============================================
function showSignaturePad() {
  document.getElementById('signatureOverlay').classList.remove('hidden');
  
  const canvas = document.getElementById('signatureCanvas');
  signatureContext = canvas.getContext('2d', { willReadFrequently: true });
  
  // Clear canvas (transparent)
  signatureContext.clearRect(0, 0, canvas.width, canvas.height);
  
  // Setup drawing
  signatureContext.strokeStyle = CONFIG.SIGNATURE.LINE_COLOR;
  signatureContext.lineWidth = CONFIG.SIGNATURE.LINE_WIDTH;
  signatureContext.lineCap = 'round';
  signatureContext.lineJoin = 'round';
  
  // Mouse events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  // Touch events
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchmove', handleTouchMove);
  canvas.addEventListener('touchend', stopDrawing);
}

function closeSignaturePad() {
  document.getElementById('signatureOverlay').classList.add('hidden');
}

function clearSignature() {
  const canvas = document.getElementById('signatureCanvas');
  signatureContext.clearRect(0, 0, canvas.width, canvas.height);
}

function startDrawing(e) {
  isDrawing = true;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  
  // Calculate scale ratio (if canvas is scaled)
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  // Get accurate position
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  signatureContext.beginPath();
  signatureContext.moveTo(x, y);
  
  e.preventDefault(); // Prevent scrolling
}

function draw(e) {
  if (!isDrawing) return;
  
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  
  // Calculate scale ratio
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  // Get accurate position
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  signatureContext.lineTo(x, y);
  signatureContext.stroke();
  
  e.preventDefault(); // Prevent scrolling
}

function stopDrawing() {
  isDrawing = false;
}

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  
  // Calculate scale ratio
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  // Get accurate position
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  
  isDrawing = true;
  signatureContext.beginPath();
  signatureContext.moveTo(x, y);
}

function handleTouchMove(e) {
  if (!isDrawing) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  
  // Calculate scale ratio
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  // Get accurate position
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  
  signatureContext.lineTo(x, y);
  signatureContext.stroke();
}

async function applySignature() {
  const canvas = document.getElementById('signatureCanvas');
  
  // Check if empty
  const imageData = signatureContext.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let isEmpty = true;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i+1] !== 255 || data[i+2] !== 255) {
      isEmpty = false;
      break;
    }
  }
  
  if (isEmpty) {
    Toast.warning('Sila tandatangan terlebih dahulu');
    return;
  }
  
  // Add timestamp to signature
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width + 180; // Extra space on RIGHT
  tempCanvas.height = canvas.height; // No extra height
  const tempContext = tempCanvas.getContext('2d');

  // Draw signature (transparent background)
  tempContext.drawImage(canvas, 0, 0);

  // Draw timestamp with white background box
  const timestamp = new Date().toLocaleString('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  tempContext.font = '11px Arial';
  const textWidth = tempContext.measureText(timestamp).width;

  // White background for timestamp (on RIGHT side)
  tempContext.fillStyle = '#ffffff';
  tempContext.fillRect(
    canvas.width + 5, // Position on right
    (canvas.height - 20) / 2, // Center vertically
    textWidth + 10,
    20
  );

  // Timestamp text (horizontal on RIGHT)
  tempContext.fillStyle = '#000000';
  tempContext.textAlign = 'left';
  tempContext.fillText(
    timestamp, 
    canvas.width + 10, // Position from left
    canvas.height / 2 + 5 // Center vertically
  );

  signatureDataUrl = tempCanvas.toDataURL('image/png');

  closeSignaturePad();
  placeSignatureOnPdf();
}

// ============================================
// MARKING MODE SYSTEM
// ============================================

function enterMarkingMode() {
  DSLOG('enterMarkingMode');
  
  // Remove existing marker if any
  removeLocationMarker();
  
  // Enter marking mode
  markingMode = true;
  
  const container = document.getElementById('pdfViewerContainer');
  const pdfCanvas = document.getElementById('pdfCanvas');
  
  // Freeze PDF scroll
  if (container) container.classList.add('marking-mode');
  
  // Show instruction
  Toast.info('💡 TAP PDF untuk tandakan kawasan tandatangan');
  
  // Update buttons
  document.getElementById('markLocationBtn')?.classList.add('hidden');
  document.getElementById('cancelMarkBtn')?.classList.remove('hidden');
  document.getElementById('changePositionBtn')?.classList.add('hidden');
  document.getElementById('signBtn')?.classList.add('hidden');
  
  // Add click listener for marking
  if (!pdfCanvas._markingHandler) {
    pdfCanvas._markingHandler = function(e) {
      if (markingMode) {
        placeLocationMarker(e);
      }
    };
    pdfCanvas.addEventListener('click', pdfCanvas._markingHandler);
  }
}

function cancelMarkingMode() {
  DSLOG('cancelMarkingMode');
  
  // Exit marking mode
  markingMode = false;
  
  const container = document.getElementById('pdfViewerContainer');
  
  // Restore PDF scroll
  if (container) container.classList.remove('marking-mode');
  
  // Remove marker if any
  removeLocationMarker();
  
  // ✅ RESET position variables
  markerX = null;
  markerY = null;
  
  // Update buttons (back to initial state)
  document.getElementById('markLocationBtn')?.classList.remove('hidden');
  document.getElementById('cancelMarkBtn')?.classList.add('hidden');
  document.getElementById('changePositionBtn')?.classList.add('hidden');
  document.getElementById('signBtn')?.classList.add('hidden');
  
  Toast.info('Penandaan dibatalkan');
}

function placeLocationMarker(e) {
  DSLOG('placeLocationMarker');
  
  const pdfCanvas = document.getElementById('pdfCanvas');
  const container = document.getElementById('pdfViewerContainer');
  const rect = pdfCanvas.getBoundingClientRect();
  
  // ✅ SIMPLE & CORRECT: Rect already scroll-aware
  markerX = e.clientX - rect.left - 12;
  markerY = e.clientY - rect.top - 12;
  
  DSLOG('Marker position calculated', {
    clickX: e.clientX,
    clickY: e.clientY,
    canvasLeft: rect.left,
    canvasTop: rect.top,
    markerX,
    markerY
  });
  
  // Remove existing marker
  removeLocationMarker();
  
  // Create marker element
  locationMarker = document.createElement('div');
  locationMarker.className = 'location-marker';
  locationMarker.style.left = markerX + 'px';
  locationMarker.style.top = markerY + 'px';
  //locationMarker.title = `Position: ${markerX.toFixed(0)}, ${markerY.toFixed(0)}`;
  
  // Add center dot
  const dot = document.createElement('div');
  dot.className = 'marker-dot';
  locationMarker.appendChild(dot);
  
  // Make marker draggable
  locationMarker.addEventListener('pointerdown', onMarkerPointerDown);
  
  // Append to container
  container.appendChild(locationMarker);
  
  // Exit marking mode
  markingMode = false;
  container.classList.remove('marking-mode');
  
  // Update buttons
  document.getElementById('markLocationBtn')?.classList.add('hidden');
  document.getElementById('cancelMarkBtn')?.classList.add('hidden');
  document.getElementById('changePositionBtn')?.classList.remove('hidden');
  document.getElementById('signBtn')?.classList.remove('hidden');
  
  Toast.success('✅ Kawasan ditandakan. Klik TANDATANGAN untuk sign.');
}

function removeLocationMarker() {
  DSLOG('removeLocationMarker');
  
  if (locationMarker) {
    locationMarker.remove();
    locationMarker = null;
  }
  
  // ✅ DON'T reset markerX/markerY here
  // They will be reset in placeSignatureOnPdf() AFTER use
}

function resetMarkerPosition() {
  DSLOG('resetMarkerPosition');
  markerX = null;
  markerY = null;
}

// ============================================
// MARKER DRAG (MICRO-ADJUSTMENT)
// ============================================

let markerDragging = false;
let markerDragStartX = 0;
let markerDragStartY = 0;

function onMarkerPointerDown(e) {
  if (!locationMarker) return;
  
  markerDragging = true;
  
  markerDragStartX = e.clientX - locationMarker.offsetLeft;
  markerDragStartY = e.clientY - locationMarker.offsetTop;
  
  locationMarker.setPointerCapture(e.pointerId);
  
  e.preventDefault();
  e.stopPropagation();
}

document.addEventListener('pointermove', (e) => {
  if (!markerDragging || !locationMarker) return;
  
  const newX = e.clientX - markerDragStartX;
  const newY = e.clientY - markerDragStartY;
  
  locationMarker.style.left = Math.max(0, newX) + 'px';
  locationMarker.style.top = Math.max(0, newY) + 'px';
  
  // Update stored position
  markerX = newX;
  markerY = newY;
  
  e.preventDefault();
});

document.addEventListener('pointerup', (e) => {
  if (markerDragging) {
    markerDragging = false;
    
    if (locationMarker) {
      try {
        locationMarker.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
    }
  }
});

// ============================================
// SIGNATURE PLACEMENT (MODIFIED)
// ============================================
function placeSignatureOnPdf() {
  removeSignaturePreview();

  const container = document.getElementById('pdfViewerContainer');
  if (!container) {
    Toast.error('PDF container tidak dijumpai');
    return;
  }

  signaturePreview = document.createElement('div');
  signaturePreview.className = 'signature-preview locked';  // ✅ Default locked
  signaturePreview.style.width = CONFIG.SIGNATURE.DEFAULT_WIDTH + 'px';
  signaturePreview.style.height = CONFIG.SIGNATURE.DEFAULT_HEIGHT + 'px';
  
  // ✅ SMART POSITIONING: Use marker if exists, else bottom-left
  const canvas = document.getElementById('pdfCanvas');
  const canvasHeight = canvas ? canvas.offsetHeight : 600;
  
  if (markerX !== null && markerY !== null) {
    // ✅ DIRECT POSITION (marker already scroll-adjusted)
    signaturePreview.style.left = markerX + 'px';
    signaturePreview.style.top = markerY + 'px';
    
    DSLOG('Signature placed at marker', {
      markerX,
      markerY,
      signatureLeft: signaturePreview.style.left,
      signatureTop: signaturePreview.style.top
    });
    
    // Remove marker visual (but keep position until signature rendered)
    removeLocationMarker();
    
    // ✅ NOW reset position variables AFTER use
    markerX = null;
    markerY = null;
    
    // Reset buttons to normal signature state
    document.getElementById('changePositionBtn')?.classList.add('hidden');
  } else {
    // Default: bottom-left
    signaturePreview.style.left = '50px';
    signaturePreview.style.top = (canvasHeight - 150) + 'px';
  }

  const img = document.createElement('img');
  img.src = signatureDataUrl;
  img.draggable = false;
  signaturePreview.appendChild(img);

  // ✅ LOCK ICON (top-right)
  lockIcon = document.createElement('div');
  lockIcon.className = 'lock-icon';
  lockIcon.innerHTML = '🔒';
  lockIcon.title = 'Klik untuk unlock/lock';
  lockIcon.onclick = toggleLock;
  signaturePreview.appendChild(lockIcon);

  // RESIZE HANDLE (initially hidden - locked)
  const handle = document.createElement('div');
  handle.className = 'resize-handle se';
  handle.style.display = 'none';  // ✅ Hidden when locked
  signaturePreview.appendChild(handle);

  container.appendChild(signaturePreview);
  
  signaturePreview.style.pointerEvents = 'auto';
  signaturePreview.addEventListener('pointerdown', onPointerDown);

  // ✅ Reset lock state
  signatureLocked = true;

  
  // ✅ ENHANCEMENT: Tap-to-Place for fast positioning
  const pdfCanvas = document.getElementById('pdfCanvas');
  
  // Remove old listener if exists (prevent duplicates)
  if (pdfCanvas._tapToPlaceHandler) {
    pdfCanvas.removeEventListener('click', pdfCanvas._tapToPlaceHandler);
  }
  
  // Create new handler
  pdfCanvas._tapToPlaceHandler = function(e) {
    // Only work bila unlocked & not currently dragging
    if (!signatureLocked && !isDragging && signaturePreview) {
      const rect = pdfCanvas.getBoundingClientRect();
      
      // Center signature on tap point
      const sigWidth = signaturePreview.offsetWidth;
      const sigHeight = signaturePreview.offsetHeight;
      
      const x = e.clientX - rect.left - (sigWidth / 2);
      const y = e.clientY - rect.top - (sigHeight / 2);
      
      // INSTANT positioning (no animation)
      signaturePreview.style.left = Math.max(0, x) + 'px';
      signaturePreview.style.top = Math.max(0, y) + 'px';
      
      DSLOG('Tap-to-place', { x, y });
      Toast.info('Tap lagi untuk adjust, atau drag untuk fine-tune');
    }
  };
  
  // Attach listener
  pdfCanvas.addEventListener('click', pdfCanvas._tapToPlaceHandler);

  updateButtonsAfterSignature();
  Toast.success('💡 Tandatangan diletakkan. Unlock untuk TAP atau DRAG ke posisi.');
}
// ============================================
// LOCK/UNLOCK SIGNATURE
// ============================================
function toggleLock(e) {
  e.stopPropagation();
  
  if (!signaturePreview || !lockIcon) return;
  
  signatureLocked = !signatureLocked;
  
  DSLOG('toggleLock', { locked: signatureLocked });
  
  const container = document.getElementById('pdfViewerContainer');
  
  if (signatureLocked) {
    // ✅ LOCK — Enable PDF scroll
    signaturePreview.classList.remove('unlocked');
    signaturePreview.classList.add('locked');
    lockIcon.innerHTML = '🔒';
    
    // Hide resize handle
    const handle = signaturePreview.querySelector('.resize-handle');
    if (handle) handle.style.display = 'none';
    
    // ✅ RESTORE PDF SCROLL
    if (container) container.classList.remove('editing-signature');
    
    Toast.info('Signature locked — PDF boleh scroll');
  } else {
    // ✅ UNLOCK — Disable PDF scroll
    signaturePreview.classList.remove('locked');
    signaturePreview.classList.add('unlocked');
    lockIcon.innerHTML = '🔓';
    
    // Show resize handle
    const handle = signaturePreview.querySelector('.resize-handle');
    if (handle) handle.style.display = 'block';
    
    // ✅ FREEZE PDF SCROLL
    if (container) container.classList.add('editing-signature');
    
    Toast.info('💡 TAP PDF untuk pindah, atau DRAG untuk fine-tune');
  }
}

// ============================================
// SIGNATURE PLACEMENT (DRAG & RESIZE)
// ============================================
function onPointerDown(e) {
  if (!signaturePreview) return;

  // ✅ CHECK LOCK STATE
  if (signatureLocked) {
    DSLOG('onPointerDown BLOCKED', { reason: 'signature locked' });
    return;  // Do nothing if locked
  }

  // ✅ Capture pointer untuk consistency
  activePointerId = e.pointerId;
  signaturePreview.setPointerCapture(activePointerId);

  if (e.target.classList.contains('resize-handle')) {
    // RESIZE mode
    isResizing = true;
    isDragging = false;
    hasMoved = false;
    lastPointerX = e.clientX;
  } else {
    // DRAG mode - setup
    isDragging = true;
    isResizing = false;
    hasMoved = false;
    
    initialPointerX = e.clientX;
    initialPointerY = e.clientY;
    
    dragStartX = e.clientX - signaturePreview.offsetLeft;
    dragStartY = e.clientY - signaturePreview.offsetTop;
  }

  e.preventDefault();
  e.stopPropagation();
}

document.addEventListener('pointermove', (e) => {
  if (!signaturePreview) return;
  if (e.pointerId !== activePointerId) return;

  // ✅ PREVENT SCROLL bila drag/resize active
  if (isDragging || isResizing) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ======================
  // DRAG (with RAF)
  // ======================
  if (isDragging && !isResizing) {
    if (!hasMoved) {
      const dx = Math.abs(e.clientX - initialPointerX);
      const dy = Math.abs(e.clientY - initialPointerY);
      
      if (dx + dy < 5) {
        return;
      }
      
      hasMoved = true;
    }
    
    // ✅ STORE position, render nanti via RAF
    pendingX = e.clientX - dragStartX;
    pendingY = e.clientY - dragStartY;
    
    // ✅ Request animation frame (smooth 60fps)
    if (!rafId) {
      rafId = requestAnimationFrame(updateSignaturePosition);
    }
    
    return;
  }

  // ======================
  // RESIZE (with RAF)
  // ======================
  if (isResizing) {
    const deltaX = e.clientX - lastPointerX;
    if (Math.abs(deltaX) < 2) return;

    lastPointerX = e.clientX;

    const w = parseFloat(signaturePreview.style.width);
    const h = parseFloat(signaturePreview.style.height);
    const ratio = w / h;

    const STEP = 1.5;
    const MIN_WIDTH = 80;
    const MAX_WIDTH = 400;

    let newWidth = w + Math.sign(deltaX) * STEP;
    newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

    // ✅ Update directly (resize less frequent than drag)
    signaturePreview.style.width = newWidth + 'px';
    signaturePreview.style.height = (newWidth / ratio) + 'px';
  }
});

// ✅ RAF UPDATE FUNCTION (smooth 60fps rendering)
function updateSignaturePosition() {
  if (pendingX !== null && pendingY !== null && signaturePreview) {
    signaturePreview.style.left = pendingX + 'px';
    signaturePreview.style.top = pendingY + 'px';
  }
  
  // Reset
  rafId = null;
  pendingX = null;
  pendingY = null;
}

document.addEventListener('pointerup', (e) => {
  if (e.pointerId !== activePointerId) return;

  // ✅ Cancel pending RAF
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  
  // ✅ Final position update (jika ada pending)
  if (pendingX !== null && pendingY !== null && signaturePreview) {
    signaturePreview.style.left = pendingX + 'px';
    signaturePreview.style.top = pendingY + 'px';
    pendingX = null;
    pendingY = null;
  }

  // ✅ Release capture
  if (signaturePreview && activePointerId !== null) {
    try {
      signaturePreview.releasePointerCapture(activePointerId);
    } catch (err) {
      // Ignore if already released
    }
  }

  // ✅ Reset states
  isDragging = false;
  isResizing = false;
  hasMoved = false;
  lastPointerX = null;
  activePointerId = null;
});

// ✅ AUTO-LOCK when clicking outside signature
document.addEventListener('click', (e) => {
  if (!signaturePreview || signatureLocked) return;
  
  // Check if click is outside signature preview
  if (!signaturePreview.contains(e.target)) {
    DSLOG('Auto-lock triggered', { clickedOutside: true });
    
    signatureLocked = true;
    signaturePreview.classList.remove('unlocked');
    signaturePreview.classList.add('locked');
    
    if (lockIcon) lockIcon.innerHTML = '🔒';
    
    const handle = signaturePreview.querySelector('.resize-handle');
    if (handle) handle.style.display = 'none';
    
    // ✅ RESTORE PDF SCROLL
    const container = document.getElementById('pdfViewerContainer');
    if (container) container.classList.remove('editing-signature');
    
    Toast.info('Signature auto-locked — PDF boleh scroll');
  }
});

function removeSignaturePreview() {
  DSLOG('removeSignaturePreview', {
    exists: !!signaturePreview,
    dataUrl: !!signatureDataUrl
  });
  console.log('🔴 removeSignaturePreview() DIPANGGIL');
  
  if (signaturePreview) {
    // ✅ CLEANUP: Remove tap-to-place listener
    const pdfCanvas = document.getElementById('pdfCanvas');
    if (pdfCanvas && pdfCanvas._tapToPlaceHandler) {
      pdfCanvas.removeEventListener('click', pdfCanvas._tapToPlaceHandler);
      pdfCanvas._tapToPlaceHandler = null;
    }
    
    // ✅ CLEANUP: Remove marking handler
    if (pdfCanvas && pdfCanvas._markingHandler) {
      pdfCanvas.removeEventListener('click', pdfCanvas._markingHandler);
      pdfCanvas._markingHandler = null;
    }
    
    signaturePreview.remove();
    signaturePreview = null;
  }
// ✅ Cancel RAF bila remove
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  // ✅ RESET BUTTONS (restore initial state if no marker)
  if (markerX === null && markerY === null) {
    // No marker exists, show initial buttons
    document.getElementById('markLocationBtn')?.classList.remove('hidden');
    document.getElementById('signBtn')?.classList.add('hidden');
    document.getElementById('changePositionBtn')?.classList.add('hidden');
  }
  // Reset semua drag/resize states
  isDragging = false;
  isResizing = false;
  hasMoved = false;
  activePointerId = null;
  lastPointerX = null;
  pendingX = null;  // ✅ TAMBAH
  pendingY = null;  // ✅ TAMBAH
  // Reset lock states
  signatureLocked = true;
  lockIcon = null;
  
  // ✅ RESTORE PDF SCROLL (penting bila cancel signature!)
  const container = document.getElementById('pdfViewerContainer');
  if (container) container.classList.remove('editing-signature');
}


function repositionSignaturePreview() {
  // Called after zoom/page change
  if (!signaturePreview) return;
}

// ============================================
// SHARED: Calculate signature position relative to canvas
// ============================================
function getSignatureRelativePosition() {
  if (!signaturePreview) return null;
  
  const canvas = document.getElementById('pdfCanvas');
  const canvasRect = canvas.getBoundingClientRect();
  const sigRect = signaturePreview.getBoundingClientRect();
  
  // Position relative to canvas (in pixels)
  const relativeX = sigRect.left - canvasRect.left;
  const relativeY = sigRect.top - canvasRect.top;
  
  // As PERCENTAGE of canvas dimensions (more reliable across scales)
  const percentX = relativeX / canvas.width;
  const percentY = relativeY / canvas.height;
  const percentWidth = sigRect.width / canvas.width;
  const percentHeight = sigRect.height / canvas.height;
  
  console.log('Signature position (percentage):', {
    percentX: percentX.toFixed(4),
    percentY: percentY.toFixed(4),
    percentWidth: percentWidth.toFixed(4),
    percentHeight: percentHeight.toFixed(4)
  });
  
  return {
    percentX,
    percentY,
    percentWidth,
    percentHeight,
    // Also return pixel values for preview
    pixelX: relativeX,
    pixelY: relativeY,
    pixelWidth: sigRect.width,
    pixelHeight: sigRect.height
  };
}
// ============================================
// PREVIEW
// ============================================
async function showPreviewBeforeConfirm() {
  if (!signaturePreview) {
    Toast.warning('Sila letak tandatangan pada PDF terlebih dahulu');
    return;
  }
  
  showLoading('Menjana preview...');
  
  try {
    // Render current page to preview canvas
    const page = await pdfDocument.getPage(currentPage);
    const previewCanvas = document.getElementById('previewCanvas');
    const previewContext = previewCanvas.getContext('2d');
    
    // Scale to fit modal (max 800px width)
    const originalViewport = page.getViewport({scale: 1.0});
    const maxWidth = 800;
    const scale = Math.min(maxWidth / originalViewport.width, 1.5);
    
    const viewport = page.getViewport({scale: scale});
    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;
    
    await page.render({
      canvasContext: previewContext,
      viewport: viewport
    }).promise;
    
    // Draw signature on preview
    const sigImg = new Image();
    sigImg.src = signatureDataUrl;
    await new Promise(resolve => sigImg.onload = resolve);
    
    // Get signature position as percentage
    const sigPos = getSignatureRelativePosition();

    if (!sigPos) {
      throw new Error('Signature position not found');
    }

    // Apply percentage to preview canvas dimensions
    const sigX = sigPos.percentX * previewCanvas.width;
    const sigY = sigPos.percentY * previewCanvas.height;
    const sigWidth = sigPos.percentWidth * previewCanvas.width;
    const sigHeight = sigPos.percentHeight * previewCanvas.height;

    console.log('Preview signature (pixels):', {sigX, sigY, sigWidth, sigHeight});
        
    previewContext.drawImage(sigImg, sigX, sigY, sigWidth, sigHeight);
    
    // Show preview overlay
    document.getElementById('previewPageNum').textContent = `${currentPage} of ${totalPages}`;
    document.getElementById('previewOverlay').classList.remove('hidden');
    
    hideLoading();
    
  } catch (err) {
    hideLoading();
    console.error('Preview error:', err);
    Toast.error('Gagal menjana preview: ' + err.message);
  }
}

function cancelPreview() {
  document.getElementById('previewOverlay').classList.add('hidden');
}

function editSignaturePosition() {
  cancelPreview();
  Toast.info('Laraskan posisi tandatangan');
}

async function confirmAndSign() {
  cancelPreview();
  await processSignedPdf();
}

function resetSignatureSize() {
  if (!signaturePreview) return;

  signaturePreview.style.width = CONFIG.SIGNATURE.DEFAULT_WIDTH + 'px';
  signaturePreview.style.height = CONFIG.SIGNATURE.DEFAULT_HEIGHT + 'px';

  Toast.info('Saiz tandatangan ditetapkan semula');
}
function cancelSignaturePlacement() {
  removeSignaturePreview();
  signatureDataUrl = null;
  isDragging = false;
  isResizing = false;

  Toast.info('Tandatangan dibatalkan');
}
// ============================================
// PDF PROCESSING & UPLOAD
// ============================================
async function processSignedPdf() {
  if (!signaturePreview) {
    Toast.warning('Sila letak tandatangan pada PDF terlebih dahulu');
    return;
  }
  
  showLoading('Memproses tandatangan...');
  
  try {
    // Reload PDF bytes from current document
    const fileId = Utils.extractFileId(currentRequest.pdfPendingUrl);
    
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'getPdf',
        fileId: fileId
      })
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error('Failed to reload PDF: ' + result.message);
    }
    
    // Convert base64 to bytes (fresh copy)
    const base64 = result.base64;
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('Reloaded PDF for signing, size:', bytes.length);
    
    // Load PDF with pdf-lib
    const pdfDoc = await PDFLib.PDFDocument.load(bytes);
    
    // Embed signature image
    const signaturePng = await pdfDoc.embedPng(signatureDataUrl);
    
    // Get target page
    const pages = pdfDoc.getPages();
    const targetPage = pages[currentPage - 1];
    const {width, height} = targetPage.getSize();
    
    // Get signature position as percentage (same as preview)
      const sigPos = getSignatureRelativePosition();

      if (!sigPos) {
        throw new Error('Signature position not found');
      }

      console.log('PDF page dimensions:', {width, height});

      // Apply percentage to actual PDF dimensions
      const sigWidth = sigPos.percentWidth * width;
      const sigHeight = sigPos.percentHeight * height;
      const sigX = sigPos.percentX * width;

      // PDF coordinates are bottom-left origin, canvas is top-left
      const sigY = height - (sigPos.percentY * height) - sigHeight;

      console.log('Signature on PDF (points):', {
        sigX: sigX.toFixed(2),
        sigY: sigY.toFixed(2),
        sigWidth: sigWidth.toFixed(2),
        sigHeight: sigHeight.toFixed(2)
      });
    
    console.log('Signature on PDF:', {
      sigX: sigX,
      sigY: sigY,
      sigWidth: sigWidth,
      sigHeight: sigHeight
    });
    
    targetPage.drawImage(signaturePng, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight
    });
    
    // Save modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    
    console.log('Modified PDF size:', modifiedPdfBytes.length);
    
    // Convert to base64
    let binary = '';
    const signedBytes = new Uint8Array(modifiedPdfBytes);
    for (let i = 0; i < signedBytes.byteLength; i++) {
      binary += String.fromCharCode(signedBytes[i]);
    }
    const base64Signed = btoa(binary);
    
    console.log('Base64 signed PDF length:', base64Signed.length);
    
    // Upload
    await uploadSignedPdf(base64Signed);
    
  } catch (err) {
    hideLoading();
    console.error('processSignedPdf error:', err);
    Toast.error('Gagal memproses PDF: ' + err.message);
  }
}

async function uploadSignedPdf(base64Data) {
  showLoading('Menghantar dokumen...');
  
  try {
    const filename = `${currentRequest.requestId}_signed.pdf`;
    
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        action: 'uploadSigned',
        requestId: currentRequest.requestId,
        base64: base64Data,
        filename: filename
      })
    });
    
    const result = await response.json();
    
    hideLoading();
    
    if (result.ok) {
      Toast.success('Dokumen berjaya ditandatangani! Email telah dihantar.', 3000);
      
      setTimeout(() => {
        backToDashboard();
        loadDashboard();
      }, 2000);
    } else {
      Toast.error('Gagal: ' + result.message);
    }
    
  } catch (err) {
    hideLoading();
    Toast.error('Ralat: ' + err.message);
  }
}
