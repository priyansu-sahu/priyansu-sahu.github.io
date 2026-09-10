/* ============================================================
   Photography Portfolio — App JS
   ============================================================ */

// --- Theme Toggle ---
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;

  // Priority: 1) saved preference, 2) system preference
  let saved; try { saved = localStorage.getItem('theme'); } catch(e) {}
  let theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  root.setAttribute('data-theme', theme);
  updateToggleIcon();

  toggle && toggle.addEventListener('click', function () {
    // Trigger spin animation
    toggle.classList.remove('toggling');
    void toggle.offsetWidth; // force reflow to restart animation
    toggle.classList.add('toggling');

    // Swap immediately — a delay here reads as an unresponsive button, and it
    // would still be there when the spin is suppressed by reduced motion.
    theme = theme === 'dark' ? 'light' : 'dark';
    withoutTransitions(function () {
      root.setAttribute('data-theme', theme);
    });
    try { localStorage.setItem('theme', theme); } catch(e) {}
    updateToggleIcon();

    // Clean up animation class
    setTimeout(function () { toggle.classList.remove('toggling'); }, 500);
  });

  // A theme flip repaints colour, background and border on nearly everything at
  // once. Anything mid-transition smears instead of snapping, so mute them for
  // one frame.
  function withoutTransitions(apply) {
    const mute = document.createElement('style');
    mute.textContent = '*,*::before,*::after{transition:none !important}';
    document.head.appendChild(mute);
    apply();
    void document.body.offsetHeight; // force reflow so the swap lands muted
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { mute.remove(); });
    });
  }

  function updateToggleIcon() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    if (theme === 'dark') {
      toggle.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    } else {
      toggle.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  }
})();

// --- Lightbox with prev/next, zoom/pan, keyboard/focus management ---
(function () {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return; // guard — not all pages have a lightbox

  const lightboxImg = document.getElementById('lightbox-img');
  const stage       = document.getElementById('lightbox-stage') || lightboxImg;
  const hiImg       = document.getElementById('lightbox-img-hi');
  const closeBtn  = lightbox.querySelector('.lightbox-close');
  const zoomBtn   = lightbox.querySelector('.lightbox-zoom');
  const prevBtn   = document.getElementById('lightbox-prev');
  const nextBtn   = document.getElementById('lightbox-next');
  const counter   = document.getElementById('lightbox-counter');
  const captionEl = document.getElementById('lightbox-caption');
  const exifEl    = document.getElementById('lightbox-exif');

  const items = Array.from(document.querySelectorAll('[data-lightbox]'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentIndex = -1;
  let lastFocus = null;

  // ---- high-resolution tier ------------------------------------------
  // The grid image (1600px, already in cache) shows at once; the -lg.webp
  // from data-large swaps in when it has loaded. Where the photo renders at
  // fewer device pixels than the grid file holds (a portrait phone, a small
  // window) it is only fetched once the viewer zooms in.
  var largeState = {};
  function wantsLargeByDefault(index) {
    var img = items[index] && items[index].querySelector('img');
    if (!img) return false;
    var aspect = (img.naturalWidth || +img.getAttribute('width') || 3) /
                 (img.naturalHeight || +img.getAttribute('height') || 2);
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var maxW = window.innerWidth * 0.9, maxH = window.innerHeight - 11 * rem;
    var w = Math.min(maxW, maxH * aspect);
    return w * (window.devicePixelRatio || 1) > 1200;
  }
  function showLarge(url, instant) {
    if (!hiImg) { lightboxImg.src = url; return; }
    hiImg.src = url;
    // reveal once decoded so the fade never shows a half-painted image,
    // with a short ceiling in case decode() stalls (background tabs do that)
    var revealed = false;
    var reveal = function () {
      if (revealed) return;
      revealed = true;
      if (hiImg.getAttribute('src') !== url) return; // viewer moved on meanwhile
      if (instant) hiImg.style.transition = 'none';
      hiImg.classList.add('is-hi');
      if (instant) { void hiImg.offsetWidth; hiImg.style.transition = ''; }
    };
    if (hiImg.decode) hiImg.decode().then(reveal, reveal);
    setTimeout(reveal, 300);
  }
  function clearLarge() {
    if (!hiImg) return;
    hiImg.style.transition = 'none';
    hiImg.classList.remove('is-hi');
    hiImg.removeAttribute('src');
    void hiImg.offsetWidth; // flush so the fade only applies from here on
    hiImg.style.transition = '';
  }
  function largeShown() {
    return !!(hiImg && hiImg.classList.contains('is-hi') && hiImg.naturalWidth);
  }
  function requestLarge(index) {
    var item = items[index];
    var url = item && item.dataset.large;
    if (!url) return;
    if (largeShown()) return;
    if (largeState[url] === 'done') { showLarge(url, true); return; }
    if (largeState[url]) return;
    largeState[url] = 'loading';
    var im = new Image();
    im.onload = function () {
      largeState[url] = 'done';
      if (currentIndex === index) showLarge(url, false);
    };
    im.onerror = function () { largeState[url] = 'error'; };
    im.src = url;
  }

  // ---- zoom / pan ------------------------------------------------------
  var scale = 1, tx = 0, ty = 0;
  var suppressClick = false;

  function dpr() { return window.devicePixelRatio || 1; }
  // scale at which one image pixel maps to one device pixel
  function oneToOne() {
    var fit = stage.offsetWidth || 1;
    var nat = largeShown() ? hiImg.naturalWidth : lightboxImg.naturalWidth;
    return (nat || fit) / (fit * dpr());
  }
  function maxScale() { return Math.min(8, Math.max(2.5, oneToOne())); }
  // untransformed centre of the image, in viewport coordinates
  function center() {
    return { x: stage.offsetLeft + stage.offsetWidth / 2,
             y: stage.offsetTop  + stage.offsetHeight / 2 };
  }
  function clampPan() {
    var c = center();
    var hw = stage.offsetWidth  * scale / 2;
    var hh = stage.offsetHeight * scale / 2;
    var vw = window.innerWidth, vh = window.innerHeight;
    // keep the image edges outside the viewport while it is larger than it,
    // and centred on its resting spot while it is not
    tx = hw * 2 <= vw ? 0 : Math.min(hw - c.x, Math.max(vw - c.x - hw, tx));
    ty = hh * 2 <= vh ? 0 : Math.min(hh - c.y, Math.max(vh - c.y - hh, ty));
  }
  function applyTransform(animate) {
    stage.style.transition = (animate && !reducedMotion) ? 'transform 260ms cubic-bezier(.2,.7,.2,1)' : 'none';
    stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    var zoomed = scale > 1.001;
    lightbox.classList.toggle('is-zoomed', zoomed);
    stage.classList.toggle('is-zoomed', zoomed);
    if (zoomBtn) {
      zoomBtn.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
      zoomBtn.setAttribute('aria-label', zoomed ? 'Reset zoom' : 'Zoom in');
    }
  }
  // zoom so that the point (px, py) stays under the cursor
  function zoomTo(next, px, py, animate) {
    next = Math.min(maxScale(), Math.max(1, next));
    var c = center();
    if (px == null) { px = c.x; py = c.y; }
    var k = next / scale;
    tx = px - c.x - (px - c.x - tx) * k;
    ty = py - c.y - (py - c.y - ty) * k;
    scale = next;
    if (scale === 1) { tx = 0; ty = 0; }
    clampPan();
    applyTransform(animate);
    if (scale > 1) requestLarge(currentIndex);
  }
  function resetZoom(animate) {
    scale = 1; tx = 0; ty = 0;
    applyTransform(animate);
  }
  function toggleZoom(px, py) {
    if (scale > 1) resetZoom(true);
    else zoomTo(Math.max(2, oneToOne()), px, py, true);
  }

  function openLightbox(index) {
    const item = items[index];
    const img = item.querySelector('img');
    if (!img) return;
    if (currentIndex === -1) lastFocus = document.activeElement;
    currentIndex = index;
    resetZoom(false);
    clearLarge();
    // size the frame from the photo's own proportions, whichever file is showing
    var ar = (img.naturalWidth || +img.getAttribute('width') || 3) /
             (img.naturalHeight || +img.getAttribute('height') || 2);
    if (stage !== lightboxImg) stage.style.setProperty('--ar', ar.toFixed(4));
    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt || 'Photograph';
    if (captionEl) {
      const cap = item.querySelector('.gallery-caption');
      const loc = cap && cap.querySelector('.gallery-caption-loc');
      const title = cap ? cap.childNodes[0].textContent.trim() : '';
      captionEl.textContent = loc ? title + ' · ' + loc.textContent.trim() : title;
    }
    if (exifEl) exifEl.textContent = item.dataset.exif || '';
    lightbox.removeAttribute('inert');
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateNav();
    preloadNeighbors();
    if (wantsLargeByDefault(index)) requestLarge(index);
    requestAnimationFrame(function () {
      if (closeBtn) closeBtn.focus();
    });
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    resetZoom(false);
    setTimeout(function () { lightboxImg.src = ''; clearLarge(); }, 300);
    currentIndex = -1;
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
    lastFocus = null;
    // after the focus restore, so we never inert the element holding focus
    lightbox.setAttribute('inert', '');
  }

  function updateNav() {
    const visible = items.filter(isVisible);
    const pos = visible.indexOf(items[currentIndex]);
    const atStart = pos <= 0;
    const atEnd   = pos >= visible.length - 1;
    if (prevBtn) {
      prevBtn.style.opacity = atStart ? '0.2' : '1';
      prevBtn.disabled = atStart;
      prevBtn.setAttribute('aria-disabled', atStart ? 'true' : 'false');
    }
    if (nextBtn) {
      nextBtn.style.opacity = atEnd ? '0.2' : '1';
      nextBtn.disabled = atEnd;
      nextBtn.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
    }
    if (counter) counter.textContent = visible.length > 1 ? (pos + 1) + ' / ' + visible.length : '';
  }

  function isVisible(item) {
    return !item.classList.contains('gallery-hidden');
  }

  function nearestVisible(from, dir) {
    for (var i = from + dir; i >= 0 && i < items.length; i += dir) {
      if (isVisible(items[i])) return i;
    }
    return -1;
  }

  function showPrev() {
    var i = nearestVisible(currentIndex, -1);
    if (i !== -1) openLightbox(i);
  }

  function showNext() {
    var i = nearestVisible(currentIndex, 1);
    if (i !== -1) openLightbox(i);
  }

  // fetch the grid-size images either side so arrows/swipes feel instant
  function preloadNeighbors() {
    [nearestVisible(currentIndex, -1), nearestVisible(currentIndex, 1)].forEach(function (i) {
      if (i === -1) return;
      var im = items[i].querySelector('img');
      if (im) { var pre = new Image(); pre.src = im.currentSrc || im.src; }
    });
  }

  items.forEach(function (item, index) {
    if (!item.hasAttribute('tabindex')) item.setAttribute('tabindex', '0');
    if (!item.hasAttribute('role'))     item.setAttribute('role', 'button');
    if (!item.hasAttribute('aria-label')) {
      const img = item.querySelector('img');
      const alt = img && img.alt ? img.alt : 'photograph';
      item.setAttribute('aria-label', 'View ' + alt + ' full size');
    }
    item.addEventListener('click', function () {
      const img = item.querySelector('img');
      if (!img) return;
      openLightbox(index);
    });
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const img = item.querySelector('img');
        if (!img) return;
        openLightbox(index);
      }
    });
  });

  // click: the photo toggles zoom at the cursor, the backdrop closes
  lightbox.addEventListener('click', function (e) {
    if (swiped) return;
    if (suppressClick) { suppressClick = false; return; }
    if (stage.contains(e.target)) { toggleZoom(e.clientX, e.clientY); return; }
    if (e.target === lightbox) closeLightbox();
  });

  // wheel / trackpad pinch: zoom about the cursor
  lightbox.addEventListener('wheel', function (e) {
    if (!lightbox.classList.contains('active')) return;
    e.preventDefault();
    var factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    zoomTo(scale * factor, e.clientX, e.clientY, false);
  }, { passive: false });

  // drag to pan while zoomed (mouse, pen and single finger)
  var drag = null, pinch = null;
  stage.addEventListener('pointerdown', function (e) {
    if (scale <= 1 || pinch || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: tx, ty: ty, moved: false };
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    stage.classList.add('is-panning');
    e.preventDefault();
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id || pinch) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    tx = drag.tx + dx; ty = drag.ty + dy;
    clampPan();
    applyTransform(false);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var moved = drag.moved;
    drag = null;
    stage.classList.remove('is-panning');
    if (moved) {
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 300);
    }
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // touch: swipe to flip photos when not zoomed, pinch to zoom
  var touchX = 0, touchY = 0, swiped = false;
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  function mid(t)  { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }
  lightbox.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      drag = null;
      stage.classList.remove('is-panning');
      pinch = { d: dist(e.touches), s: scale };
    } else if (e.touches.length === 1) {
      touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
    }
  }, { passive: true });
  lightbox.addEventListener('touchmove', function (e) {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      var m = mid(e.touches);
      zoomTo(pinch.s * dist(e.touches) / pinch.d, m.x, m.y, false);
    }
  }, { passive: false });
  lightbox.addEventListener('touchend', function (e) {
    if (pinch) {
      if (e.touches.length < 2) {
        pinch = null;
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 300);
      }
      return;
    }
    if (scale > 1) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchX, dy = t.clientY - touchY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      setTimeout(function () { swiped = false; }, 400);
      if (dx < 0) showNext(); else showPrev();
    }
  }, { passive: true });

  window.addEventListener('resize', function () {
    if (scale > 1) { clampPan(); applyTransform(false); }
  });

  closeBtn && closeBtn.addEventListener('click', closeLightbox);
  zoomBtn  && zoomBtn.addEventListener('click',  function (e) { e.stopPropagation(); toggleZoom(); });
  prevBtn  && prevBtn.addEventListener('click',  function (e) { e.stopPropagation(); showPrev(); });
  nextBtn  && nextBtn.addEventListener('click',  function (e) { e.stopPropagation(); showNext(); });

  document.addEventListener('keydown', function (e) {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape')     { if (scale > 1) resetZoom(true); else closeLightbox(); return; }
    if (e.key === 'ArrowLeft')  { showPrev(); return; }
    if (e.key === 'ArrowRight') { showNext(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(scale * 1.5, null, null, true); return; }
    if (e.key === '-')          { e.preventDefault(); zoomTo(scale / 1.5, null, null, true); return; }
    if (e.key === '0')          { resetZoom(true); return; }
    if (e.key === 'Tab') {
      const focusable = [closeBtn, zoomBtn, prevBtn, nextBtn].filter(function (b) {
        return b && !b.disabled;
      });
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      } else if (focusable.indexOf(document.activeElement) === -1) {
        e.preventDefault(); first.focus();
      }
    }
  });
})();


// --- Gallery location filter ---
(function () {
  const bar = document.querySelector('.gallery-filter');
  if (!bar) return;
  const chips = Array.from(bar.querySelectorAll('[data-filter]'));
  const items = Array.from(document.querySelectorAll('.gallery-full .gallery-item'));
  const announce = document.getElementById('gallery-announce');

  function apply(loc, push) {
    let shown = 0;
    items.forEach(function (it) {
      const show = loc === 'all' || it.getAttribute('data-loc') === loc;
      it.classList.toggle('gallery-hidden', !show);
      if (show) shown++;
    });
    chips.forEach(function (c) {
      const active = c.getAttribute('data-filter') === loc;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    // the grid changes silently otherwise — nothing tells a screen reader
    if (announce && push !== false) {
      announce.textContent = shown + (shown === 1 ? ' photo' : ' photos') +
        (loc === 'all' ? '' : ' from ' + loc);
    }
    window.dispatchEvent(new CustomEvent('gallery:filtered'));
    if (push !== false) {
      if (loc === 'all') history.replaceState(null, '', location.pathname + location.search);
      else history.replaceState(null, '', '#' + loc.replace(/ /g, '-'));
    }
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () { apply(c.getAttribute('data-filter'), true); });
  });

  var initial = decodeURIComponent((location.hash || '').replace('#', '')).replace(/-/g, ' ');
  if (!chips.some(function (c) { return c.getAttribute('data-filter') === initial; })) initial = 'all';
  apply(initial, false);
})();


// --- Justified gallery rows (full frames, no crops) ---
(function () {
  const grid = document.querySelector('.gallery-full');
  if (!grid) return;
  const items = Array.from(grid.querySelectorAll('.gallery-item'));
  if (!items.length) return;

  const ratios = items.map(function (it) {
    const im = it.querySelector('img');
    const w = parseInt(im && im.getAttribute('width'), 10) || 3;
    const h = parseInt(im && im.getAttribute('height'), 10) || 2;
    return w / h;
  });

  grid.classList.add('gallery-justified');
  items.forEach(function (it) {
    const im = it.querySelector('img');
    if (!im) return;
    if (im.complete && im.naturalWidth) im.classList.add('is-loaded');
    else im.addEventListener('load', function () { im.classList.add('is-loaded'); }, { once: true });
  });

  function layout() {
    const W = grid.getBoundingClientRect().width;
    if (!W) return;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 12;
    // One photo per row on phones. Otherwise aim high (55% of the grid width,
    // capped at 600px): a row's real height is bounded by width / sum of its
    // aspect ratios, so a tall target just means fewer photos per row — two
    // landscapes, or a landscape beside a portrait, at roughly three times the
    // area of the old three-up layout.
    const target = W < 560 ? Infinity : Math.min(600, W * 0.55);
    let row = [], sum = 0;
    function flush(justify) {
      if (!row.length) return;
      const gaps = gap * (row.length - 1);
      const h = justify ? (W - gaps - 0.5) / sum : Math.min(target, (W - gaps - 0.5) / sum);
      row.forEach(function (i) {
        items[i].style.width = (ratios[i] * h).toFixed(2) + 'px';
        items[i].style.height = h.toFixed(2) + 'px';
      });
      row = []; sum = 0;
    }
    items.forEach(function (it, i) {
      if (it.classList.contains('gallery-hidden')) return;
      row.push(i); sum += ratios[i];
      if (sum * target + gap * (row.length - 1) >= W) flush(true);
    });
    flush(false);
  }

  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }
  window.addEventListener('resize', schedule);
  window.addEventListener('gallery:filtered', schedule);
  layout();
})();
