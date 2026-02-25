/**
 * wishlist-page.js
 * Handles the Wishlist page rendering for both logged-in (server) and guest (localStorage) users.
 * Also defines the <wishlist-count> web component.
 */

(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';
  const PAGE_LIMIT    = window.WishlistConfig?.pageLimit   ?? 12;
  const MONEY_FORMAT  = window.WishlistConfig?.moneyFormat ?? '${{amount}}';
  const STORAGE_KEY   = 'shopify_wishlist';

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function toGid(type, id) {
    return `gid://shopify/${type}/${id}`;
  }

  function formatMoney(cents) {
    const amount = (cents / 100).toFixed(2);
    return MONEY_FORMAT.replace('{{amount}}', amount)
                       .replace('{{amount_no_decimals}}', Math.round(cents / 100))
                       .replace('{{amount_with_comma_separator}}', amount.replace('.', ','));
  }

  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

  // ─── DOM refs ────────────────────────────────────────────────────────────────

  const elLoading    = document.getElementById('wishlist-loading');
  const elEmpty      = document.getElementById('wishlist-empty');
  const elError      = document.getElementById('wishlist-error');
  const elResults    = document.getElementById('wishlist-results');
  const elGrid       = document.getElementById('wishlist-grid');
  const elPagination = document.getElementById('wishlist-pagination');
  const retryBtn     = document.getElementById('wishlist-retry-btn');
  const cardTemplate = document.getElementById('wishlist-card-template');

  // ─── State ───────────────────────────────────────────────────────────────────

  let currentCursor = null;
  let prevCursors   = []; // stack for "previous page" support
  let totalCount    = 0;

  // ─── localStorage helpers ────────────────────────────────────────────────────

  function getLocalIds() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalIds(ids) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {
      console.error('Wishlist storage error:', e);
    }
  }

  function removeLocalId(productId) {
    const ids = getLocalIds().filter(id => id !== productId);
    saveLocalIds(ids);
  }

  // ─── Server API ──────────────────────────────────────────────────────────────

  async function fetchWishlistFromServer(cursor = null) {
    const body = {
      customerId: toGid('Customer', CUSTOMER_ID),
      limit:      PAGE_LIMIT,
      cursor:     cursor,
      idsOnly:    false
    };

    const response = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return response.json();
    // Expected shape:
    // {
    //   items: [ { id, title, handle, featuredImage, priceRange, vendor, ... } ],
    //   pageInfo: { hasNextPage, endCursor, hasPreviousPage }
    // }
  }

  // ─── localStorage "fetch" ────────────────────────────────────────────────────
  // For guest users we have only IDs, so we use the Storefront AJAX API
  // to resolve product data. Falls back to minimal card if unavailable.

  async function fetchProductsByIds(ids) {
    if (!ids.length) return [];

    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`/products/${id}.js`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );

    return results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean)
      .map(p => ({
        id:           String(p.id),
        title:        p.title,
        handle:       p.handle,
        vendor:       p.vendor,
        featuredImage: { url: p.featured_image || '', altText: p.title },
        priceRange: {
          minVariantPrice: { amount: (p.price / 100).toFixed(2) },
          maxVariantPrice: { amount: (p.price_max / 100).toFixed(2) }
        },
        compareAtPriceRange: {
          minVariantPrice: { amount: p.compare_at_price ? (p.compare_at_price / 100).toFixed(2) : null }
        },
        url: `/products/${p.handle}`
      }));
  }

  async function fetchWishlistFromLocal(page = 0) {
    const allIds = getLocalIds();
    const start  = page * PAGE_LIMIT;
    const pageIds = allIds.slice(start, start + PAGE_LIMIT);
    const items  = await fetchProductsByIds(pageIds);
    return {
      items,
      pageInfo: {
        hasNextPage:     start + PAGE_LIMIT < allIds.length,
        hasPreviousPage: page > 0,
        endCursor:       null
      },
      totalCount: allIds.length
    };
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  function buildCard(product) {
    const clone = cardTemplate.content.cloneNode(true);
    const card  = clone.querySelector('.wishlist-card');

    const productUrl = product.url || `/products/${product.handle}`;
    const imageUrl   = product.featuredImage?.url  || '';
    const imageAlt   = product.featuredImage?.altText || product.title;
    const price      = parseFloat(product.priceRange?.minVariantPrice?.amount || 0);
    const compareAt  = parseFloat(product.compareAtPriceRange?.minVariantPrice?.amount || 0);
    const productId  = String(product.id).replace('gid://shopify/Product/', '');

    card.dataset.productId = productId;

    // Image & links
    const imageLink = card.querySelector('.wishlist-card__image-link');
    imageLink.href  = productUrl;

    const img = card.querySelector('.wishlist-card__image');
    img.src    = imageUrl;
    img.alt    = imageAlt;

    // Wishlist button (remove)
    const wb = card.querySelector('wishlist-button');
    wb.dataset.productId    = productId;
    wb.dataset.productTitle = product.title;
    wb.dataset.productImage = imageUrl;
    wb.querySelector('[data-wishlist-btn]').dataset.productId = productId;

    // Vendor
    const vendor = card.querySelector('.wishlist-card__vendor');
    if (product.vendor) {
      vendor.textContent = product.vendor;
      vendor.href        = `/collections/vendors?q=${encodeURIComponent(product.vendor)}`;
    } else {
      vendor.remove();
    }

    // Title
    const title = card.querySelector('.wishlist-card__title');
    title.textContent = product.title;
    title.href        = productUrl;

    // Price
    const priceEl     = card.querySelector('.wishlist-card__price--current');
    const compareEl   = card.querySelector('.wishlist-card__price--compare');
    priceEl.textContent = formatMoney(price * 100);

    if (compareAt && compareAt > price) {
      compareEl.textContent = formatMoney(compareAt * 100);
      compareEl.classList.remove('hidden');
      priceEl.classList.add('wishlist-card__price--sale');
    }

    // CTA
    const cta = card.querySelector('.wishlist-card__cta');
    cta.href  = productUrl;

    return card;
  }

  function renderGrid(items) {
    elGrid.innerHTML = '';
    items.forEach(product => {
      elGrid.appendChild(buildCard(product));
    });
  }

  function renderPagination(pageInfo) {
    elPagination.innerHTML = '';

    const hasPrev = prevCursors.length > 0 || (IS_LOGGED_IN === false && currentLocalPage > 0);
    const hasNext = pageInfo?.hasNextPage;

    if (!hasPrev && !hasNext) return;

    if (hasPrev) {
      const prevBtn = document.createElement('button');
      prevBtn.className   = 'button button--secondary wishlist-pagination__btn';
      prevBtn.textContent = '← Previous';
      prevBtn.addEventListener('click', handlePrevPage);
      elPagination.appendChild(prevBtn);
    }

    if (hasNext) {
      const nextBtn = document.createElement('button');
      nextBtn.className   = 'button button--primary wishlist-pagination__btn';
      nextBtn.textContent = 'Next →';
      nextBtn.addEventListener('click', handleNextPage);
      elPagination.appendChild(nextBtn);
    }
  }

  // ─── Pagination state ────────────────────────────────────────────────────────

  let currentLocalPage = 0;

  function handleNextPage() {
    if (IS_LOGGED_IN) {
      prevCursors.push(currentCursor);
      loadPage(currentCursor);
    } else {
      currentLocalPage++;
      loadPageLocal(currentLocalPage);
    }
  }

  function handlePrevPage() {
    if (IS_LOGGED_IN) {
      currentCursor = prevCursors.pop() || null;
      loadPage(currentCursor);
    } else {
      currentLocalPage = Math.max(0, currentLocalPage - 1);
      loadPageLocal(currentLocalPage);
    }
  }

  // ─── Load functions ──────────────────────────────────────────────────────────

  async function loadPage(cursor = null) {
    showLoading();
    try {
      const data = await fetchWishlistFromServer(cursor);
      currentCursor = data.pageInfo?.endCursor ?? null;

      if (!data.items || data.items.length === 0) {
        showEmpty();
        return;
      }

      renderGrid(data.items);
      renderPagination(data.pageInfo);
      showResults();
      updateCountBadge(data.totalCount ?? data.items.length);
    } catch (e) {
      console.error('Wishlist load error:', e);
      showError();
    }
  }

  async function loadPageLocal(page = 0) {
    showLoading();
    try {
      const data = await fetchWishlistFromLocal(page);

      if (!data.items || data.items.length === 0) {
        showEmpty();
        updateCountBadge(0);
        return;
      }

      renderGrid(data.items);
      renderPagination(data.pageInfo);
      showResults();
      updateCountBadge(data.totalCount);
    } catch (e) {
      console.error('Wishlist (local) load error:', e);
      showError();
    }
  }

  // ─── UI state helpers ─────────────────────────────────────────────────────────

  function showLoading() {
    show(elLoading); hide(elEmpty); hide(elError); hide(elResults);
  }
  function showEmpty() {
    hide(elLoading); show(elEmpty); hide(elError); hide(elResults);
  }
  function showError() {
    hide(elLoading); hide(elEmpty); show(elError); hide(elResults);
  }
  function showResults() {
    hide(elLoading); hide(elEmpty); hide(elError); show(elResults);
  }

  // ─── Wishlist count badge ─────────────────────────────────────────────────────

  function updateCountBadge(count) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      el._setCount(count);
    });
  }

  // ─── <wishlist-count> Web Component ──────────────────────────────────────────
  /**
   * <wishlist-count>
   *
   * Displays the current wishlist item count. Listens to the `wishlist:updated`
   * custom event so it stays in sync when items are added or removed from
   * any wishlist button on the page (nav, product cards, product pages, etc.)
   *
   * Usage:
   *   <wishlist-count></wishlist-count>
   *
   * Renders as: (3)  or hidden when 0
   */
  class WishlistCount extends HTMLElement {
    constructor() {
      super();
      this._count = 0;
    }

    connectedCallback() {
      this._render();

      // Sync count on load
      this._initCount();

      // Listen for any wishlist toggle from anywhere on the page
      document.addEventListener('wishlist:updated', (e) => {
        const delta = e.detail.status === 'added' ? 1 : -1;
        this._setCount(Math.max(0, this._count + delta));
      });
    }

    async _initCount() {
      if (IS_LOGGED_IN) {
        // We'll get the real count once the page loads — handled by updateCountBadge()
        // But attempt a lightweight load: just first page to get totalCount
        try {
          const data = await fetchWishlistFromServer(null);
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

  // ─── React to external wishlist changes on the page ──────────────────────────
  // If a product is removed via its wishlist button on the wishlist page itself,
  // remove the card from the DOM too.

  document.addEventListener('wishlist:updated', (e) => {
    if (e.detail.status !== 'removed') return;

    const card = elGrid?.querySelector(`[data-product-id="${e.detail.productId}"]`);
    if (!card) return;

    card.classList.add('wishlist-card--removing');
    card.addEventListener('animationend', () => {
      card.remove();

      // If grid is now empty, show empty state
      if (elGrid && elGrid.children.length === 0) {
        showEmpty();
        updateCountBadge(0);
      }
    }, { once: true });

    // Also remove from localStorage for guests
    if (!IS_LOGGED_IN) {
      removeLocalId(e.detail.productId);
    }
  });

  // ─── Retry button ─────────────────────────────────────────────────────────────

  retryBtn?.addEventListener('click', () => {
    if (IS_LOGGED_IN) {
      loadPage(null);
    } else {
      loadPageLocal(0);
    }
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  if (IS_LOGGED_IN) {
    loadPage(null);
  } else {
    loadPageLocal(0);
  }

})();
