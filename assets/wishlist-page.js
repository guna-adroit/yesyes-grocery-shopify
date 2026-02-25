/**
 * wishlist-page.js
 *
 * Renders the Wishlist page by:
 *  1. Fetching wishlist items (server API for logged-in, localStorage for guests)
 *  2. For each product handle, calling Shopify's Section Rendering API:
 *       /products/{handle}?sections=wishlist-product-card
 *     This renders sections/wishlist-product-card.liquid server-side, giving
 *     full access to the Liquid `product` object (price, images, availability,
 *     all_products[handle], etc.) — no JS-side price formatting needed.
 *  3. Injecting the returned HTML directly into the grid.
 *
 * ─── Guest (localStorage) handle caching ──────────────────────────────────────
 *  Since localStorage only stores product IDs, handles are cached in a separate
 *  key (`shopify_wishlist_meta`) whenever a wishlist-button element is found in
 *  the DOM. This works automatically as long as your wishlist-button elements
 *  include the data-product-handle attribute:
 *
 *    <wishlist-button
 *      data-product-id="{{ product.id }}"
 *      data-product-handle="{{ product.handle }}"   ← add this
 *      data-product-title="{{ product.title | escape }}"
 *      data-product-image="{{ product.featured_image | image_url: width: 400 }}">
 *
 *  On every page load (product, collection, search), this script scans the DOM
 *  and populates the meta cache automatically. On the wishlist page itself the
 *  handles come directly from the API response (server) or the meta cache (guest).
 */

(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────

  const IS_LOGGED_IN   = window.WishlistConfig?.isLoggedIn   ?? false;
  const CUSTOMER_ID    = window.WishlistConfig?.customerId   ?? null;
  const APP_PROXY_URL  = window.WishlistConfig?.appProxyUrl  ?? '';
  const PAGE_LIMIT     = window.WishlistConfig?.pageLimit    ?? 12;
  const CARD_SECTION   = window.WishlistConfig?.cardSection  ?? 'wishlist-product-card';

  const STORAGE_KEY      = 'shopify_wishlist';       // IDs array — shared with wishlist-button.js
  const STORAGE_META_KEY = 'shopify_wishlist_meta';  // { [productId]: { handle, title, image } }

  // ─── DOM refs ────────────────────────────────────────────────────────────────

  const elLoading    = document.getElementById('wishlist-loading');
  const elEmpty      = document.getElementById('wishlist-empty');
  const elError      = document.getElementById('wishlist-error');
  const elResults    = document.getElementById('wishlist-results');
  const elGrid       = document.getElementById('wishlist-grid');
  const elPagination = document.getElementById('wishlist-pagination');
  const retryBtn     = document.getElementById('wishlist-retry-btn');

  // ─── Pagination state ────────────────────────────────────────────────────────

  let serverCursor    = null;   // current page cursor for server API
  let prevCursors     = [];     // stack for "back" navigation
  let localPage       = 0;      // current page index for localStorage

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

  function showLoading() { show(elLoading); hide(elEmpty); hide(elError); hide(elResults); }
  function showEmpty()   { hide(elLoading); show(elEmpty); hide(elError); hide(elResults); }
  function showError()   { hide(elLoading); hide(elEmpty); show(elError); hide(elResults); }
  function showResults() { hide(elLoading); hide(elEmpty); hide(elError); show(elResults); }

  // ─── localStorage helpers ────────────────────────────────────────────────────

  function getLocalIds() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function removeLocalId(productId) {
    const ids = getLocalIds().filter(id => id !== productId);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
  }

  function getLocalMeta() {
    try { return JSON.parse(localStorage.getItem(STORAGE_META_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveLocalMeta(meta) {
    try { localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta)); } catch {}
  }

  /**
   * Scan the DOM for any wishlist-button elements that carry a
   * data-product-handle attribute and persist them to the meta cache.
   * Called on every page so handles accumulate over time.
   */
  function cacheHandlesFromDOM() {
    const buttons = document.querySelectorAll('wishlist-button[data-product-handle]');
    if (!buttons.length) return;

    const meta = getLocalMeta();
    let changed = false;

    buttons.forEach(el => {
      const id     = el.dataset.productId;
      const handle = el.dataset.productHandle;
      if (id && handle && !meta[id]?.handle) {
        meta[id] = {
          handle: handle,
          title:  el.dataset.productTitle || '',
          image:  el.dataset.productImage || ''
        };
        changed = true;
      }
    });

    if (changed) saveLocalMeta(meta);
  }

  // ─── Section Rendering API ───────────────────────────────────────────────────

  /**
   * Fetch the rendered Liquid card HTML for a single product handle.
   * Shopify renders sections/wishlist-product-card.liquid in the context
   * of /products/{handle}, so `product` and `all_products[handle]` are
   * both available inside the section template.
   *
   * @param  {string} handle  Product handle e.g. "mayil-matta-rice"
   * @returns {string|null}   Rendered HTML string, or null on failure
   */
  async function fetchCardHTML(handle) {
    try {
      const res = await fetch(`/products/${encodeURIComponent(handle)}?sections=${CARD_SECTION}`, {
        headers: { 'X-Requested-With': 'fetch' }
      });

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

  /**
   * Render the product grid from an array of handles.
   * Fetches all cards in parallel and injects them into the DOM
   * in their original list order.
   *
   * @param {string[]} handles
   */
  async function renderGrid(handles) {
    elGrid.innerHTML = '';

    // Insert placeholder divs immediately to preserve order
    const slots = handles.map(handle => {
      const slot = document.createElement('div');
      slot.dataset.handle = handle;
      elGrid.appendChild(slot);
      return slot;
    });

    // Fetch all cards in parallel
    const htmlResults = await Promise.all(handles.map(fetchCardHTML));

    htmlResults.forEach((html, i) => {
      if (html) {
        slots[i].outerHTML = html;
      } else {
        // Remove empty slot if section render failed (product deleted, etc.)
        slots[i].remove();
      }
    });

    // After all cards are in the DOM, trigger WishlistButton init
    // (custom elements upgrade automatically, but re-scan just in case)
    document.querySelectorAll('wishlist-button:not([data-initialized])').forEach(el => {
      el.setAttribute('data-initialized', '');
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

  // ─── Server flow (logged-in) ──────────────────────────────────────────────────

  /**
   * Call the server wishlist list endpoint.
   * Returns items with `handle` fields ready for Section Rendering.
   *
   * Response shape:
   * {
   *   items: [{ productId, title, handle, available, hasMultipleVariants, image }],
   *   pageInfo: { hasNextPage, hasPreviousPage, endCursor },
   *   totalCount?: number
   * }
   */
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
      const data = await fetchWishlistServer(cursor);
      const items = data.items ?? [];

      if (!items.length) {
        showEmpty();
        setCount(0);
        return;
      }

      serverCursor = data.pageInfo?.endCursor ?? null;

      // Extract handles from the API response — this is the key change.
      // We use the `handle` field directly from the server response.
      const handles = items.map(item => item.handle).filter(Boolean);

      await renderGrid(handles);
      renderPagination({
        hasNext: !!data.pageInfo?.hasNextPage,
        hasPrev: prevCursors.length > 0
      });
      showResults();
      setCount(data.totalCount ?? items.length);

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
    const cursor = prevCursors.pop() ?? null;
    loadServerPage(cursor);
  }

  // ─── Guest flow (localStorage) ───────────────────────────────────────────────

  async function loadLocalPage(page = 0) {
    showLoading();
    try {
      const allIds = getLocalIds();

      if (!allIds.length) {
        showEmpty();
        setCount(0);
        return;
      }

      const meta     = getLocalMeta();
      const start    = page * PAGE_LIMIT;
      const pageIds  = allIds.slice(start, start + PAGE_LIMIT);

      // Map IDs to handles using the cached meta
      const handles  = pageIds
        .map(id => meta[id]?.handle)
        .filter(Boolean);

      if (!handles.length) {
        // No handles cached yet — show a helpful empty/error state
        console.warn('[Wishlist] No handles cached for guest wishlist. ' +
          'Add data-product-handle to wishlist-button elements across your theme.');
        showError();
        return;
      }

      await renderGrid(handles);
      renderPagination({
        hasNext: start + PAGE_LIMIT < allIds.length,
        hasPrev: page > 0
      });
      showResults();
      setCount(allIds.length);

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

  // ─── Wishlist count ───────────────────────────────────────────────────────────

  function setCount(n) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      if (typeof el._setCount === 'function') el._setCount(n);
    });
  }

  // ─── <wishlist-count> Web Component ──────────────────────────────────────────
  /**
   * <wishlist-count>
   *
   * Displays the live wishlist item count. Listens to `wishlist:updated`
   * events dispatched by wishlist-button.js so it stays in sync everywhere.
   *
   * Usage (place anywhere — nav, page heading, etc.):
   *   <wishlist-count></wishlist-count>
   *
   * Renders as: "(3)" or is hidden when count is 0.
   */
  class WishlistCount extends HTMLElement {
    connectedCallback() {
      this._count = 0;
      this._render();
      this._initCount();

      document.addEventListener('wishlist:updated', (e) => {
        const delta = e.detail.status === 'added' ? 1 : -1;
        this._setCount(Math.max(0, this._count + delta));
      });
    }

    async _initCount() {
      if (IS_LOGGED_IN) {
        // Lightweight fetch to get totalCount — reuses the same list endpoint
        try {
          const data = await fetchWishlistServer(null);
          this._setCount(data.totalCount ?? data.items?.length ?? 0);
        } catch {
          this._setCount(0);
        }
      } else {
        this._setCount(getLocalIds().length);
      }
    }

    _setCount(n) {
      this._count = n;
      this._render();
    }

    _render() {
      if (this._count > 0) {
        this.textContent = `(${this._count})`;
        this.removeAttribute('hidden');
      } else {
        this.textContent = '';
        this.setAttribute('hidden', '');
      }
    }
  }

  if (!customElements.get('wishlist-count')) {
    customElements.define('wishlist-count', WishlistCount);
  }

  // ─── Remove card from DOM on wishlist:updated (removed) ──────────────────────

  document.addEventListener('wishlist:updated', (e) => {
    if (e.detail.status !== 'removed') return;

    const card = elGrid?.querySelector(`[data-product-id="${e.detail.productId}"]`);
    if (!card) return;

    card.classList.add('wishlist-card--removing');
    card.addEventListener('animationend', () => {
      card.remove();
      if (elGrid?.children.length === 0) {
        showEmpty();
        setCount(0);
      }
    }, { once: true });

    // Remove from localStorage for guest users
    if (!IS_LOGGED_IN) {
      removeLocalId(e.detail.productId);
    }
  });

  // ─── Retry button ─────────────────────────────────────────────────────────────

  retryBtn?.addEventListener('click', () => {
    IS_LOGGED_IN ? loadServerPage(null) : loadLocalPage(0);
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  // Always scan the DOM to cache handles for guest users
  // (safe to call even when logged in — it's a no-op if no buttons exist)
  cacheHandlesFromDOM();

  if (IS_LOGGED_IN) {
    loadServerPage(null);
  } else {
    loadLocalPage(0);
  }

})();
