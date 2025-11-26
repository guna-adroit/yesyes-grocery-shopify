if (!customElements.get("quantity-input")) {
  class QuantityInput extends HTMLElement {

    constructor() {
      super();
      this.handle = null;
      this.variantId = null;
      this.max = Infinity;
      this.line = null; // line number in cart
    }

    connectedCallback() {
      this.handle = this.getAttribute("product-handle");

      this.minusBtn = this.querySelector("[data-minus]");
      this.plusBtn = this.querySelector("[data-plus]");
      this.input = this.querySelector("[data-qty]");

      this.minusBtn.addEventListener("click", () => this.updateQuantity(-1));
      this.plusBtn.addEventListener("click", () => this.updateQuantity(1));

      this.init();
      document.addEventListener("cart-updated", () => this.syncWithCart());
    }

    async init() {
      await this.loadVariant();
      await this.syncWithCart();
    }

    async loadVariant() {
      const res = await fetch(`/products/${this.handle}.js`);
      const product = await res.json();

      const variant = product.variants[0];
      this.variantId = variant.id;
      this.max = variant.inventory_quantity ?? Infinity;
    }

    async syncWithCart() {
      const cart = await fetch("/cart.js").then(r => r.json());

      let qty = 0;
      this.line = null;

      cart.items.forEach((item, index) => {
        if (item.variant_id === this.variantId) {
          qty = item.quantity;
          this.line = index + 1; // Shopify line index is 1-based
        }
      });

      this.updateUI(qty);
    }

    updateUI(qty) {
      this.input.value = qty;
      this.minusBtn.disabled = qty <= 0;
      this.plusBtn.disabled = qty >= this.max;
    }

    async updateQuantity(change) {
      const current = Number(this.input.value);
      const newQty = current + change;

      if (newQty < 0 || newQty > this.max) return;

      // FIRST ADD → /cart/add.js
      if (current === 0 && newQty === 1) {
        await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.variantId,
            quantity: 1
          })
        });

      } else {
        // SUBSEQUENT CHANGES → MUST USE line number
        await fetch("/cart/change.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            line: this.line,
            quantity: newQty
          })
        });
      }

      await this.syncWithCart();

      document.dispatchEvent(new CustomEvent("cart-updated"));
    }

  }

  customElements.define("quantity-input", QuantityInput);
}
