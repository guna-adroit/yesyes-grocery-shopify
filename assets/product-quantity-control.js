import { ThemeEvents, CartAddEvent, CartErrorEvent, VariantUpdateEvent } from '@theme/events';

// class ProductQuantityControl extends HTMLElement {
//   constructor() {
//     super();
//     this.variantId = parseInt(this.dataset.variantId);
//     this.quantity = 0;
//     this.lineKey = null;
//     this.isUpdating = false;
//   }

//   connectedCallback() {
//     this.render();
//     this.minusButton = this.querySelector('.qty-minus');
//     this.plusButton = this.querySelector('.qty-plus');
//     this.valueEl = this.querySelector('.qty-value');

//     this.minusButton.addEventListener('click', this.decrease);
//     this.plusButton.addEventListener('click', this.increase);

//     document.addEventListener('cart:update', this.onCartUpdate);

//     this.fetchCartAndSync(); // sync on first load
//   }

//   disconnectedCallback() {
//     document.removeEventListener('cart:update', this.onCartUpdate);
//   }

//   render() {
//     this.innerHTML = `
//       <div class="quantity-control">
//         <button class="qty-minus" aria-label="Decrease quantity">−</button>
//         <span class="qty-value">${this.quantity}</span>
//         <button class="qty-plus" aria-label="Increase quantity">+</button>
//       </div>
//     `;
//   }

//   updateUI() {
//     if (this.valueEl) this.valueEl.textContent = this.quantity;
//   }

//   onCartUpdate = (e) => {
//     const cart = e?.detail?.resource || e?.detail?.cart || e?.detail;
//     if (!cart?.items) return;

//     const item = cart.items.find(i => i.variant_id === this.variantId);
//     if (item) {
//       this.quantity = item.quantity;
//       this.lineKey = item.key;
//       this.updateUI();
//       this.hidden = false;
//     } else {
//       this.quantity = 0;
//       this.lineKey = null;
//       this.updateUI();
//       this.hidden = true;
//     }
//   };

//   async fetchCartAndSync() {
//     try {
//       const res = await fetch('/cart.js');
//       const cart = await res.json();
//       const item = cart.items.find(i => i.variant_id === this.variantId);
//       if (item) {
//         this.quantity = item.quantity;
//         this.lineKey = item.key;
//         this.updateUI();
//         this.hidden = false;
//       }
//     } catch (err) {
//       console.error('Cart sync error:', err);
//     }
//   }

//   increase = async () => {
//     if (this.isUpdating) return;
//     this.isUpdating = true;

//     const newQuantity = this.quantity + 1;
//     await this.updateCartQuantity(newQuantity);
//     this.isUpdating = false;
//   };

//   decrease = async () => {
//     if (this.isUpdating) return;
//     this.isUpdating = true;

//     const newQuantity = this.quantity - 1;
//     if (newQuantity <= 0) {
//       await this.removeFromCart();
//     } else {
//       await this.updateCartQuantity(newQuantity);
//     }

//     this.isUpdating = false;
//   };

//   async updateCartQuantity(newQuantity) {
//     try {
//       const body = this.lineKey
//         ? { id: this.lineKey, quantity: newQuantity }
//         : { updates: { [this.variantId]: newQuantity } };

//       const res = await fetch('/cart/change.js', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body),
//       });

//       const cart = await res.json();

//       // update local UI quickly
//       this.quantity = newQuantity;
//       this.updateUI();

//       // dispatch cart:update so other parts (cart icon, drawer) refresh
//       document.dispatchEvent(new CustomEvent('cart:update', { detail: { resource: cart } }));
//     } catch (err) {
//       console.error('Cart quantity update failed:', err);
//     }
//   }

//   async removeFromCart() {
//     try {
//       if (!this.lineKey) return;
//       const res = await fetch('/cart/change.js', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ id: this.lineKey, quantity: 0 }),
//       });
//       const cart = await res.json();
//       document.dispatchEvent(new CustomEvent('cart:update', { detail: { resource: cart } }));
//     } catch (err) {
//       console.error('Remove from cart failed:', err);
//     }
//   }
// }

// customElements.define('product-quantity-control', ProductQuantityControl);
