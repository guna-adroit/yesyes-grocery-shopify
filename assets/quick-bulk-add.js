import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInput extends HTMLElement {
  constructor() {
    super();

    this.variantId = Number(this.dataset.variantId);

    this.container = this.querySelector('.quick-add-quantity');
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');

    this.lineKey = null;
  }

  connectedCallback() {
    if (!this.input) return;

    // Initial sync
    this.syncWithCart();

    this.plus?.addEventListener("click", () => this.addOne());
    this.minus?.addEventListener("click", () => this.removeOne());

    // Debounced refresh on cart update
    this.cartUpdateHandler = this.debounce(() => this.syncWithCart(), 250);
    document.addEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
  }

  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /** Sync with cart.js (1 fetch only) */
  syncWithCart() {
    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {
        const item = cart.items.find(i => i.variant_id === this.variantId);
        const qty = item ? item.quantity : 0;

        if (item) {
          this.lineKey = item.key;
          this.input.value = qty;
          this.classList.add('visible');
        } else {
          this.lineKey = null;
          this.input.value = 0;
          this.classList.remove('visible');
        }

        this.updateMinusButton();
      })
      .catch(err => console.error("Sync error:", err));
  }

  /** Local fast UI update */
  instantUpdate(delta) {
    let qty = parseInt(this.input.value) || 0;
    qty = qty + delta;

    if (qty < 0) qty = 0;

    this.input.value = qty;

    if (qty > 0) this.classList.add('visible');
    else this.classList.remove('visible');

    this.updateMinusButton();
  }

  updateMinusButton() {
    this.minus.disabled = parseInt(this.input.value) === 0;
  }

  /** ADD exactly 1 */
  addOne() {
  this.setLoading(true);
  this.instantUpdate(1);

  fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: this.variantId, quantity: 1 })
  })
    .then(res => {
      if (!res.ok) return res.json().then(err => { throw err; });
      return res.json();
    })
    .then(cartData => {
      console.log("AddOne received:", cartData);

      // --- CASE 1: Full Shopify cart JSON ---
      if (cartData && Array.isArray(cartData.items)) {
        const item = cartData.items.find(i => i.variant_id === this.variantId);
        if (item) this.lineKey = item.key;
      }

      // --- CASE 2: Only sections returned (Horizon typical behavior) ---
      if (!cartData.items && cartData.sections) {
        return fetch('/cart.js')
          .then(r => r.json())
          .then(cart => {
            const item = cart.items.find(i => i.variant_id === this.variantId);
            if (item) this.lineKey = item.key;

            this.dispatchCartAdd(cart);
          });
      }

      this.dispatchCartAdd(cartData);
    })
    .catch(err => {
      console.error("Add error:", err);
      this.dispatchEvent(new CartErrorEvent(err));
    })
    .finally(() => this.setLoading(false));
}

  /** REMOVE exactly 1 */
  removeOne() {
    const currentQty = parseInt(this.input.value);

    if (currentQty <= 0) return;

    this.setLoading(true);
    this.instantUpdate(-1);

    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.lineKey,
        quantity: currentQty - 1
      })
    })
      .then(res => {
        if (!res.ok) return res.json().then(err => { throw err; });
        return res.json();
      })
      .then(cartData => {
        this.dispatchCartAdd(cartData);
      })
      .catch(err => console.error("Remove error:", err))
      .finally(() => this.setLoading(false));
  }

  /** Dispatch Horizon CartAdd event (cart drawer updates) */
  dispatchCartAdd(cartData) {
    const evt = new CartAddEvent(
      cartData,
      this.variantId.toString(),
      {
        source: 'quantity-input',
        itemCount: cartData.item_count,
        sections: cartData.sections
      }
    );

    document.dispatchEvent(evt);
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.classList.add("is-loading");
      this.plus.disabled = true;
      this.minus.disabled = true;
    } else {
      this.classList.remove("is-loading");
      this.plus.disabled = false;
      this.updateMinusButton();
    }
  }
}

customElements.define('quantity-input', QuantityInput);
