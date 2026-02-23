(function () {
  const config = window.WISHLIST_CONFIG;
  if (!config) return;

  /* ==============================
      WISHLIST STORE
  ============================== */

  const WishlistStore = {
    cache: null,

    getLocal() {
      try {
        const data = localStorage.getItem(config.storageKey);
        return data ? JSON.parse(data) : [];
      } catch {
        return [];
      }
    },

    setLocal(data) {
      localStorage.setItem(config.storageKey, JSON.stringify(data));
    },

    async verifyServer(productIds) {
      if (!config.customerId) return {};

      try {
        const response = await fetch(
          `${config.appProxyUrl}/api/v1/wishlist/integration/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerId: config.customerId,
              productIds: productIds.map(
                (id) => `gid://shopify/Product/${id}`
              ),
            }),
          }
        );

        if (!response.ok) throw new Error("Verify failed");

        return await response.json();
      } catch (error) {
        console.error("Wishlist verify error:", error);
        return {};
      }
    },

    async toggleServer(productId) {
      const productGid = `gid://shopify/Product/${productId}`;

      const response = await fetch(
        `${config.appProxyUrl}/api/v1/wishlist/integration/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: config.customerId,
            productId: productGid,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Toggle failed");
      }

      return data.status; // "added" | "removed"
    },
  };

  /* ==============================
      TOAST
  ============================== */

  function showToast(title, image, type) {
    const existing = document.querySelector(".wishlist-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `wishlist-toast ${type}`;

    toast.innerHTML = `
      <div class="wishlist-toast-inner">
        <img src="${image}" alt="${title}">
        <div>
          <strong>${title}</strong>
          <p>${
            type === "added"
              ? "Added to Wishlist"
              : "Removed from Wishlist"
          }</p>
        </div>
      </div>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /* ==============================
      WEB COMPONENT
  ============================== */

  class WishlistButton extends HTMLElement {
    connectedCallback() {
      this.productId = this.dataset.productId;
      this.title = this.dataset.productTitle;
      this.image = this.dataset.productImage;

      if (!this.productId) return;

      this.render();
      this.initialize();
    }

    render() {
      this.innerHTML = `
        <button type="button" class="wishlist-btn">
          <span class="wishlist-text-add">Add to Wishlist</span>
          <span class="wishlist-text-remove">Remove from Wishlist</span>
        </button>
      `;

      this.button = this.querySelector("button");
    }

    async initialize() {
      if (config.customerId) {
        const result = await WishlistStore.verifyServer([
          this.productId,
        ]);

        const gid = `gid://shopify/Product/${this.productId}`;
        if (result[gid]) {
          this.setActive(true);
        }
      } else {
        const local = WishlistStore.getLocal();
        if (local.includes(this.productId)) {
          this.setActive(true);
        }
      }

      this.button.addEventListener("click", () =>
        this.handleToggle()
      );
    }

    async handleToggle() {
      this.button.disabled = true;

      try {
        if (config.customerId) {
          const status = await WishlistStore.toggleServer(
            this.productId
          );
          this.setActive(status === "added");
          showToast(this.title, this.image, status);
        } else {
          this.toggleLocal();
        }

        document.dispatchEvent(
          new CustomEvent("wishlist:updated", {
            detail: { productId: this.productId },
          })
        );
      } catch (error) {
        console.error(error);
      }

      this.button.disabled = false;
    }

    toggleLocal() {
      const wishlist = WishlistStore.getLocal();
      const index = wishlist.indexOf(this.productId);

      if (index > -1) {
        wishlist.splice(index, 1);
        this.setActive(false);
        showToast(this.title, this.image, "removed");
      } else {
        wishlist.push(this.productId);
        this.setActive(true);
        showToast(this.title, this.image, "added");
      }

      WishlistStore.setLocal(wishlist);
    }

    setActive(state) {
      this.button.classList.toggle("active", state);
    }
  }

  customElements.define("wishlist-button", WishlistButton);
})();