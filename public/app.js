// ── API helper ────────────────────────────────────────────────────────────────

const api = {
  async req(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (res.status === 401) {
      const onAuth = location.pathname === '/' || location.pathname.endsWith('index.html');
      if (!onAuth) location.href = '/index.html';
      return null;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
    return body;
  },
  get: (path) => api.req(path),
  post: (path, body) => api.req(path, { method: 'POST', body: JSON.stringify(body) }),
  del: (path) => api.req(path, { method: 'DELETE' }),
};

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── Auth page ─────────────────────────────────────────────────────────────────

async function initAuth() {
  // Redirect if already logged in
  const check = await fetch('/api/decks', { credentials: 'same-origin' });
  if (check.ok) {
    location.href = '/decks.html';
    return;
  }

  const errEl = document.getElementById('auth-error');

  document.querySelectorAll('.tab-btn').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.auth-form').forEach((f) => {
        f.hidden = f.id !== tab.dataset.tab + '-form';
      });
      errEl.hidden = true;
    }),
  );

  ['login', 'register'].forEach((action) => {
    document.getElementById(action + '-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await api.post('/api/auth/' + action, {
          email: fd.get('email'),
          password: fd.get('password'),
        });
        location.href = '/decks.html';
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
  });
}

// ── Decks page ────────────────────────────────────────────────────────────────

async function initDecks() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/api/auth/logout', {});
    location.href = '/index.html';
  });

  const newForm = document.getElementById('new-deck-form');
  document.getElementById('new-deck-btn').addEventListener('click', () => {
    newForm.hidden = !newForm.hidden;
    if (!newForm.hidden) newForm.querySelector('[name="name"]').focus();
  });

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('[type="submit"]');
    const errEl = document.getElementById('deck-error');
    btn.disabled = true;
    errEl.hidden = true;
    try {
      await api.post('/api/decks', {
        name: fd.get('name'),
        sourceLang: fd.get('sourceLang') || 'en',
        targetLang: fd.get('targetLang') || 'es',
        newPerDay: Number(fd.get('newPerDay')) || 20,
      });
      e.target.reset();
      newForm.hidden = true;
      await loadDecks();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  await loadDecks();
}

async function loadDecks() {
  const list = document.getElementById('decks-list');
  const decks = await api.get('/api/decks');
  if (!decks) return;

  if (decks.length === 0) {
    list.innerHTML = '<p class="empty">No decks yet — create your first one above.</p>';
    return;
  }

  list.innerHTML = decks
    .map(
      (d) => `
    <div class="deck-card" data-id="${d._id}">
      <div class="deck-header">
        <div class="deck-info">
          <h3 class="deck-name">${esc(d.name)}</h3>
          <div class="deck-meta">${esc(d.sourceLang)} → ${esc(d.targetLang)}</div>
          <div class="deck-stats">
            ${d.due > 0 ? `<span class="badge badge-due">${d.due} due</span>` : ''}
            <span class="badge badge-total">${d.total} ${d.total === 1 ? 'card' : 'cards'}</span>
          </div>
        </div>
        <div class="deck-actions">
          <a href="/study.html?deck=${d._id}&name=${encodeURIComponent(d.name)}"
             class="btn btn-primary">Study</a>
          <button class="btn btn-ghost" data-action="cards" data-id="${d._id}">Cards</button>
          <button class="btn btn-ghost btn-danger-hover" data-action="delete" data-id="${d._id}">Delete</button>
        </div>
      </div>
      <div class="cards-panel" id="panel-${d._id}" hidden></div>
    </div>`,
    )
    .join('');

  list
    .querySelectorAll('[data-action="cards"]')
    .forEach((b) => b.addEventListener('click', () => togglePanel(b.dataset.id)));
  list
    .querySelectorAll('[data-action="delete"]')
    .forEach((b) =>
      b.addEventListener('click', () => deleteDeck(b.dataset.id, b.closest('.deck-card'))),
    );
}

async function togglePanel(deckId) {
  const panel = document.getElementById('panel-' + deckId);
  if (!panel.hidden) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  await loadCards(deckId);
}

async function loadCards(deckId) {
  const panel = document.getElementById('panel-' + deckId);
  panel.innerHTML = '<p class="loading" style="padding:1.25rem">Loading…</p>';
  try {
    const cards = await api.get('/api/decks/' + deckId + '/cards');
    if (!cards) return;

    panel.innerHTML = `
      <div class="panel-inner">
        <form class="add-card-form">
          <div class="form-row">
            <input class="input" name="front" placeholder="Word / phrase (front)" required autocomplete="off" />
            <input class="input" name="back"  placeholder="Translation — blank to use AI" />
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
          <div class="card-search-results" hidden></div>
          <p class="add-hint">Leave translation blank and Gemini fills it in automatically.</p>
          <p class="add-status"></p>
        </form>
        <div class="io-bar">
          <a class="btn btn-ghost btn-sm" href="/api/decks/${deckId}/export.csv" download>↓ Export CSV</a>
          <label class="btn btn-ghost btn-sm io-import-label">
            ↑ Import CSV
            <input type="file" accept=".csv,text/csv" class="import-input" />
          </label>
          <p class="import-status"></p>
        </div>
        <div class="card-list" id="clist-${deckId}">${renderCardRows(cards)}</div>
      </div>`;

    panel.querySelector('.add-card-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const status = panel.querySelector('.add-status');
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true;
      status.textContent = fd.get('back').trim() ? 'Adding…' : '⏳ Generating translation with AI…';
      try {
        await api.post('/api/decks/' + deckId + '/cards', {
          front: fd.get('front'),
          back: fd.get('back'),
        });
        e.target.reset();
        const resultsBox = e.target.querySelector('.card-search-results');
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        status.textContent = '✅ Card added!';
        const updated = await api.get('/api/decks/' + deckId + '/cards');
        if (updated) {
          document.getElementById('clist-' + deckId).innerHTML = renderCardRows(updated);
          attachDeleters(deckId);
          refreshDeckBadge(deckId, updated.length);
        }
        setTimeout(() => {
          status.textContent = '';
        }, 2500);
      } catch (err) {
        status.textContent = '❌ ' + err.message;
      } finally {
        btn.disabled = false;
      }
    });

    attachDeleters(deckId);

    // Live-search the user's existing cards while typing the front, to spot duplicates.
    const frontInput = panel.querySelector('.add-card-form [name="front"]');
    const resultsBox = panel.querySelector('.card-search-results');
    let searchTimer;
    let searchSeq = 0;
    frontInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = frontInput.value.trim();
      if (q.length < 2) {
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        return;
      }
      searchTimer = setTimeout(async () => {
        const seq = ++searchSeq;
        const matches = await api.get('/api/cards/search?q=' + encodeURIComponent(q));
        // Ignore stale responses that resolved out of order.
        if (seq !== searchSeq || !matches) return;
        if (!matches.length) {
          resultsBox.hidden = true;
          resultsBox.innerHTML = '';
          return;
        }
        resultsBox.innerHTML =
          `<p class="card-search-label">Existing cards (${matches.length}):</p>` +
          matches
            .map(
              (m) => `
        <div class="card-search-item">
          <span class="card-search-front">${esc(m.front)}</span>
          <span class="card-arrow">→</span>
          <span class="card-search-back">${m.back ? esc(stripHtml(m.back)) : '<em class="muted">no translation</em>'}</span>
          <span class="card-search-deck${m.deckId === deckId ? ' is-current' : ''}">${m.deckId === deckId ? 'this deck' : esc(m.deckName)}</span>
        </div>`,
            )
            .join('');
        resultsBox.hidden = false;
      }, 250);
    });
    frontInput.addEventListener('blur', () => {
      // Delay so a click inside the results can still register before hiding.
      setTimeout(() => {
        resultsBox.hidden = true;
      }, 150);
    });
    frontInput.addEventListener('focus', () => {
      if (resultsBox.innerHTML) resultsBox.hidden = false;
    });

    panel.querySelector('.import-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = panel.querySelector('.import-status');
      status.textContent = '⏳ Importing…';
      try {
        const csv = await file.text();
        const result = await api.post('/api/decks/' + deckId + '/import', { csv });
        status.textContent = `✅ Imported ${result.imported} card${result.imported !== 1 ? 's' : ''}`;
        const updated = await api.get('/api/decks/' + deckId + '/cards');
        if (updated) {
          document.getElementById('clist-' + deckId).innerHTML = renderCardRows(updated);
          attachDeleters(deckId);
          refreshDeckBadge(deckId, updated.length);
        }
        setTimeout(() => {
          status.textContent = '';
        }, 3000);
      } catch (err) {
        status.textContent = '❌ ' + err.message;
      } finally {
        e.target.value = '';
      }
    });
  } catch (err) {
    panel.innerHTML = `<p class="error-msg" style="padding:1.25rem">Error: ${esc(err.message)}</p>`;
  }
}

async function showEditCardModal(cardId) {
  // First, get the card details
  const card = await api.get('/api/cards/' + cardId);
  if (!card) {
    alert('Card not found');
    return;
  }

  // Create modal HTML
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Edit Card</h3>
        <button class="btn btn-ghost modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="edit-front">Front (Word/Phrase):</label>
          <input type="text" id="edit-front" class="input" value="${esc(card.front)}" readonly />
        </div>
        <div class="form-group">
          <label for="edit-back">Back (Translation):</label>
          <textarea id="edit-back" class="input" rows="3">${esc(card.back)}</textarea>
        </div>
        <div class="form-group">
          <label for="edit-example">Example Sentence:</label>
          <textarea id="edit-example" class="input" rows="2">${esc(card.exampleSentence)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary modal-save">Save Changes</button>
      </div>
    </div>
  `;

  // Add modal to page
  document.body.appendChild(modal);

  // Handle modal events
  modal.querySelector('.modal-close').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.querySelector('.modal-cancel').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.querySelector('.modal-save').addEventListener('click', async () => {
    const front = document.getElementById('edit-front').value;
    const back = document.getElementById('edit-back').value;
    const example = document.getElementById('edit-example').value;

    try {
      await api.patch('/api/cards/' + cardId, { front, back, exampleSentence: example });
      document.body.removeChild(modal);
      // Refresh the card list
      const deckId = new URLSearchParams(location.search).get('deck');
      if (deckId) {
        const updated = await api.get('/api/decks/' + deckId + '/cards');
        if (updated) {
          document.getElementById('clist-' + deckId).innerHTML = renderCardRows(updated);
          attachDeleters(deckId);
        }
      }
    } catch (err) {
      alert('Error saving card: ' + err.message);
    }
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderCardRows(cards) {
  if (!cards.length) return '<p class="empty" style="padding:.5rem 0">No cards yet.</p>';
  return cards
    .map(
      (c) => `
    <div class="card-row">
      <span class="card-front-text">${esc(c.front)}</span>
      <span class="card-arrow">→</span>
      <span class="card-back-text">${c.back ? esc(stripHtml(c.back)) : '<em class="muted">no translation</em>'}</span>
      <button class="btn btn-sm btn-ghost edit-card-btn" data-id="${c._id}">✏️</button>
      <button class="btn btn-sm btn-ghost btn-danger-hover del-card-btn" data-id="${c._id}">✕</button>
    </div>`,
    )
    .join('');
}

function attachDeleters(deckId) {
  document
    .getElementById('clist-' + deckId)
    .querySelectorAll('.del-card-btn')
    .forEach((btn) =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api.del('/api/cards/' + btn.dataset.id);
          const updated = await api.get('/api/decks/' + deckId + '/cards');
          if (updated) {
            document.getElementById('clist-' + deckId).innerHTML = renderCardRows(updated);
            attachDeleters(deckId);
            refreshDeckBadge(deckId, updated.length);
          }
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      }),
    );

  document
    .getElementById('clist-' + deckId)
    .querySelectorAll('.edit-card-btn')
    .forEach((btn) =>
      btn.addEventListener('click', async () => {
        await showEditCardModal(btn.dataset.id);
      }),
    );
}

function refreshDeckBadge(deckId, total) {
  const el = document.querySelector(`.deck-card[data-id="${deckId}"] .badge-total`);
  if (el) el.textContent = total + ' ' + (total === 1 ? 'card' : 'cards');
}

async function deleteDeck(deckId, el) {
  if (!confirm('Delete this deck and all its cards?')) return;
  try {
    await api.del('/api/decks/' + deckId);
    el.remove();
    const list = document.getElementById('decks-list');
    if (!list.querySelector('.deck-card'))
      list.innerHTML = '<p class="empty">No decks yet — create your first one above.</p>';
  } catch (err) {
    alert(err.message);
  }
}

// ── Study page ────────────────────────────────────────────────────────────────

let queue = [];
let qIdx = 0;
let flipped = false;

async function initStudy() {
  const params = new URLSearchParams(location.search);
  const deckId = params.get('deck');
  if (!deckId) {
    location.href = '/decks.html';
    return;
  }

  document.getElementById('deck-title').textContent = params.get('name') || 'Study';
  document.getElementById('end-btn').addEventListener('click', () => {
    location.href = '/decks.html';
  });
  document.getElementById('study-card').addEventListener('click', reveal);
  document.getElementById('flip-btn').addEventListener('click', reveal);
  document
    .querySelectorAll('.grade-btn')
    .forEach((b) => b.addEventListener('click', () => grade(b.dataset.grade)));
  document.addEventListener('keydown', onKey);

  const data = await api.get('/api/study/' + deckId);
  if (!data) return;

  queue = [...data.due, ...data.new];
  qIdx = 0;
  queue.length === 0 ? done(true) : showCard();
}

function showCard() {
  if (qIdx >= queue.length) {
    done(false);
    return;
  }
  flipped = false;

  const card = queue[qIdx];
  const rem = queue.length - qIdx;
  document.getElementById('progress').textContent =
    rem + ' card' + (rem !== 1 ? 's' : '') + ' remaining';

  document.getElementById('card-front-text').textContent = card.front;
  // back may contain HTML (e.g. imported as <b>translation</b><br><i>example</i>)
  document.getElementById('card-back-text').innerHTML = card.back || '';
  const exEl = document.getElementById('card-example');
  exEl.textContent = card.exampleSentence || '';
  exEl.hidden = !card.exampleSentence;

  document.getElementById('study-card').classList.remove('flipped');
  document.getElementById('flip-btn').hidden = false;
  document.getElementById('grade-buttons').hidden = true;
}

function reveal() {
  if (flipped) return;
  flipped = true;
  document.getElementById('study-card').classList.add('flipped');
  document.getElementById('flip-btn').hidden = true;
  document.getElementById('grade-buttons').hidden = false;
}

async function grade(g) {
  if (!flipped) return;
  const card = queue[qIdx];
  try {
    await api.post('/api/study/' + card._id + '/review', { grade: g });
  } catch {
    /* review POST failing is non-fatal */
  }
  if (g === 'again' && !card._requeued) queue.push({ ...card, _requeued: true });
  qIdx++;
  showCard();
}

function onKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    reveal();
  } else if (e.key === '1') grade('again');
  else if (e.key === '2') grade('hard');
  else if (e.key === '3') grade('good');
  else if (e.key === '4') grade('easy');
}

function done(wasEmpty) {
  document.getElementById('study-area').hidden = true;
  document.getElementById('done-screen').hidden = false;
  document.getElementById('done-message').textContent = wasEmpty
    ? 'Nothing due — come back tomorrow! 🌙'
    : '🎉 Session complete!';
  document.removeEventListener('keydown', onKey);
}

// ── Router ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const p = location.pathname;
  if (p.includes('study')) initStudy();
  else if (p.includes('decks')) initDecks();
  else initAuth();
});
