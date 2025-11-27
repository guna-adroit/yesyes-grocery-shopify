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

    // One real sync on page load
    this.syncWithCart();

    this.plus?.addEventListener("click", () => this.addOne());
    this.minus?.addEventListener("click", () => this.removeOne());

    // Debounced sync for external cart actions
    this.cartUpdateHandler = this.debounce(async (e) => {
      await this.syncWithCart();
    }, 250);

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

  /** Load data from actual cart ONCE or on Horizon events */
  async syncWithCart() {
    const res = await fetch('/cart.js');
    const cart = await res.json();

    const item = cart.items.find(i => i.variant_id === this.variantId);

    if (item) {
      this.lineKey = item.key;
      this.input.value = item.quantity;
      this.classList.add('visible');
      this.minus.disabled = item.quantity === 0;
    } else {
      this.lineKey = null;
      this.input.value = 0;
      this.classList.remove('visible');
      this.minus.disabled = true;
    }
  }

  /** Instant UI update */
  instantUpdate(delta) {
    let qty = parseInt(this.input.value) || 0;
    qty += delta;

    this.input.value = qty;
    this.minus.disabled = qty === 0;

    if (qty > 0) this.classList.add('visible');
    else this.classList.remove('visible');
  }

  /** ADD exactly 1 */
  async addOne() {
    this.setLoading(true);
    this.instantUpdate(1); // instant visual feedback

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.variantId, quantity: 1 })
      });

      if (!res.ok) {
        const error = await res.json();
        this.dispatchEvent(new CartErrorEvent(error));
        return this.setLoading(false);
      }

      const cartData = await res.json();

      // Update line key (NO need to call /cart.js)
      const item = cartData.items.find(i => i.variant_id === this.variantId);
      if (item) this.lineKey = item.key;

      this.dispatchCartAdd(cartData);

    } catch (err) {
      console.error("Add error:", err);
    }

    this.setLoading(false);
  }

  /** REMOVE exactly 1 */
  async removeOne() {
    let qty = parseInt(this.input.value);
    if (qty <= 0) return;

    this.setLoading(true);
    this.instantUpdate(-1);

    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.lineKey,
          quantity: qty - 1
        })
      });

      if (!res.ok) {
        console.error(await res.text());
        return this.setLoading(false);
      }

      const cartData = await res.json();
      this.dispatchCartAdd(cartData);

    } catch (err) {
      console.error("Remove error:", err);
    }

    this.setLoading(false);
  }

  /** Dispatch Horizon event */
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
      this.minus.disabled = parseInt(this.input.value) === 0;
    }
  }
}

customElements.define('quantity-input', QuantityInput);
