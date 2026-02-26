/**
 * wishlist-page.js
 *
 * Renders the Wishlist page. Load only on the wishlist page template.
 *
 * Requires (loaded globally in theme.liquid):
 *   • wishlist-button.js
 *   • wishlist-count.js
 *
 * ─── How cards render ─────────────────────────────────────────────────────────
 *  JS fetches wishlist item handles, then calls Shopify's Section Rendering API:
 *    /products/{handle}?sections=wishlist-product-card
 *  Returns fully Liquid-rendered HTML with real prices, images, availability.
 *
 * ─── Guest handle resolution ──────────────────────────────────────────────────
 *  shopify_wishlist       → product IDs (always present)
 *  shopify_wishlist_meta  → { id: { handle } } (present since wishlist-button v2)
 *
 *  For IDs missing from meta (added before handle-caching), we use a HEAD
 *  request to /products/{numericId}. Shopify redirects:
 *    /products/15573512093777 → /products/mayil-matta-rice
 *  We extract the handle from response.url and backfill the cache.
 */

(function () {
  'use strict';

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';
  const PAGE_LIMIT    = window.WishlistConfig?.pageLimit   ?? 12;
  const CARD_SECTION  = window.WishlistConfig?.cardSection ?? 'wishlist-product-card';

  const STORAGE_KEY      = 'shopify_wishlist';
  const STORAGE_META_KEY = 'shopify_wishlist_meta';

  // ─── DOM refs ─────────────────────────────────────────────────────────────────

  const elLoading    = document.getElementById('wishlist-loading');
  const elEmpty      = document.getElementById('wishlist-empty');
  const elError      = document.getElementById('wishlist-error');
  const elResults    = document.getElementById('wishlist-results');
  const elGrid       = document.getElementById('wishlist-grid');
  const elPagination = document.getElementById('wishlist-pagination');
  const retryBtn     = document.getElementById('wishlist-retry-btn');

  // ─── Pagination state ─────────────────────────────────────────────────────────

  let serverCursor = null;
  let prevCursors  = [];
  let localPage    = 0;

  // ─── UI state ─────────────────────────────────────────────────────────────────

  const show = el => el?.classList.remove('hidden');
  const hide = el => el?.classList.add('hidden');

  function showLoading() { show(elLoading); hide(elEmpty); hide(elError); hide(elResults); }
  function showEmpty()   { hide(elLoading); show(elEmpty); hide(elError); hide(elResults); }
  function showError()   { hide(elLoading); hide(elEmpty); show(elError); hide(elResults); }
  function showResults() { hide(elLoading); hide(elEmpty); hide(elError); show(elResults); }

  // ─── localStorage helpers ─────────────────────────────────────────────────────

  function getLocalIds() {
    try   { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function getLocalMeta() {
    try   { return JSON.parse(localStorage.getItem(STORAGE_META_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveLocalMeta(meta) {
    try { localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta)); } catch {}
  }

  function removeLocalId(productId) {
    try {
      const ids = getLocalIds().filter(id => id !== productId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {}
    try {
      const meta = getLocalMeta();
      delete meta[productId];
      saveLocalMeta(meta);
    } catch {}
  }

  // ─── Handle resolution ────────────────────────────────────────────────────────

  /**
   * Resolve a product handle from a numeric ID using Shopify's redirect.
   *
   * Shopify redirects  /products/{numericId}  →  /products/{handle}
   * fetch() with redirect:'follow' follows it; response.url gives us the handle.
   *
   * Returns null if the product doesn't exist or the redirect fails.
   */
  async function resolveHandleFromId(productId) {
    try {
      const res = await fetch(`/products/${productId}`, {
        method:   'HEAD',
        redirect: 'follow'
      });
      if (!res.ok) return null;

      // Extract handle from final URL: /products/mayil-matta-rice → "mayil-matta-rice"
      const match  = res.url.match(/\/products\/([^?#/]+)/);
      const handle = match?.[1];

      // If it didn't redirect (stayed as the numeric ID), it failed
      if (!handle || handle === String(productId)) return null;

      return handle;
    } catch {
      return null;
    }
  }

  /**
   * One-time migration for IDs with no cached handle.
   * Runs parallel HEAD requests for all orphaned IDs, then backfills meta.
   * Subsequent page loads will be instant (cache hit).
   */
  async function migrateOrphanedIds() {
    const allIds  = getLocalIds();
    const meta    = getLocalMeta();
    const orphans = allIds.filter(id => !meta[id]?.handle);
    if (!orphans.length) return;

    const results = await Promise.allSettled(orphans.map(resolveHandleFromId));
    const updated = getLocalMeta(); // re-read in case wishlist-button wrote concurrently
    let   count   = 0;

    results.forEach((r, i) => {
      const handle = r.status === 'fulfilled' ? r.value : null;
      if (handle) {
        updated[orphans[i]] = { handle, title: '', image: '' };
        count++;
      }
    });

    if (count > 0) saveLocalMeta(updated);
  }

  /**
   * Resolve an array of IDs to handles.
   * Primary: meta cache. Fallback: live HEAD request (caches result).
   */
  async function resolveHandlesForIds(ids) {
    const resolved = await Promise.all(
      ids.map(async id => {
        const meta = getLocalMeta();
        if (meta[id]?.handle) return { id, handle: meta[id].handle };

        // Live fallback for any ID still missing after migration
        const handle = await resolveHandleFromId(id);
        if (handle) {
          const m = getLocalMeta();
          m[id] = { handle, title: '', image: '' };
          saveLocalMeta(m);
          return { id, handle };
        }
        return null;
      })
    );

    // Return in original order, drop unresolvable IDs (deleted products)
    return ids
      .map(id => resolved.find(r => r?.id === id)?.handle)
      .filter(Boolean);
  }

  // ─── Section Rendering API ────────────────────────────────────────────────────

  async function fetchCardHTML(handle) {
    try {
      const res = await fetch(
        `/products/${encodeURIComponent(handle)}?sections=${encodeURIComponent(CARD_SECTION)}`,
        { headers: { 'X-Requested-With': 'fetch' } }
      );
      if (!res.ok) {
        console.warn(`[Wishlist] Section render failed for "${handle}": ${res.status}`);
        return null;
      }
      const json = await res.json();
      return json[CARD_SECTION] ?? null;
    } catch (e) {
      console.error(`[Wishlist] fetchCardHTML "${handle}":`, e);
      return null;
    }
  }

  async function renderGrid(handles) {
    elGrid.innerHTML = '';

    // Pre-insert ordered slot divs — locks positions before parallel fetches return
    const slots = handles.map(handle => {
      const slot = document.createElement('div');
      slot.className      = 'wishlist-card-slot';
      slot.dataset.handle = handle;
      elGrid.appendChild(slot);
      return slot;
    });

    const htmlResults = await Promise.all(handles.map(fetchCardHTML));

    htmlResults.forEach((html, i) => {
      if (html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        slots[i].replaceWith(tmp.firstElementChild);
      } else {
        slots[i].remove();
      }
    });
  }

  // ─── Pagination ───────────────────────────────────────────────────────────────

  function renderPagination({ hasNext, hasPrev }) {
    elPagination.innerHTML = '';
    if (!hasNext && !hasPrev) return;

    if (hasPrev) {
      const btn = document.createElement('button');
      btn.className   = 'button button--secondary wishlist-pagination__btn';
      btn.textContent = '← Previous';
      btn.addEventListener('click', IS_LOGGED_IN ? handleServerPrev : handleLocalPrev);
      elPagination.appendChild(btn);
    }
    if (hasNext) {
      const btn = document.createElement('button');
      btn.className   = 'button button--primary wishlist-pagination__btn';
      btn.textContent = 'Next →';
      btn.addEventListener('click', IS_LOGGED_IN ? handleServerNext : handleLocalNext);
      elPagination.appendChild(btn);
    }
  }

  // ─── Count sync ───────────────────────────────────────────────────────────────

  function broadcastCount(n) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      if (typeof el._setCount === 'function') el._setCount(n);
    });
  }

  // ─── Server flow ──────────────────────────────────────────────────────────────

  async function fetchWishlistServer(cursor = null) {
    const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
        limit:   PAGE_LIMIT,
        cursor,
        idsOnly: false
      })
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return res.json();
  }

  async function loadServerPage(cursor = null) {
    showLoading();
    try {
      const data  = await fetchWishlistServer(cursor);
      const items = data.items ?? [];

      if (!items.length) { showEmpty(); broadcastCount(0); return; }

      serverCursor       = data.pageInfo?.endCursor ?? null;
      const handles      = items.map(i => i.handle).filter(Boolean);

      await renderGrid(handles);
      renderPagination({ hasNext: !!data.pageInfo?.hasNextPage, hasPrev: prevCursors.length > 0 });
      showResults();
      broadcastCount(data.totalCount ?? items.length);
    } catch (e) {
      console.error('[Wishlist] Server load error:', e);
      showError();
    }
  }

  function handleServerNext() { prevCursors.push(serverCursor); loadServerPage(serverCursor); }
  function handleServerPrev() { loadServerPage(prevCursors.pop() ?? null); }

  // ─── Guest flow ───────────────────────────────────────────────────────────────

  async function loadLocalPage(page = 0) {
    showLoading();
    try {
      const allIds = getLocalIds();
      if (!allIds.length) { showEmpty(); broadcastCount(0); return; }

      const start   = page * PAGE_LIMIT;
      const pageIds = allIds.slice(start, start + PAGE_LIMIT);
      const handles = await resolveHandlesForIds(pageIds);

      if (!handles.length) { showError(); return; }

      await renderGrid(handles);
      renderPagination({ hasNext: start + PAGE_LIMIT < allIds.length, hasPrev: page > 0 });
      showResults();
      broadcastCount(allIds.length);
    } catch (e) {
      console.error('[Wishlist] Local load error:', e);
      showError();
    }
  }

  function handleLocalNext() { localPage++;                               loadLocalPage(localPage); }
  function handleLocalPrev() { localPage = Math.max(0, localPage - 1);   loadLocalPage(localPage); }

  // ─── Remove card on wishlist:updated (removed) ────────────────────────────────

  document.addEventListener('wishlist:updated', (e) => {
    if (e.detail.status !== 'removed') return;

    const card = elGrid?.querySelector(`[data-product-id="${e.detail.productId}"]`);
    if (!card) return;

    card.classList.add('wishlist-card--removing');
    card.addEventListener('animationend', () => {
      card.remove();
      if (!elGrid?.querySelector('.wishlist-card')) { showEmpty(); broadcastCount(0); }
    }, { once: true });

    if (!IS_LOGGED_IN) removeLocalId(e.detail.productId);
  });

  // ─── Retry ────────────────────────────────────────────────────────────────────

  retryBtn?.addEventListener('click', () => {
    IS_LOGGED_IN ? loadServerPage(null) : migrateOrphanedIds().then(() => loadLocalPage(0));
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  if (IS_LOGGED_IN) {
    loadServerPage(null);
  } else {
    // Run migration first — resolves all handles missing from meta in parallel,
    // then renders the full grid
    migrateOrphanedIds().then(() => loadLocalPage(0));
  }

})();