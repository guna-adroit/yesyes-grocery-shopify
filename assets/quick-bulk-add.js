import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.variantId = this.dataset.variantId;
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');
  }

  connectedCallback() {
    if (!this.input) return;

    this.plus?.addEventListener("click", () => this.change(1));
    this.minus?.addEventListener("click", () => this.change(-1));
  }

  async change(offset) {
    const newValue = Math.max(0, (parseInt(this.input.value) || 0) + offset);
    this.input.value = newValue;

    if (newValue === 0) {
      this.updateCartLine(0);
    } else {
      this.addToCart(newValue);
    }
  }

  /**
   * Add or update quantity using cart/add.js (safer)
   */
  async addToCart(quantity) {
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(this.variantId),
          quantity: quantity
        })
      });

      if (!res.ok) {
        const error = await res.json();
        this.dispatchEvent(new CartErrorEvent(error));  
        return;
      }

      const result = await res.json();
      this.dispatchCartAddEvent(result);
    } catch (err) {
      console.error("Add to cart error", err);
    }
  }

  /**
   * Remove/Update line using change.js
   */
  async updateCartLine(quantity) {
    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(this.variantId),
          quantity: quantity
        })
      });

      if (!res.ok) return;

      const result = await res.json();
      this.dispatchCartAddEvent(result);
    } catch (err) {
      console.error("Change error", err);
    }
  }

  /**
   * Horizon method for updating cart drawer + bubble
   */
  dispatchCartAddEvent(cartData) {
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
    document.dispatchEvent(event); // required for global listeners
  }
}

customElements.define('quantity-input', QuantityInput);
