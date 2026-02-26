/**
 * wishlist-page.js
 *
 * Renders the Wishlist page. Load only on the wishlist page template.
 *
 * Depends on (loaded globally in theme.liquid):
 *   • wishlist-button.js  — toggle buttons, writes localStorage meta
 *   • wishlist-count.js   — <wishlist-count> web component
 *
 * ─── How product cards are rendered ──────────────────────────────────────────
 *  For each product handle we call Shopify's Section Rendering API:
 *    /products/{handle}?sections=wishlist-product-card
 *  Shopify renders wishlist-product-card.liquid server-side with the full
 *  Liquid product object (price, images, availability, etc.)
 *
 * ─── Guest (localStorage) handle resolution ──────────────────────────────────
 *  wishlist-button.js writes two keys:
 *    shopify_wishlist       → ["id1", "id2", ...]       (written since v1)
 *    shopify_wishlist_meta  → { id: { handle, ... } }   (written since v2)
 *
 *  For IDs that exist in shopify_wishlist but NOT in shopify_wishlist_meta
 *  (products added before wishlist-button.js v2), we run a HEAD request:
 *
 *    HEAD /products/{numericId}
 *
 *  Shopify redirects numeric-ID product URLs to their handle-based URL:
 *    /products/15573512093777  →  /products/mayil-matta-rice
 *
 *  We extract the handle from the final redirected URL and backfill the meta
 *  cache so subsequent page loads are instant.
 *
 *  This migration runs ONCE on the wishlist page for all missing IDs, then
 *  never again (the cache is populated). On the first visit for a guest with
 *  21 IDs and 5 handles, the page will resolve all 21 and show them all.
 */

(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────────────────────

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

  // ─── UI helpers ───────────────────────────────────────────────────────────────

  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

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

  function removeLocalId(productId) {
    const updated = getLocalIds().filter(id => id !== productId);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
    try {
      const meta = getLocalMeta();
      delete meta[productId];
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
    } catch {}
  }

  // ─── Handle resolution ────────────────────────────────────────────────────────

  /**
   * Resolve a Shopify product handle from a numeric product ID.
   *
   * Strategy: send a HEAD request to /products/{numericId}.
   * Shopify redirects numeric-ID product URLs to their canonical handle URL:
   *   /products/15573512093777  →  /products/mayil-matta-rice
   *
   * fetch() with redirect:'follow' follows the redirect and exposes the
   * final URL via response.url, from which we extract the handle.
   *
   * Falls back to null if the product doesn't exist or the redirect fails.
   *
   * @param  {string} productId  Numeric product ID string
   * @returns {Promise<string|null>}
   */
  async function resolveHandleFromId(productId) {
    try {
      const res = await fetch(`/products/${productId}`, {
        method:   'HEAD',
        redirect: 'follow'
      });

      if (!res.ok) return null;

      // Extract handle from the final URL after redirect
      // e.g. "https://mystore.com/products/mayil-matta-rice" → "mayil-matta-rice"
      const match = res.url.match(/\/products\/([^?#/]+)/);
      const handle = match?.[1];

      // Sanity check: if it resolves back to the numeric ID itself, it didn't redirect
      if (!handle || handle === productId) return null;

      return handle;
    } catch {
      return null;
    }
  }

  /**
   * One-time migration: for all IDs in shopify_wishlist that are missing
   * from shopify_wishlist_meta, resolve their handles via HEAD redirects
   * and populate the meta cache.
   *
   * Runs on every wishlist page load but is effectively a no-op once all
   * IDs have been resolved (meta cache is complete).
   *
   * Requests are batched in parallel for speed. Any ID that can't be resolved
   * (deleted product, redirect didn't work) is silently skipped.
   *
   * @returns {Promise<void>}
   */
  async function migrateOrphanedIds() {
    const allIds  = getLocalIds();
    const meta    = getLocalMeta();

    // Find IDs that are in the wishlist but have no handle in meta
    const orphans = allIds.filter(id => !meta[id]?.handle);
    if (!orphans.length) return;

    console.debug(`[Wishlist] Migrating ${orphans.length} orphaned IDs without handles...`);

    // Resolve all in parallel — HEAD requests are lightweight
    const results = await Promise.allSettled(
      orphans.map(id => resolveHandleFromId(id))
    );

    // Read meta fresh (may have been updated by wishlist-button backfill)
    const freshMeta = getLocalMeta();
    let migrated = 0;

    results.forEach((result, i) => {
      const handle = result.status === 'fulfilled' ? result.value : null;
      if (handle) {
        freshMeta[orphans[i]] = { handle, title: '', image: '' };
        migrated++;
      }
    });

    if (migrated > 0) {
      try { localStorage.setItem(STORAGE_META_KEY, JSON.stringify(freshMeta)); } catch {}
      console.debug(`[Wishlist] Migrated ${migrated}/${orphans.length} orphaned IDs.`);
    }

    const stillMissing = orphans.length - migrated;
    if (stillMissing > 0) {
      console.warn(
        `[Wishlist] ${stillMissing} product(s) could not be resolved — ` +
        `they may have been deleted from the store.`
      );
    }
  }

  // ─── Resolve handles for a page of IDs ───────────────────────────────────────
  // Uses meta cache first. After migrateOrphanedIds() runs, this should
  // always find all entries. The HEAD fallback here is a last-resort safety net.

  async function resolveHandlesForIds(ids) {
    const meta = getLocalMeta();

    const resolved = await Promise.all(
      ids.map(async id => {
        if (meta[id]?.handle) return meta[id].handle;

        // Last-resort: try live HEAD resolution for this single ID
        const handle = await resolveHandleFromId(id);
        if (handle) {
          // Backfill so we don't need to resolve again
          const m = getLocalMeta();
          m[id] = { handle, title: '', image: '' };
          try { localStorage.setItem(STORAGE_META_KEY, JSON.stringify(m)); } catch {}
        }
        return handle;
      })
    );

    return resolved.filter(Boolean);
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
      console.error(`[Wishlist] fetchCardHTML error for "${handle}":`, e);
      return null;
    }
  }

  async function renderGrid(handles) {
    elGrid.innerHTML = '';

    // Pre-insert ordered slots to preserve list order while cards load in parallel
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
        const tmp  = document.createElement('div');
        tmp.innerHTML = html;
        const card = tmp.firstElementChild;
        slots[i].replaceWith(card);
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

  // ─── Count badge sync ─────────────────────────────────────────────────────────

  function broadcastCount(n) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      if (typeof el._setCount === 'function') el._setCount(n);
    });
  }

  // ─── Server flow (logged-in) ──────────────────────────────────────────────────

  async function fetchWishlistServer(cursor = null) {
    const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
        limit:      PAGE_LIMIT,
        cursor,
        idsOnly:    false
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

      serverCursor = data.pageInfo?.endCursor ?? null;
      const handles = items.map(item => item.handle).filter(Boolean);

      await renderGrid(handles);
      renderPagination({
        hasNext: !!data.pageInfo?.hasNextPage,
        hasPrev: prevCursors.length > 0
      });
      showResults();
      broadcastCount(data.totalCount ?? items.length);
    } catch (e) {
      console.error('[Wishlist] Server load error:', e);
      showError();
    }
  }

  function handleServerNext() { prevCursors.push(serverCursor); loadServerPage(serverCursor); }
  function handleServerPrev() { loadServerPage(prevCursors.pop() ?? null); }

  // ─── Guest flow (localStorage) ────────────────────────────────────────────────

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
      renderPagination({
        hasNext: start + PAGE_LIMIT < allIds.length,
        hasPrev: page > 0
      });
      showResults();
      broadcastCount(allIds.length);
    } catch (e) {
      console.error('[Wishlist] Local load error:', e);
      showError();
    }
  }

  function handleLocalNext() { localPage++; loadLocalPage(localPage); }
  function handleLocalPrev() { localPage = Math.max(0, localPage - 1); loadLocalPage(localPage); }

  // ─── Remove card on wishlist:updated(removed) ─────────────────────────────────

  document.addEventListener('wishlist:updated', (e) => {
    if (e.detail.status !== 'removed') return;

    const card = elGrid?.querySelector(`[data-product-id="${e.detail.productId}"]`);
    if (!card) return;

    card.classList.add('wishlist-card--removing');
    card.addEventListener('animationend', () => {
      card.remove();
      if (elGrid && elGrid.querySelectorAll('.wishlist-card').length === 0) {
        showEmpty();
        broadcastCount(0);
      }
    }, { once: true });

    if (!IS_LOGGED_IN) removeLocalId(e.detail.productId);
  });

  // ─── Retry button ──────────────────────────────────────────────────────────────

  retryBtn?.addEventListener('click', () => {
    IS_LOGGED_IN ? loadServerPage(null) : loadLocalPage(0);
  });

  // ─── Init ──────────────────────────────────────────────────────────────────────

  if (IS_LOGGED_IN) {
    loadServerPage(null);
  } else {
    // Run migration first so all handles are available before rendering
    migrateOrphanedIds().then(() => loadLocalPage(0));
  }

})();
