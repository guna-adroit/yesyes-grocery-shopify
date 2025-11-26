if (!customElements.get("quantity-input")) {
  class QuantityInput extends HTMLElement {

    constructor() {
      super();
      this.productId = null;
      this.variantId = null;
      this.max = Infinity;
    }

    connectedCallback() {
      this.productId = Number(this.getAttribute("product-id"));

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
      const res = await fetch(`/products/${this.productId}.js`);
      const product = await res.json();

      const variant = product.variants[0];
      this.variantId = variant.id;
      this.max = variant.inventory_quantity ?? Infinity;
    }

    async syncWithCart() {
      const cart = await fetch("/cart.js").then(r => r.json());
      const item = cart.items.find(i => i.variant_id === this.variantId);
      const qty = item ? item.quantity : 0;

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

      if (newQty === 1 && current === 0) {
        // ---------------------------------------
        // CASE 1: First time adding => ADD API
        // ---------------------------------------
        await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.variantId,
            quantity: 1
          })
        });
      } else {
        // ---------------------------------------
        // CASE 2: Modify existing line => CHANGE API
        // ---------------------------------------
        await fetch("/cart/change.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.variantId,
            quantity: newQty
          })
        });
      }

      this.updateUI(newQty);

      // Global cart update event
      document.dispatchEvent(new CustomEvent("cart-updated"));
    }

  }

  customElements.define("quantity-input", QuantityInput);
}
