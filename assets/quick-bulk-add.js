import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInput extends HTMLElement {
  constructor() {
    super();

    this.variantId = Number(this.dataset.variantId);

    this.container = this.querySelector('.quick-add-quantity');
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');
  }

  connectedCallback() {
    if (!this.input) return;

    this.syncWithCart(); // Load current cart qty on page load

    this.plus?.addEventListener("click", () => this.addOne());
    this.minus?.addEventListener("click", () => this.removeOne());

     // Listen to Horizon cart updates (cart drawer interactions)
    this.cartUpdateHandler = () => this.syncWithCart();
    document.addEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
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

  /** ---------------------------------------------
   *  Load existing quantity for this product/variant
   * --------------------------------------------- */
  async syncWithCart() {
    const res = await fetch('/cart.js');
    const cart = await res.json();

    const line = cart.items.find(item => item.variant_id === this.variantId);

    const qty = line ? line.quantity : 0;

    this.input.value = qty;
    this.minus.disabled = qty === 0;

    if(this.input.value > 0){
        this.classList.add('visible');
    }
    
  }

  /** ---------------------------------------------
   *  Get line item key for this variant
   * --------------------------------------------- */
  async getLineItemKey() {
    const res = await fetch('/cart.js');
    const cart = await res.json();

    const item = cart.items.find(i => i.variant_id === this.variantId);
    return item ? item.key : null; // line-item key string
  }

  /** ---------------------------------------------
   *  ADD exactly 1 product always
   * --------------------------------------------- */
  async addOne() {
  this.setLoading(true);   // start loader
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

    const cartData = await res.json();

    await this.syncWithCart();
    this.dispatchCartAdd(cartData);

  } catch (err) {
    console.error("Add error:", err);
  }

  this.setLoading(false);  // stop loader
}


  /** ---------------------------------------------
   *  REMOVE exactly 1 product using line-item key
   * --------------------------------------------- */
  async removeOne() {
  let currentQty = parseInt(this.input.value) || 0;
  if (currentQty < 1) return;

  this.setLoading(true);   // start loader

  const newQty = currentQty - 1;
  const lineKey = await this.getLineItemKey();
  if (!lineKey) {
    this.setLoading(false);
    return;
  }

  try {
    const res = await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: lineKey,
        quantity: newQty
      })
    });

    if (!res.ok) {
      console.error(await res.text());
      this.setLoading(false);
      return;
    }

    const cartData = await res.json();

    await this.syncWithCart();
    this.dispatchCartAdd(cartData);

  } catch (err) {
    console.error("Remove error:", err);
  }

  this.setLoading(false);  // stop loader
}


  /** ---------------------------------------------
   *  Dispatch Horizon cart update event
   * --------------------------------------------- */
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

customElements.define('quantity-input', QuantityInput);
