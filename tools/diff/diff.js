/* ============================================================
   Diff Checker — line diff + inline character diff
   No dependencies, pure JS
   ============================================================ */

(function () {

  const compareBtn = document.getElementById('compare-btn');
  const clearBtn   = document.getElementById('clear-btn');
  const textA      = document.getElementById('text-a');
  const textB      = document.getElementById('text-b');
  const output     = document.getElementById('diff-output');
  const stats      = document.getElementById('diff-stats');

  if (!compareBtn) return;

  // ============================================================
  // LCS helper — works for both lines (strings) and chars
  // ============================================================

  function buildLCS(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1] + 1
          : Math.max(dp[i-1][j], dp[i][j-1]);
    return dp;
  }

  function lineDiff(linesA, linesB) {
    const dp = buildLCS(linesA, linesB);
    const result = [];
    let i = linesA.length, j = linesB.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && linesA[i-1] === linesB[j-1]) {
        result.push({ type: 'equal', a: linesA[i-1], b: linesB[j-1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        result.push({ type: 'added', b: linesB[j-1] });
        j--;
      } else {
        result.push({ type: 'removed', a: linesA[i-1] });
        i--;
      }
    }
    return result.reverse();
  }

  // ============================================================
  // Inline character diff — returns HTML string
  // ============================================================

  function charDiff(strA, strB) {
    const a = strA.split('');
    const b = strB.split('');
    const dp = buildLCS(a, b);

    const seqA = [], seqB = [];
    let i = a.length, j = b.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
        seqA.unshift({ type: 'equal', ch: a[i-1] });
        seqB.unshift({ type: 'equal', ch: b[j-1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        seqB.unshift({ type: 'added', ch: b[j-1] });
        j--;
      } else {
        seqA.unshift({ type: 'removed', ch: a[i-1] });
        i--;
      }
    }

    function toHTML(seq, highlightType) {
      let html = '';
      let buf = '', inHighlight = false;
      for (const token of seq) {
        const isHighlight = token.type === highlightType;
        if (isHighlight !== inHighlight) {
          if (buf) html += inHighlight ? `<mark class="diff-mark">${esc(buf)}</mark>` : esc(buf);
          buf = '';
          inHighlight = isHighlight;
        }
        buf += token.ch;
      }
      if (buf) html += inHighlight ? `<mark class="diff-mark">${esc(buf)}</mark>` : esc(buf);
      return html;
    }

    return {
      htmlA: toHTML(seqA, 'removed'),
      htmlB: toHTML(seqB, 'added'),
    };
  }

  function esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ============================================================
  // Pair up adjacent removed/added lines for inline diff
  // ============================================================

  function pairChanges(diffResult) {
    // Group consecutive removed/added into pairs for inline diffing
    const paired = [];
    let i = 0;
    while (i < diffResult.length) {
      const entry = diffResult[i];
      if (entry.type === 'removed') {
        // Look ahead for a matching added line
        let j = i + 1;
        while (j < diffResult.length && diffResult[j].type === 'removed') j++;
        // Collect removed block, then added block
        const removed = diffResult.slice(i, j);
        let k = j;
        while (k < diffResult.length && diffResult[k].type === 'added') k++;
        const added = diffResult.slice(j, k);
        // Pair them 1:1 where possible
        const pairs = Math.min(removed.length, added.length);
        for (let p = 0; p < pairs; p++) {
          paired.push({ type: 'changed', a: removed[p].a, b: added[p].b });
        }
        for (let p = pairs; p < removed.length; p++) {
          paired.push({ type: 'removed', a: removed[p].a });
        }
        for (let p = pairs; p < added.length; p++) {
          paired.push({ type: 'added', b: added[p].b });
        }
        i = k;
      } else {
        paired.push(entry);
        i++;
      }
    }
    return paired;
  }

  // ============================================================
  // Render
  // ============================================================

  function renderDiff(diffResult) {
    output.innerHTML = '';
    const paired = pairChanges(diffResult);
    let lineNumA = 1, lineNumB = 1;
    let added = 0, removed = 0;

    paired.forEach(function (entry) {
      if (entry.type === 'equal') {
        const row = makeLine('equal', lineNumA, esc(entry.a));
        output.appendChild(row);
        lineNumA++; lineNumB++;

      } else if (entry.type === 'changed') {
        // Inline char diff
        const { htmlA, htmlB } = charDiff(entry.a, entry.b);
        output.appendChild(makeLine('removed', lineNumA, htmlA, true));
        output.appendChild(makeLine('added',   lineNumB, htmlB, true));
        lineNumA++; lineNumB++;
        removed++; added++;

      } else if (entry.type === 'removed') {
        output.appendChild(makeLine('removed', lineNumA, esc(entry.a)));
        lineNumA++; removed++;

      } else if (entry.type === 'added') {
        output.appendChild(makeLine('added', lineNumB, esc(entry.b)));
        lineNumB++; added++;
      }
    });

    // Stats
    if (added === 0 && removed === 0) {
      stats.textContent = 'texts are identical';
    } else {
      const parts = [];
      if (added)   parts.push('+' + added + ' line' + (added > 1 ? 's' : ''));
      if (removed) parts.push('-' + removed + ' line' + (removed > 1 ? 's' : ''));
      stats.textContent = parts.join('  ');
    }
  }

  function makeLine(type, lineNum, innerHTML, rawHTML) {
    const row = document.createElement('div');
    row.className = 'diff-line diff-line--' + type;

    const numEl = document.createElement('div');
    numEl.className = 'diff-line-num';
    numEl.textContent = lineNum;

    const contentEl = document.createElement('div');
    contentEl.className = 'diff-line-content';
    contentEl.innerHTML = innerHTML;

    row.appendChild(numEl);
    row.appendChild(contentEl);
    return row;
  }

  // ============================================================
  // Event handlers
  // ============================================================

  compareBtn.addEventListener('click', function () {
    const MAX_LEN = 1_000_000;
    if (textA.value.length > MAX_LEN || textB.value.length > MAX_LEN) {
      output.innerHTML = '<div class="diff-empty">Inputs over 1 MB are not supported. Please trim and try again.</div>';
      stats.textContent = '';
      return;
    }
    if (!textA.value.trim() && !textB.value.trim()) {
      output.innerHTML = '<div class="diff-empty">Paste text into both fields to compare.</div>';
      stats.textContent = '';
      return;
    }
    const linesA = textA.value.split('\n');
    const linesB = textB.value.split('\n');
    const result = lineDiff(linesA, linesB);
    renderDiff(result);
    output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  clearBtn.addEventListener('click', function () {
    textA.value = '';
    textB.value = '';
    output.innerHTML = '';
    stats.textContent = '';
    textA.focus();
  });

  [textA, textB].forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        compareBtn.click();
      }
    });
  });

})();
