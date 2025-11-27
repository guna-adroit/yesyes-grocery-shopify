import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInputBulk extends HTMLElement {
  constructor() {
    super();

    this.variantId = Number(this.dataset.variantId);
    this.container = this.querySelector('.quick-add-quantity');
    this.input = this.querySelector('input');
    this.lineKey = null; // cached cart line item key
  }

  connectedCallback() {
    if (!this.input) return;

    // Initial cart sync
    this.syncWithCart();

    // Debounced cart update listener per instance
    this.cartUpdateHandler = this.debounce(() => this.syncWithCart(), 300);
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

  setLoading(isLoading) {
    if (isLoading) {
      this.classList.add("is-loading");
      this.input.closest('.quick-add-quantity')?.querySelectorAll('button')?.forEach(b => b.setAttribute('disabled', 'disabled'));
    } else {
      this.classList.remove("is-loading");
      const qty = parseInt(this.input.value);
      const minus = this.querySelector('[data-minus]');
      const plus = this.querySelector('[data-plus]');
      plus?.removeAttribute('disabled');
      if (qty === 0) minus?.setAttribute('disabled', 'disabled');
      else minus?.removeAttribute('disabled');
    }
  }

  async syncWithCart() {
    const res = await fetch('/cart.js');
    const cart = await res.json();

    const item = cart.items.find(i => i.variant_id === this.variantId);
    if (item) {
      this.lineKey = item.key;
      this.input.value = item.quantity;
      this.classList.add('visible');
      this.querySelector('[data-minus]').disabled = item.quantity === 0;
    } else {
      this.lineKey = null;
      this.input.value = 0;
      this.classList.remove('visible');
      this.querySelector('[data-minus]').disabled = true;
    }
  }

  instantUpdate(delta) {
    let qty = parseInt(this.input.value) || 0;
    qty += delta;
    this.input.value = qty;
    const minus = this.querySelector('[data-minus]');
    minus.disabled = qty === 0;
    if (qty > 0) this.classList.add('visible');
  }

  async addOne() {
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
        this.setLoading(false);
        return;
      }

      const cartData = await res.json();
      const newItem = cartData.items?.find(i => i.variant_id === this.variantId);
      if (newItem) this.lineKey = newItem.key;

      this.dispatchCartAdd(cartData);
    } catch (err) {
      console.error("Add error:", err);
    }

    this.setLoading(false);
  }

  async removeOne() {
    let qty = parseInt(this.input.value) || 0;
    if (qty < 1) return;

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
        this.setLoading(false);
        return;
      }

      const cartData = await res.json();
      this.dispatchCartAdd(cartData);
    } catch (err) {
      console.error("Remove error:", err);
    }

    this.setLoading(false);
  }

  dispatchCartAdd(cartData) {
    const evt = new CartAddEvent(cartData, this.variantId.toString(), {
      source: 'quantity-input',
      itemCount: cartData.item_count,
      sections: cartData.sections
    });

    this.dispatchEvent(evt);
    document.dispatchEvent(evt);
  }
}

customElements.define('quantity-input-bulk', QuantityInputBulk);

// ------------------------
// Event Delegation for plus/minus buttons
// ------------------------
document.addEventListener('click', (e) => {
  const inputBulk = e.target.closest('quantity-input-bulk');
  if (!inputBulk) return;

  if (e.target.matches('[data-plus]')) inputBulk.addOne();
  if (e.target.matches('[data-minus]')) inputBulk.removeOne();
});
