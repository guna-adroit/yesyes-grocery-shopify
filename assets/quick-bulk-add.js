import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInputBulk extends HTMLElement {
  constructor() {
    super();
    this.variantId = Number(this.dataset.variantId);
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');
    this.lineKey = null;
    this._isLoading = false;
  }

  connectedCallback() {
  if (!this.input) return;

  // Initial sync only once per component
  this.syncWithCart();

  this.plus.addEventListener("click", () => this.addOne());
  this.minus.addEventListener("click", () => this.removeOne());

  // Filter the global cartUpdate event
  this.cartUpdateHandler = (e) => {
    const fromElement = e.target?.closest('quantity-input-bulk');
    const eventVariantId = e.detail?.variantId;

    // CASE 1: event dispatched from THIS component →
    // update only this one
    if (fromElement === this) {
      this.syncWithCart();
      return;
    }

    // CASE 2: update only if same variant updated by drawer/other pages
    // if (eventVariantId && eventVariantId === this.variantId) {
    //   this.syncWithCart();
    // }
    // ❌ otherwise DO NOTHING (skip!)
  };

  document.addEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
}

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
  }

  setLoading(isLoading) {
    this._isLoading = isLoading;
    this.plus.disabled = isLoading;
    this.minus.disabled = isLoading || parseInt(this.input.value) === 0;
    if (isLoading) this.classList.add('is-loading');
    else this.classList.remove('is-loading');
  }

  async syncWithCart() {
    const res = await fetch('/cart.js');
    const cart = await res.json();
    console.log("cart.js executed with syncWithCart()");

    const item = cart.items.find(i => i.variant_id === this.variantId);
    if (item) {
      this.lineKey = item.key;
      this.input.value = item.quantity;
      this.minus.disabled = item.quantity === 0;
      this.classList.add('visible');
    } else {
      this.lineKey = null;
      this.input.value = 0;
      this.minus.disabled = true;
      this.classList.remove('visible');
    }
  }

  instantUpdate(delta) {
    let qty = parseInt(this.input.value) || 0;
    qty += delta;
    this.input.value = qty;
    this.minus.disabled = qty === 0;
    if (qty > 0) this.classList.add('visible');
  }

  async addOne() {
    if (this._isLoading) return;
    this.setLoading(true);
    this.instantUpdate(1);

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.variantId, quantity: 1 })
      });
      if (!res.ok) {
        const error = await res.json();
        this.dispatchEvent(new CartErrorEvent(error));
        return;
      }

      const cartData = await res.json();
      const newItem = cartData.items?.find(i => i.variant_id === this.variantId);
      if (newItem) this.lineKey = newItem.key;

      this.dispatchCartAdd(cartData);
    } catch (err) {
      console.error(err);
    }
    this.setLoading(false);
  }

  async removeOne() {
    let qty = parseInt(this.input.value) || 0;
    if (qty < 1 || this._isLoading) return;

    this.setLoading(true);
    this.instantUpdate(-1);

    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.lineKey, quantity: qty - 1 })
      });
      if (!res.ok) {
        console.error(await res.text());
        return;
      }

      const cartData = await res.json();
      this.dispatchCartAdd(cartData);
    } catch (err) {
      console.error(err);
    }
    this.setLoading(false);
  }

  dispatchCartAdd(cartData) {
  const evt = new CartAddEvent(
    cartData,
    this.variantId.toString(),
    {
      variantId: this.variantId,
      source: 'quantity-input-bulk'
    }
  );

  this.dispatchEvent(evt);
  document.dispatchEvent(evt);
}
}

customElements.define('quantity-input-bulk', QuantityInputBulk);
