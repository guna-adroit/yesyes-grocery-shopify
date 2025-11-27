import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInputBulk extends HTMLElement {
  constructor() {
    super();

    this.variantId = Number(this.dataset.variantId);

    this.container = this.querySelector('.quick-add-quantity');
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');
    console.log(this.minus);
    this.lineKey = null;  // cache line-item key
  }

  connectedCallback() {
    if (!this.input) return;

    this.syncWithCart(); // initial load
    console.log(this.plus);
    this.plus?.addEventListener("click", () => this.addOne());
    this.minus?.addEventListener("click", () => this.removeOne());

    // update from cart drawer changes
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

    this.plus.setAttribute("disabled", "disabled");
    this.minus.setAttribute("disabled", "disabled");

  } else {
    this.classList.remove("is-loading");

    this.plus.removeAttribute("disabled");

    if (parseInt(this.input.value) === 0) {
      this.minus.setAttribute("disabled", "disabled");
    } else {
      this.minus.removeAttribute("disabled");
    }
  }
}

  /** FAST SYNC — only 1 fetch */
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

  /** UI updates instantly */
  instantUpdate(delta) {
    let qty = parseInt(this.input.value) || 0;
    qty += delta;
    this.input.value = qty;
    this.minus.disabled = qty === 0;
    if (qty > 0) this.classList.add('visible');
  }

  /** ADD 1 item */
  async addOne() {
    this.setLoading(true);
    this.instantUpdate(1);   // instantly update UI

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.variantId,
          quantity: 1
        })
      });

      if (!res.ok) {
        const error = await res.json();
        this.dispatchEvent(new CartErrorEvent(error));
        this.setLoading(false);
        return;
      }

      const cartData = res.json();

      // update line item key from response
      const newItem = cartData.items?.find(i => i.variant_id === this.variantId);
      if (newItem) this.lineKey = newItem.key;

      this.dispatchCartAdd(cartData);

    } catch (err) {
      console.error("Add error:", err);
    }

    this.setLoading(false);
  }

  /** REMOVE 1 item */
  async removeOne() {
    let qty = parseInt(this.input.value) || 0;
    if (qty < 1) return;

    this.setLoading(true);
    this.instantUpdate(-1);  // instantly update UI

    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.lineKey,     // cached key (no extra fetch needed)
          quantity: qty - 1
        })
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
    const evt = new CartAddEvent(
      cartData,
      this.variantId.toString(),
      {
        source: 'quantity-input',
        itemCount: cartData.item_count,
        sections: cartData.sections
      }
    );

    this.dispatchEvent(evt);
    document.dispatchEvent(evt);
  }
}

customElements.define('quantity-input-bulk', QuantityInputBulk);