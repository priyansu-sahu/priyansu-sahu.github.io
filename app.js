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

    // Swap theme at the midpoint of the animation (when icon is smallest)
    setTimeout(function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      try { localStorage.setItem('theme', theme); } catch(e) {}
      toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
      updateToggleIcon();
    }, 200);

    // Clean up animation class
    setTimeout(function () { toggle.classList.remove('toggling'); }, 500);
  });

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

// --- Lightbox with prev/next + keyboard/focus management ---
(function () {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return; // guard — not all pages have a lightbox

  const lightboxImg = document.getElementById('lightbox-img');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn   = document.getElementById('lightbox-prev');
  const nextBtn   = document.getElementById('lightbox-next');
  const counter   = document.getElementById('lightbox-counter');
  const captionEl = document.getElementById('lightbox-caption');
  const exifEl    = document.getElementById('lightbox-exif');

  const items = Array.from(document.querySelectorAll('[data-lightbox]'));
  let currentIndex = -1;
  let lastFocus = null;

  function openLightbox(index) {
    const item = items[index];
    const img = item.querySelector('img');
    if (!img) return;
    if (currentIndex === -1) lastFocus = document.activeElement;
    currentIndex = index;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || 'Photograph';
    if (captionEl) {
      const cap = item.querySelector('.gallery-caption');
      const loc = cap && cap.querySelector('.gallery-caption-loc');
      const title = cap ? cap.childNodes[0].textContent.trim() : '';
      captionEl.textContent = loc ? title + ' · ' + loc.textContent.trim() : title;
    }
    if (exifEl) exifEl.textContent = item.dataset.exif || '';
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateNav();
    preloadNeighbors();
    requestAnimationFrame(function () {
      if (closeBtn) closeBtn.focus();
    });
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    setTimeout(function () { lightboxImg.src = ''; }, 300);
    currentIndex = -1;
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
    lastFocus = null;
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

  // fetch the full images either side so arrows/swipes feel instant
  function preloadNeighbors() {
    [nearestVisible(currentIndex, -1), nearestVisible(currentIndex, 1)].forEach(function (i) {
      if (i === -1) return;
      var im = items[i].querySelector('img');
      if (im) { var pre = new Image(); pre.src = im.src; }
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

  lightbox.addEventListener('click', function (e) {
    if (swiped) return;
    if (e.target === lightbox || e.target === lightboxImg) closeLightbox();
  });

  // touch swipe to flip photos
  var touchX = 0, touchY = 0, swiped = false;
  lightbox.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }
  }, { passive: true });
  lightbox.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0];
    var dx = t.clientX - touchX, dy = t.clientY - touchY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      setTimeout(function () { swiped = false; }, 400);
      if (dx < 0) showNext(); else showPrev();
    }
  }, { passive: true });

  closeBtn && closeBtn.addEventListener('click', closeLightbox);
  prevBtn  && prevBtn.addEventListener('click',  function (e) { e.stopPropagation(); showPrev(); });
  nextBtn  && nextBtn.addEventListener('click',  function (e) { e.stopPropagation(); showNext(); });

  document.addEventListener('keydown', function (e) {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape')     { closeLightbox(); return; }
    if (e.key === 'ArrowLeft')  { showPrev(); return; }
    if (e.key === 'ArrowRight') { showNext(); return; }
    if (e.key === 'Tab') {
      const focusable = [closeBtn, prevBtn, nextBtn].filter(function (b) {
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

  function apply(loc, push) {
    items.forEach(function (it) {
      const show = loc === 'all' || it.getAttribute('data-loc') === loc;
      it.classList.toggle('gallery-hidden', !show);
    });
    chips.forEach(function (c) {
      const active = c.getAttribute('data-filter') === loc;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
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
    const target = W < 560 ? 280 : W < 900 ? 260 : 320;
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
