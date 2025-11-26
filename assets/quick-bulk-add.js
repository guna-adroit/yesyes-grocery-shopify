class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.productId = null; // Shopify variant ID
    this.max = Infinity;   // max quantity from product inventory
  }

  connectedCallback() {
    this.productId = Number(this.getAttribute("product-id"));
    this.max = Number(this.getAttribute("max")) || Infinity;

    this.minusBtn = this.querySelector("[data-minus]");
    this.plusBtn = this.querySelector("[data-plus]");
    this.input = this.querySelector("[data-qty]");

    this.minusBtn.addEventListener("click", () => this.changeQty(-1));
    this.plusBtn.addEventListener("click", () => this.changeQty(1));

    // Update UI on first load
    this.syncWithCart();

    // Listen for cart changes triggered elsewhere
    document.addEventListener("cart-updated", () => this.syncWithCart());
  }

  async syncWithCart() {
    const cart = await fetch("/cart.js").then(r => r.json());

    const lineItem = cart.items.find(i => i.variant_id === this.productId);
    const quantity = lineItem ? lineItem.quantity : 0;

    this.updateUI(quantity);
  }

  updateUI(qty) {
    this.input.value = qty;

    // Disable minus at zero
    this.minusBtn.disabled = qty <= 0;

    // Disable plus at max
    this.plusBtn.disabled = qty >= this.max;
  }

  async changeQty(amount) {
    let currentQty = Number(this.input.value);
    let newQty = currentQty + amount;

    if (newQty < 0 || newQty > this.max) return;

    // Build Shopify cart/change payload
    const body = {
      id: this.productId,
      quantity: newQty
    };

    await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    this.updateUI(newQty);

    // Broadcast to theme
    document.dispatchEvent(new CustomEvent("cart-updated"));
  }
}

customElements.define("quantity-input", QuantityInput);
