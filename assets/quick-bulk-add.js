import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.variantId = Number(this.dataset.variantId);
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');
  }

  connectedCallback() {
    if (!this.input) return;

    // Load existing cart qty when block renders
    this.syncWithCart();

    this.plus?.addEventListener("click", () => this.addOne());
    this.minus?.addEventListener("click", () => this.removeOne());
  }

  /** -------- LOAD EXISTING CART QTY -------- */
  async syncWithCart() {
    const res = await fetch('/cart.js');
    const cart = await res.json();
    const line = cart.items.find(i => i.variant_id === this.variantId);

    this.input.value = line ? line.quantity : 0;
  }

  /** -------- ADD 1 ITEM ALWAYS (NOT FULL QTY) -------- */
  async addOne() {
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
        return;
      }

      const cartData = await res.json();

      // Update input to new qty
      await this.syncWithCart();

      this.dispatchCartAdd(cartData);

    } catch (err) {
      console.error('Add error', err);
    }
  }

  /** Find the line item key for this variant in the cart */
async getLineItemKey() {
  const res = await fetch('/cart.js');
  const cart = await res.json();

  const item = cart.items.find(i => i.variant_id === this.variantId);
  return item ? item.key : null;
}

/** -------- REMOVE 1 ITEM ALWAYS -------- */
async removeOne() {
  let currentQty = parseInt(this.input.value) || 0;
  if (currentQty === 0) return;

  const newQty = currentQty - 1;

  // Get the line-item key (required for /change.js)
  const lineKey = await this.getLineItemKey();
  if (!lineKey) return; // Item not in cart

  try {
    const res = await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line: lineKey,
        quantity: newQty
      })
    });

    if (!res.ok) {
      console.error(await res.text());
      return;
    }

    const cartData = await res.json();

    // Update UI
    await this.syncWithCart();
    this.dispatchCartAdd(cartData);

  } catch (err) {
    console.error('Remove error', err);
  }
}

  /** -------- DISPATCH TO HORIZON CART DRAWER -------- */
  dispatchCartAdd(cartData) {
    const event = new CartAddEvent(
      cartData,
      this.variantId.toString(),
      {
        source: 'quick-bulk-add',
        itemCount: cartData.item_count,
        sections: cartData.sections,
      }
    );

    this.dispatchEvent(event);
    document.dispatchEvent(event);
  }
}

customElements.define('quantity-input', QuantityInput);
