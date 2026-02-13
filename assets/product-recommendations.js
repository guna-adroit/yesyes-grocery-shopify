class ProductRecommendations extends HTMLElement {
  /**
   * The observer for the product recommendations
   * @type {IntersectionObserver}
   */
  #intersectionObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries[0]?.isIntersecting) return;

      observer.disconnect();
      this.#loadRecommendations();
    },
    { rootMargin: '0px 0px 400px 0px' }
  );

  /**
   * Observing changes to the elements attributes
   * @type {MutationObserver}
   */
  #mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only attribute changes are interesting
      if (mutation.target !== this || mutation.type !== 'attributes') continue;

      // Ignore error attribute changes
      if (mutation.attributeName === 'data-error') continue;

      // Ignore addition of hidden class because it means there's an error with the display
      if (mutation.attributeName === 'class' && this.classList.contains('hidden')) continue;

      // Ignore when the data-recommendations-performed attribute has been set to 'true'
      if (
        mutation.attributeName === 'data-recommendations-performed' &&
        this.dataset.recommendationsPerformed === 'true'
      )
        continue;

      // All other attribute changes trigger a reload
      this.#loadRecommendations();
      break;
    }
  });

  /**
   * The cached recommendations
   * @type {Record<string, string>}
   */
  #cachedRecommendations = {};

  /**
   * An abort controller for the active fetch (if there is one)
   * @type {AbortController | null}
   */
  #activeFetch = null;

  connectedCallback() {
    this.#intersectionObserver.observe(this);
    this.#mutationObserver.observe(this, { attributes: true });
  }

  /**
   * Load the product recommendations
   */
  #loadRecommendations() {
    const { productId, recommendationsPerformed, sectionId, intent } = this.dataset;
    const id = this.id;

    if (!productId || !id) {
      throw new Error('Product ID and an ID attribute are required');
    }

    // If the recommendations have already been loaded, accounts for the case where the Theme Editor
    // is loaded the section from the editor's visual preview context.
    if (recommendationsPerformed === 'true') {
      return;
    }

    this.#fetchCachedRecommendations(productId, sectionId, intent)
      .then((result) => {
        if (!result.success) {
          // The Theme Editor will place a section element element in the DOM whose section_id is not available
          // to the Section Renderer API. In this case, we can safely ignore the error.
          if (!Shopify.designMode) {
            this.#handleError(new Error(`Server returned ${result.status}`));
          }
          return;
        }

        const html = document.createElement('div');
        html.innerHTML = result.data || '';
        const recommendations = html.querySelector(`product-recommendations[id="${id}"]`);

        if (recommendations?.innerHTML && recommendations.innerHTML.trim().length) {
          this.dataset.recommendationsPerformed = 'true';
          this.innerHTML = recommendations.innerHTML;

          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("swym:collections-loaded"));
            function swymCallbackFn(swat){
                // your API calls go here
                document.addEventListener("swym:collections-loaded", function(){
                  swat.initializeActionButtons('body');
                  console.log("SWYM init related products");
                  // swat.initializeActionButtons(`product-recommendations[id="${id}"]`);
                })
              }
              if(!window.SwymCallbacks){
                window.SwymCallbacks = [];
              }
              window.SwymCallbacks.push(swymCallbackFn);
            
          }, 2000);

        } else {
          this.#handleError(new Error('No recommendations available'));
        }
        // Product Star rating start
        (function () {
          console.log("Star rating script initialized");
          const BASE = 'https://yesyes-grocerz.myshopify.com/apps/reviews';

          /* ----------------------------------
            Main Function - Can be called multiple times
          ---------------------------------- */
          function initStarRatings() {
            var productCards = document.querySelectorAll('product-card[data-product-id]:not([data-stars-initialized])');
            
            if (!productCards.length) {
              console.log("No new product cards found");
              return;
            }

            console.log("Found new product cards:", productCards.length);

            // Mark cards as initialized to avoid duplicate processing
            productCards.forEach(card => {
              card.setAttribute('data-stars-initialized', 'true');
            });

            const productIds = Array.from(productCards).map(card =>
              `gid://shopify/Product/${card.dataset.productId}`
            );

            /* ----------------------------------
              Fetch Stats (Bulk)
            ---------------------------------- */
            fetch(`${BASE}/api/v1/product-reviews/integration/stats`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ productIds })
            })
            .then(res => res.json())
            .then(data => {
              if (!data?.stats) return;
              console.log("Received stats:", data.stats);
              renderStats(data.stats, productCards);
            })
            .catch(err => {
              console.error('Review stats error:', err);
            });
          }

          /* ----------------------------------
            Render Function
          ---------------------------------- */
          function renderStats(stats, cards) {
            cards.forEach(card => {
              const numericId = card.dataset.productId;
              const gid = `gid://shopify/Product/${numericId}`;
              const productStats = stats[gid];
              var container = card.querySelector('.card-stars-container');
              
              if (!container) return;

              // No reviews → hide
              if (!productStats || productStats.totalReviews === 0) {
                container.style.display = 'none';
                return;
              }

              const avg = productStats.averageRating;
              const total = productStats.totalReviews;

              container.style.display = 'flex';
              container.classList.remove('skeleton');

              container.innerHTML = `
                <div class="card-stars" data-rating="${avg}">
                  ${generateStars(avg)}
                </div>
                <span class="card-review-avg">
                  ${avg}
                </span>
                <span class="card-review-count">
                  (${total})
                </span>
              `;
            });
          }

          /* ----------------------------------
            Generate Stars HTML
          ---------------------------------- */
          function generateStars(avg) {
            let html = '';
            for (let i = 1; i <= 5; i++) {
              let className = 'star';
              if (avg >= i) {
                className += ' filled';
              } else if (avg > i - 1) {
                className += ' half-filled';
              }
              html += `<label class="${className}"></label>`;
            }
            return html;
          }

          /* ----------------------------------
            Event Listeners for Dynamic Content
          ---------------------------------- */
          
          // Initial load
          initStarRatings();

          // Listen for Shopify section load events (Theme Editor)
          document.addEventListener('shopify:section:load', function(event) {
            console.log('Section loaded, re-initializing stars');
            setTimeout(initStarRatings, 200);
          });

          // Listen for Ajaxinate pagination load
          document.addEventListener('ajaxinate:loaded', function(event) {
            console.log('Ajaxinate loaded new products');
            setTimeout(initStarRatings, 200);
          });

          // Fallback: MutationObserver to detect new product cards
          const observer = new MutationObserver(function(mutations) {
            let newProductsAdded = false;
            
            mutations.forEach(mutation => {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                  // Check if the added node is a product card or contains product cards
                  if (node.matches && node.matches('product-card[data-product-id]')) {
                    newProductsAdded = true;
                  } else if (node.querySelectorAll) {
                    const cards = node.querySelectorAll('product-card[data-product-id]');
                    if (cards.length > 0) {
                      newProductsAdded = true;
                    }
                  }
                }
              });
            });

            if (newProductsAdded) {
              console.log('New products detected via MutationObserver');
              setTimeout(initStarRatings, 200);
            }
          });

          // Observe the product grid container
          const productGrid = document.querySelector('.collection, .product-grid, #product-grid, [data-ajaxinate-container]');
          if (productGrid) {
            observer.observe(productGrid, {
              childList: true,
              subtree: true
            });
            console.log('MutationObserver attached to product grid');
          }

        })();
        //Product star rating end
      })
      .catch((e) => {
        this.#handleError(e);
      });
  }

  /**
   * Fetches the recommendations and cached the result for future use
   * @param {string} productId
   * @param {string | undefined} sectionId
   * @param {string | undefined} intent
   * @returns {Promise<{ success: true, data: string } | { success: false, status: number }>}
   */
  async #fetchCachedRecommendations(productId, sectionId, intent) {
    const url = `${this.dataset.url}&product_id=${productId}&section_id=${sectionId}&intent=${intent}`;

    const cachedResponse = this.#cachedRecommendations[url];
    if (cachedResponse) {
      return { success: true, data: cachedResponse };
    }

    this.#activeFetch?.abort();
    this.#activeFetch = new AbortController();

    try {
      const response = await fetch(url, { signal: this.#activeFetch.signal });
      if (!response.ok) {
        return { success: false, status: response.status };
      }

      const text = await response.text();
      this.#cachedRecommendations[url] = text;
      return { success: true, data: text };
    } finally {
      this.#activeFetch = null;
    }
  }

  /**
   * Handle errors in a consistent way
   * @param {Error} error
   */
  #handleError(error) {
    console.error('Product recommendations error:', error.message);
    this.classList.add('hidden');
    this.dataset.error = 'Error loading product recommendations';
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define('product-recommendations', ProductRecommendations);
}
