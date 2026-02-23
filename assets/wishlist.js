(function() {
    const title = {
        {
            product.title | json
        }
    };
    const image = {
        {
            product.featured_image | image_url: width: 300 | json
        }
    };
    const WISHLIST_STORAGE_KEY = 'shopify_wishlist';
    const APP_PROXY_URL = 'https://yesyes-grocerz.myshopify.com/apps/reviews'; // keep if using app proxy


    function initProductPageWishlist() {
        const button = document.querySelector('.wishlist-btn-product-page[data-wishlist-btn]');
        if (!button) return;

        const productId = button.getAttribute('data-product-id');

        if (isInWishlist(productId)) {
            button.classList.add('active');
        }
        if (isInWishlistServer(productId)) {
            button.classList.add('active');
        }

        button.addEventListener('click', handleWishlistToggle);
    }

    function isInWishlist(productId) {
        const wishlist = getWishlist();
        return wishlist.includes(productId);
    } {
        % comment %
    }

    function isInWishlistServer(productId) {
        const wishlist = getWishlistServer();
        return wishlist.includes(productId);
    } {
        % endcomment %
    }

    function getWishlist() {
        try {
            const wishlistData = localStorage.getItem(WISHLIST_STORAGE_KEY);
            return wishlistData ? JSON.parse(wishlistData) : [];
        } catch (e) {
            console.error('Error getting wishlist:', e);
            return [];
        }
    }

    async function getWishlistServer() {
        const wishlistButton = document.querySelector('.wishlist-btn-product-page[data-wishlist-btn]');
        const productElement = document.querySelector('.wishlist-product-page');

        const productId = productElement.getAttribute('data-product-id');
        const productIdString = String(productId); // or productId.toString()
        const productIds = [productIdString];

        console.log(productIds); // ["15573512093777"]

        try {

            const response = await fetch("https://yesyes-grocerz.myshopify.com/apps/reviews/api/v1/wishlist/integration/verify", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    customerId: "gid://shopify/Customer/23852944097361",
                    productIds: productIds
                })
            });

            const data = await response.json();
            console.log(data);

            // Uncomment if you want to handle errors:
            /*
            if (!response.ok || data.error) {
              // Revert UI on failure
              wishlistButton.classList.toggle('active');
              throw new Error(data.error || 'Failed to get wishlist details');
            }
            */

            productIds.forEach((id) => {
                const gid = `gid://shopify/Product/${id}`;
                const isInWishlist = data[gid] === true;

                if (isInWishlist) {
                    wishlistButton.classList.add('active');
                }

                console.log(`Product ${id}:`, isInWishlist ? "In Wishlist" : "Not in Wishlist");
            });

            return data ? data : [];
        } catch (e) {
            console.error('Error getting wishlist:', e);
            return [];
        }
    }

    function saveWishlistLocal(wishlist) {
        try {
            localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
        } catch (e) {
            console.error('Error saving wishlist:', e);
        }
    }

    async function handleWishlistToggle(event) {
        event.preventDefault();

        const button = event.currentTarget;
        const productId = button.getAttribute('data-product-id');

        const isLoggedIn = {
            %
            if customer %
        }
        true {
            %
            else %
        }
        false {
            % endif %
        };

        if (isLoggedIn) {
            await toggleWishlistServer(productId, button);
        } else {
            toggleWishlistLocal(productId, button);
        }
    }

    function toggleWishlistLocal(productId, button) {
        const wishlist = getWishlist();
        const index = wishlist.indexOf(productId);



        if (index > -1) {
            wishlist.splice(index, 1);
            button.classList.remove('active');
            showWishlistToast(title, image, 'removed');
        } else {
            wishlist.push(productId);
            button.classList.add('active');
            showWishlistToast(title, image, 'added');
        }

        saveWishlistLocal(wishlist);


        document.dispatchEvent(new CustomEvent('wishlist:updated', {
            detail: {
                wishlist,
                productId,
                action: index > -1 ? 'removed' : 'added'
            }
        }));
    }

    async function toggleWishlistServer(productId, button) {
        try {
            const customerId = "{{ customer.id }}";

            // Convert numeric IDs to GID format
            const productGid = `gid://shopify/Product/${productId}`;
            const customerGid = `gid://shopify/Customer/${customerId}`;

            // Optimistic UI update
            button.classList.toggle('active');

            const response = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/toggle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    customerId: customerGid,
                    productId: productGid
                })
            });

            const data = await response.json();
            console.log(data);

            if (!response.ok || data.error) {
                // Revert UI on failure
                button.classList.toggle('active');
                throw new Error(data.error || 'Failed to update wishlist');
            }

            // Update UI based on server response
            if (data.status === 'added') {
                button.classList.add('active');
                showWishlistToast(title, image, data.status);
            } else {
                button.classList.remove('active');
                showWishlistToast(title, image, data.status);
            }

            document.dispatchEvent(new CustomEvent('wishlist:updated', {
                detail: {
                    productId,
                    status: data.status
                }
            }));

        } catch (error) {
            console.error('Error updating wishlist:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProductPageWishlist);
    } else {
        initProductPageWishlist();
    }

    function showWishlistToast(title, image, type) {
        const existingToast = document.querySelector('.wishlist-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `wishlist-toast ${type}`;

        const message =
            type === 'added' ?
            'has been added to Wishlist.' :
            'has been removed from Wishlist.';

        toast.innerHTML = `
            <div class="wishlist-toast-inner">
            <img src="${image}" alt="${title}" />
            <div class="wishlist-toast-content">
                <strong>${title}</strong>
                <p>${message}</p>
            </div>
            </div>
        `;

        document.body.appendChild(toast);

        // Enter animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto hide
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');

            setTimeout(() => {
                toast.remove();
            }, 400);
        }, 3000);
    }

})();




(function () {
  const config = window.WISHLIST_CONFIG;
  if (!config) return;

  /* =========================================================
     WISHLIST STORE (Single Source of Truth)
  ========================================================== */

  const WishlistStore = {
    verifiedCache: new Map(),

    getLocal() {
    try {
        const data = JSON.parse(localStorage.getItem(config.storageKey)) || [];
        return data.map(String); // normalize to string
    } catch {
        return [];
    }
    },

    setLocal(data) {
      localStorage.setItem(config.storageKey, JSON.stringify(data));
    },

    async verifyBulk(productIds) {
      if (!config.customerId || !productIds.length) return {};

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

        const data = await response.json();

        Object.entries(data).forEach(([gid, value]) => {
          const id = gid.split("/").pop();
          this.verifiedCache.set(id, value);
        });

        return data;
      } catch (err) {
        console.error("Wishlist verify error:", err);
        return {};
      }
    },

    async toggleServer(productId) {
      const response = await fetch(
        `${config.appProxyUrl}/api/v1/wishlist/integration/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: config.customerId,
            productId: `gid://shopify/Product/${productId}`,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Toggle failed");
      }

      this.verifiedCache.set(productId, data.status === "added");

      return data.status;
    },
  };

  /* =========================================================
     TOAST
  ========================================================== */

  function showToast(title, image, type) {
    const old = document.querySelector(".wishlist-toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.className = `wishlist-toast ${type}`;
    toast.innerHTML = `
      <div class="wishlist-toast-inner">
        <img src="${image}" alt="${title}">
        <div>
          <strong>${title}</strong>
          <p>${type === "added" ? "Added to Wishlist" : "Removed from Wishlist"}</p>
        </div>
      </div>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  /* =========================================================
     WEB COMPONENT
  ========================================================== */

  class WishlistButton extends HTMLElement {
    connectedCallback() {
      this.productId = this.dataset.productId;
      this.title = this.dataset.productTitle || "";
      this.image = this.dataset.productImage || "";

      if (!this.productId) return;

      this.render();
      this.initialize();
    }

    render() {
        const variant = this.dataset.variant || "default";

        if (variant === "icon") {
            this.innerHTML = `
            <button type="button"
                    class="wishlist-btn wishlist-btn--icon"
                    aria-pressed="false"
                    aria-label="Add to Wishlist">

                <svg class="wishlist-icon" width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path class="wishlist-outline"
                        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
                        a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23
                        l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                        stroke="currentColor"
                        stroke-width="2"/>

                <path class="wishlist-filled"
                        d="M12 21.23l-7.78-7.78a5.5 5.5 0 0 1
                        7.78-7.78 5.5 5.5 0 0 1
                        7.78 7.78L12 21.23z"
                        fill="currentColor"/>
                </svg>

            </button>
            `;
        } else {
            this.innerHTML = `
            <button type="button"
                    class="wishlist-btn"
                    aria-pressed="false">
                <span class="wishlist-label-add">Add to Wishlist</span>
                <span class="wishlist-label-remove">Remove from Wishlist</span>
            </button>
            `;
        }

        this.button = this.querySelector("button");
        this.button.addEventListener("click", () => this.handleToggle());
        }

    async initialize() {
      if (config.customerId) {
        if (!WishlistStore.verifiedCache.has(this.productId)) {
          await WishlistStore.verifyBulk([this.productId]);
        }

        if (WishlistStore.verifiedCache.get(this.productId)) {
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
      if (this.button.disabled) return;

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
      } catch (err) {
        console.error("Wishlist toggle error:", err);
      }

      this.button.disabled = false;
    }

    toggleLocal() {
        const productId = String(this.productId);
        const wishlist = WishlistStore.getLocal();

        const index = wishlist.indexOf(productId);

        if (index > -1) {
            wishlist.splice(index, 1);
            this.setActive(false);
            showToast(this.title, this.image, "removed");
        } else {
            wishlist.push(productId);
            this.setActive(true);
            showToast(this.title, this.image, "added");
        }

        WishlistStore.setLocal(wishlist);
    }

    setActive(state) {
      this.button.classList.toggle("active", state);
      this.button.setAttribute("aria-pressed", state);
    }
  }

  if (!customElements.get("wishlist-button")) {
    customElements.define("wishlist-button", WishlistButton);
  }
})();