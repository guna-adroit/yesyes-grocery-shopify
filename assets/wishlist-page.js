/**
 * wishlist-page.js
 *
 * Renders the Wishlist page. Load only on the wishlist page template.
 *
 * Depends on (loaded in theme.liquid globally):
 *   • wishlist-button.js  — handles toggle buttons, writes localStorage meta
 *   • wishlist-count.js   — defines <wishlist-count> web component
 *
 * How product cards are rendered:
 * ─────────────────────────────────────────────────────────────────────────────
 *  For each product handle, we call Shopify's Section Rendering API:
 *    /products/{handle}?sections=wishlist-product-card
 *  Shopify renders sections/wishlist-product-card.liquid server-side with full
 *  access to the Liquid `product` object — correct prices, images, availability.
 *
 * localStorage flow (guest users):
 * ─────────────────────────────────────────────────────────────────────────────
 *  wishlist-button.js writes two localStorage keys:
 *    shopify_wishlist       → ["id1", "id2", ...]
 *    shopify_wishlist_meta  → { "id1": { handle, title, image }, ... }
 *
 *  The meta key is written at the moment a product is added to the wishlist,
 *  so handles are always available when this page loads — no DOM scanning needed.
 *
 *  If a meta entry is missing for any ID (e.g. old data before this update),
 *  we fall back to Shopify's /products/{id}.js AJAX endpoint to resolve the handle.
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

  // ─── UI state helpers ─────────────────────────────────────────────────────────

  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

  function showLoading() { show(elLoading); hide(elEmpty); hide(elError); hide(elResults); }
  function showEmpty()   { hide(elLoading); show(elEmpty); hide(elError); hide(elResults); }
  function showError()   { hide(elLoading); hide(elEmpty); show(elError); hide(elResults); }
  function showResults() { hide(elLoading); hide(elEmpty); hide(elError); show(elResults); }

  // ─── localStorage helpers ─────────────────────────────────────────────────────

  function getLocalIds() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function removeLocalId(productId) {
    const updated = getLocalIds().filter(id => id !== productId);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}

    // Also clean up meta
    try {
      const meta = JSON.parse(localStorage.getItem(STORAGE_META_KEY) || '{}');
      delete meta[productId];
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
    } catch {}
  }

  function getLocalMeta() {
    try { return JSON.parse(localStorage.getItem(STORAGE_META_KEY) || '{}'); }
    catch { return {}; }
  }

  // ─── Handle resolution ────────────────────────────────────────────────────────
  // Primary source: meta cache written by wishlist-button.js.
  // Fallback: Shopify AJAX product endpoint for IDs with no cached handle
  // (covers products wishlisted before wishlist-button.js was updated).

  async function resolveHandlesForIds(ids) {
    const meta    = getLocalMeta();
    const handles = [];
    const missing = [];   // IDs not in the meta cache

    ids.forEach(id => {
      if (meta[id]?.handle) {
        handles.push({ id, handle: meta[id].handle });
      } else {
        missing.push(id);
      }
    });

    // Fallback: resolve missing IDs via /products/{id}.js
    // Shopify redirects numeric-ID URLs to the product if it exists.
    if (missing.length) {
      const resolved = await Promise.allSettled(
        missing.map(id =>
          fetch(`/products/${id}.js`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );

      resolved.forEach((result, i) => {
        const product = result.status === 'fulfilled' ? result.value : null;
        if (product?.handle) {
          handles.push({ id: missing[i], handle: product.handle });

          // Backfill the meta cache so the next visit is instant
          const meta = getLocalMeta();
          meta[missing[i]] = {
            handle: product.handle,
            title:  product.title    || '',
            image:  product.featured_image || ''
          };
          try { localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta)); } catch {}
        }
        // If still null: product was deleted — skip silently
      });
    }

    // Return handles in the original ID order
    return ids
      .map(id => handles.find(h => h.id === id)?.handle)
      .filter(Boolean);
  }

  // ─── Section Rendering API ────────────────────────────────────────────────────
  // Fetch rendered Liquid HTML for a single product handle.
  // Shopify runs sections/wishlist-product-card.liquid in the context of
  // /products/{handle}, giving full access to the `product` Liquid object.

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

  // Render a page of product handles into the grid.
  // Cards are fetched in parallel but injected in list order.
  async function renderGrid(handles) {
    elGrid.innerHTML = '';

    // Pre-insert ordered slot divs so positions are locked before async fetches return
    const slots = handles.map(handle => {
      const slot = document.createElement('div');
      slot.className        = 'wishlist-card-slot';
      slot.dataset.handle   = handle;
      elGrid.appendChild(slot);
      return slot;
    });

    const htmlResults = await Promise.all(handles.map(fetchCardHTML));

    htmlResults.forEach((html, i) => {
      if (html) {
        // Replace the slot div with the real rendered card HTML
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const card = tmp.firstElementChild;
        slots[i].replaceWith(card);
      } else {
        // Product may have been deleted — remove the empty slot
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
  // Broadcasts the known count to all <wishlist-count> elements on the page.
  // wishlist-count.js exposes _setCount() on the element instance.

  function broadcastCount(n) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      if (typeof el._setCount === 'function') el._setCount(n);
    });
  }

  // ─── Server flow (logged-in users) ───────────────────────────────────────────

  async function fetchWishlistServer(cursor = null) {
    const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
        limit:      PAGE_LIMIT,
        cursor:     cursor,
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

      if (!items.length) {
        showEmpty();
        broadcastCount(0);
        return;
      }

      serverCursor = data.pageInfo?.endCursor ?? null;

      // `handle` comes directly from the API response — no resolution needed
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

  function handleServerNext() {
    prevCursors.push(serverCursor);
    loadServerPage(serverCursor);
  }

  function handleServerPrev() {
    loadServerPage(prevCursors.pop() ?? null);
  }

  // ─── Guest flow (localStorage users) ─────────────────────────────────────────

  async function loadLocalPage(page = 0) {
    showLoading();
    try {
      const allIds = getLocalIds();

      if (!allIds.length) {
        showEmpty();
        broadcastCount(0);
        return;
      }

      const start   = page * PAGE_LIMIT;
      const pageIds = allIds.slice(start, start + PAGE_LIMIT);

      // Resolve IDs to handles (meta cache first, AJAX fallback)
      const handles = await resolveHandlesForIds(pageIds);

      if (!handles.length) {
        showError();
        return;
      }

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

  function handleLocalNext() {
    localPage++;
    loadLocalPage(localPage);
  }

  function handleLocalPrev() {
    localPage = Math.max(0, localPage - 1);
    loadLocalPage(localPage);
  }

  // ─── Remove card on wishlist:updated (removed) ────────────────────────────────

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

    if (!IS_LOGGED_IN) {
      removeLocalId(e.detail.productId);
    }
  });

  // ─── Retry button ──────────────────────────────────────────────────────────────

  retryBtn?.addEventListener('click', () => {
    if (IS_LOGGED_IN) {
      loadServerPage(null);
    } else {
      loadLocalPage(0);
    }
  });

  // ─── Init ──────────────────────────────────────────────────────────────────────

  if (IS_LOGGED_IN) {
    loadServerPage(null);
  } else {
    loadLocalPage(0);
  }

})();
