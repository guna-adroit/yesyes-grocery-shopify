//add 0.2s delay to allow product cards to render and be detected
var productCards = document.querySelectorAll('product-card[data-product-id]');
if (!productCards.length) { console.log("No product cards found, skipping star rating initialization."); }
else { console.log("Product cards found, initializing star ratings..."); }

(function () {
    
console.log("0: initialized");
  const BASE = 'https://yesyes-grocerz.myshopify.com/apps/reviews';

  /* ----------------------------------
     1️⃣ Collect Product IDs
  ---------------------------------- */

  var productCards = document.querySelectorAll('product-card[data-product-id]');
  if (!productCards.length) return;
    console.log("1: Found product cards:", productCards.length);
  const productIds = Array.from(productCards).map(card =>
    `gid://shopify/Product/${card.dataset.productId}`
  );

  /* ----------------------------------
     2️⃣ Fetch Stats (Bulk)
  ---------------------------------- */

  fetch(`${BASE}/api/v1/product-reviews/integration/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds })
  })
  .then(res => res.json())
  .then(data => {
    if (!data?.stats) return;
    console.log("2: Received stats:", data.stats);
    renderStats(data.stats);
  })
  .catch(err => {
    console.error('Review stats error:', err);
  });


  /* ----------------------------------
     3️⃣ Render Function
  ---------------------------------- */

  function renderStats(stats) {

    productCards.forEach(card => {

      const numericId = card.dataset.productId;
      const gid = `gid://shopify/Product/${numericId}`;

      const productStats = stats[gid];

      var container = card.querySelector('.card-stars-container');
      console.log(`containerfor Product ID ${numericId}:`, container);
      if (!container) return;
        console.log(`3: Rendering stats for Product ID ${numericId}:`, productStats); 
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
     4️⃣ Generate Stars HTML
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

})();
