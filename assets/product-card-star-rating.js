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

// Product page star rating

(function () {
  const BASE = 'https://yesyes-grocerz.myshopify.com/apps/reviews';

  function initProductPageStars() {
    const container = document.querySelector('.product-stars-container[data-product-id]');
    if (!container || container.dataset.initialized) return;

    const productId = container.dataset.productId;
    if (!productId) return;

    container.dataset.initialized = "true";

    const gid = `gid://shopify/Product/${productId}`;

    fetch(`${BASE}/api/v1/product-reviews/integration/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: [gid] })
    })
    .then(res => res.json())
    .then(data => {
      if (!data?.stats || !data.stats[gid]) {
        container.style.display = 'none';
        return;
      }

      const stats = data.stats[gid];

      if (!stats.totalReviews || stats.totalReviews === 0) {
        container.style.display = 'none';
        return;
      }

      const avg = stats.averageRating;
      const total = stats.totalReviews;

      container.classList.remove('skeleton');
      container.style.display = 'flex';

      container.innerHTML = `
        <div class="product-stars" data-rating="${avg}">
          ${generateStars(avg)}
        </div>
        <span class="product-review-avg">${avg}</span>
        <span class="product-review-count">(${total})</span>
      `;
    })
    .catch(err => {
      console.error('Product review stats error:', err);
    });
  }

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

  // Initial load
  document.addEventListener('DOMContentLoaded', initProductPageStars);

  // Theme editor support
  document.addEventListener('shopify:section:load', function () {
    setTimeout(initProductPageStars, 200);
  });

})();
