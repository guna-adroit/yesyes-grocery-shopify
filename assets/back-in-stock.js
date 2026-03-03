const BASE = window.location.origin + '/apps/reviews';
document.addEventListener("DOMContentLoaded", function () {

  const notifyLink = document.getElementById("notify-link");
  const modal = document.querySelector(".notify-modal");
  const submitBtn = document.getElementById("notify-submit");
  const cancelBtn = document.getElementById("notify-cancel");
  const messageBox = document.getElementById("notify-message");


  // Shopify dynamic values
    const dataEl = document.getElementById("notify-data");

    const customerId = dataEl?.dataset.customerId || null;
    const productId = dataEl?.dataset.productId || null;
    let currentVariantId = dataEl?.dataset.variantId || null;
    let email = dataEl?.dataset.email || null;

  let subscribed = false;
  let isProcessing = false;

  // Update variant when changed
  document.addEventListener("variant:change", function (event) {
    currentVariantId = event.detail.variant.id;
    subscribed = false;
  });

  function openModal() {
    modal.style.display = "block";
    modal.classList.add("active");
  }
  
  function closeModal() {
    modal.style.display = "none";
    modal.classList.remove("active");
  }

  function setLoading(state) {
    isProcessing = state;
    submitBtn.disabled = state;

    if (state) {
      submitBtn.dataset.originalText = submitBtn.innerText;
      submitBtn.innerText = "Please wait...";
    } else {
      updateUI(); // always re-sync with state
    }
  }
  
  async function checkStatus() {
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/api/v1/back-in-stock/integration/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${customerId}`,
          variantId: `gid://shopify/ProductVariant/${currentVariantId}`
        })
      });

      const data = await res.json();
      subscribed = data?.subscribed === true;
      updateUI();

    } catch (err) {
      console.error("Status API error:", err);
      messageBox.innerText = "Something went wrong. Please try again.";
    }

    setLoading(false);
  }

  async function subscribe() {
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/api/v1/back-in-stock/integration/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${customerId}`,
          variantId: `gid://shopify/ProductVariant/${currentVariantId}`,
          productId: `gid://shopify/Product/${productId}`,
          email: email
        })
      });

      const data = await res.json();

      if (data?.status === "subscribed") {
        subscribed = true;
        cancelBtn.innerText = "Close";
        updateUI();
      }

    } catch (err) {
      console.error("Subscribe API error:", err);
      messageBox.innerText = "Subscription failed. Try again.";
    }

    setLoading(false);

  }

  async function unsubscribe() {
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/api/v1/back-in-stock/integration/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${customerId}`,
          variantId: `gid://shopify/ProductVariant/${currentVariantId}`,
          productId: `gid://shopify/Product/${productId}`
        })
      });

      const data = await res.json();

      if (data?.status === "unsubscribed") {
        subscribed = false;
        updateUI();
      }

    } catch (err) {
      console.error("Unsubscribe API error:", err);
      messageBox.innerText = "Unsubscribe failed. Try again.";
    }

    setLoading(false);

  }

  // Click Handlers

  notifyLink.addEventListener("click", async function () {
    if (!customerId) {
      alert("Please login to subscribe.");
      return;
    }

    subscribed = false;
    cancelBtn.innerText = "Cancel";
    messageBox.innerText = "Checking subscription status...";
    submitBtn.innerText = "Checking...";
    submitBtn.disabled = true;

    openModal();
    await checkStatus();
});

  submitBtn.addEventListener("click", async function () {
    if (isProcessing) return;

    if (subscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }

  });

    function updateUI() {
      if (subscribed) {
        messageBox.innerText = "You are already subscribed. Do you want to unsubscribe?";
        submitBtn.innerText = "Unsubscribe";
        
      } else {
        messageBox.innerText = "You will receive an email when this product is back in stock.";
        submitBtn.innerText = "Subscribe";
        
      }
    }

  cancelBtn.addEventListener("click", function () {
    closeModal();
  });

});