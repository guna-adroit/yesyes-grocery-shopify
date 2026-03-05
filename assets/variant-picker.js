import { Component } from '@theme/component';
import { VariantSelectedEvent, VariantUpdateEvent } from '@theme/events';
import { morph } from '@theme/morph';
import { requestYieldCallback } from '@theme/utilities';

/**
 * @typedef {object} VariantPickerRefs
 * @property {HTMLFieldSetElement[]} fieldsets – The fieldset elements.
 */

/**
 * A custom element that manages a variant picker.
 *
 * @template {import('@theme/component').Refs} [TRefs=VariantPickerRefs]
 * @extends Component<TRefs>
 */
export default class VariantPicker extends Component {
  /** @type {string | undefined} */
  #pendingRequestUrl;

  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {number[][]} */
  #checkedIndices = [];

  /** @type {HTMLInputElement[][]} */
  #radios = [];

  connectedCallback() {
    super.connectedCallback();
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    fieldsets.forEach((fieldset) => {
      const radios = Array.from(fieldset?.querySelectorAll('input') ?? []);
      this.#radios.push(radios);

      const initialCheckedIndex = radios.findIndex((radio) => radio.dataset.currentChecked === 'true');
      if (initialCheckedIndex !== -1) {
        this.#checkedIndices.push([initialCheckedIndex]);
      }
    });

    this.addEventListener('change', this.variantChanged.bind(this));
  }

  /**
   * Handles the variant change event.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;
    
    const selectedOption =
    event.target instanceof HTMLSelectElement ? event.target.options[event.target.selectedIndex] : event.target;
    const variantAvailable = selectedOption.dataset.optionAvailable;
    var dataVariantId = selectedOption.dataset.variantId;
    
    if (!selectedOption) return;

    this.updateSelectedOption(event.target);
    this.dispatchEvent(new VariantSelectedEvent({ id: selectedOption.dataset.optionValueId ?? '' }));

    const isOnProductPage =
      this.dataset.templateProductMatch === 'true' &&
      !event.target.closest('product-card') &&
      !event.target.closest('quick-add-dialog');

    // Morph the entire main content for combined listings child products, because changing the product
    // might also change other sections depending on recommendations, metafields, etc.
    const currentUrl = this.dataset.productUrl?.split('?')[0];
    const newUrl = selectedOption.dataset.connectedProductUrl;
    const loadsNewProduct = isOnProductPage && !!newUrl && newUrl !== currentUrl;

    this.fetchUpdatedSection(this.buildRequestUrl(selectedOption), loadsNewProduct);

    const url = new URL(window.location.href);

    const variantId = selectedOption.dataset.variantId || null;

    if (isOnProductPage) {
      if (variantId) {
        url.searchParams.set('variant', variantId);
      } else {
        url.searchParams.delete('variant');
      }
    }

    // Change the path if the option is connected to another product via combined listing.
    if (loadsNewProduct) {
      url.pathname = newUrl;
    }

    if (url.href !== window.location.href) {
      requestYieldCallback(() => {
        history.replaceState({}, '', url.toString());
      });
    }
    handleBackInStockVariantChange(variantAvailable, dataVariantId);
  }

  /**
   * Updates the selected option.
   * @param {string | Element} target - The target element.
   */
  updateSelectedOption(target) {
    if (typeof target === 'string') {
      const targetElement = this.querySelector(`[data-option-value-id="${target}"]`);

      if (!targetElement) throw new Error('Target element not found');

      target = targetElement;
    }

    if (target instanceof HTMLInputElement) {
      const fieldsetIndex = Number.parseInt(target.dataset.fieldsetIndex || '');
      const inputIndex = Number.parseInt(target.dataset.inputIndex || '');

      if (!Number.isNaN(fieldsetIndex) && !Number.isNaN(inputIndex)) {
        const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
        const fieldset = fieldsets[fieldsetIndex];
        const checkedIndices = this.#checkedIndices[fieldsetIndex];
        const radios = this.#radios[fieldsetIndex];

        if (radios && checkedIndices && fieldset) {
          // Clear previous checked states
          const [currentIndex, previousIndex] = checkedIndices;

          if (currentIndex !== undefined && radios[currentIndex]) {
            radios[currentIndex].dataset.previousChecked = 'false';
          }
          if (previousIndex !== undefined && radios[previousIndex]) {
            radios[previousIndex].dataset.previousChecked = 'false';
          }

          // Update checked indices array - keep only the last 2 selections
          checkedIndices.unshift(inputIndex);
          checkedIndices.length = Math.min(checkedIndices.length, 2);

          // Update the new states
          const newCurrentIndex = checkedIndices[0]; // This is always inputIndex
          const newPreviousIndex = checkedIndices[1]; // This might be undefined

          // newCurrentIndex is guaranteed to exist since we just added it
          if (newCurrentIndex !== undefined && radios[newCurrentIndex]) {
            radios[newCurrentIndex].dataset.currentChecked = 'true';
            fieldset.style.setProperty(
              '--pill-width-current',
              `${radios[newCurrentIndex].parentElement?.offsetWidth || 0}px`
            );
          }

          if (newPreviousIndex !== undefined && radios[newPreviousIndex]) {
            radios[newPreviousIndex].dataset.previousChecked = 'true';
            radios[newPreviousIndex].dataset.currentChecked = 'false';
            fieldset.style.setProperty(
              '--pill-width-previous',
              `${radios[newPreviousIndex].parentElement?.offsetWidth || 0}px`
            );
          }
        }
      }
      target.checked = true;
    }

    if (target instanceof HTMLSelectElement) {
      const newValue = target.value;
      const newSelectedOption = Array.from(target.options).find((option) => option.value === newValue);

      if (!newSelectedOption) throw new Error('Option not found');

      for (const option of target.options) {
        option.removeAttribute('selected');
      }

      newSelectedOption.setAttribute('selected', 'selected');
    }
  }

  /**
   * Builds the request URL.
   * @param {HTMLElement} selectedOption - The selected option.
   * @param {string | null} [source] - The source.
   * @param {string[]} [sourceSelectedOptionsValues] - The source selected options values.
   * @returns {string} The request URL.
   */
  buildRequestUrl(selectedOption, source = null, sourceSelectedOptionsValues = []) {
    // this productUrl and pendingRequestUrl will be useful for the support of combined listing. It is used when a user changes variant quickly and those products are using separate URLs (combined listing).
    // We create a new URL and abort the previous fetch request if it's still pending.
    let productUrl = selectedOption.dataset.connectedProductUrl || this.#pendingRequestUrl || this.dataset.productUrl;
    this.#pendingRequestUrl = productUrl;
    const params = [];

    if (this.selectedOptionsValues.length && !source) {
      params.push(`option_values=${this.selectedOptionsValues.join(',')}`);
    } else if (source === 'product-card') {
      if (this.selectedOptionsValues.length) {
        params.push(`option_values=${sourceSelectedOptionsValues.join(',')}`);
      } else {
        params.push(`option_values=${selectedOption.dataset.optionValueId}`);
      }
    }

    // If variant-picker is a child of quick-add-component or swatches-variant-picker-component, we need to append section_id=section-rendering-product-card to the URL
    if (this.closest('quick-add-component') || this.closest('swatches-variant-picker-component')) {
      if (productUrl?.includes('?')) {
        productUrl = productUrl.split('?')[0];
      }
      return `${productUrl}?section_id=section-rendering-product-card&${params.join('&')}`;
    }
    return `${productUrl}?${params.join('&')}`;
  }

  /**
   * Fetches the updated section.
   * @param {string} requestUrl - The request URL.
   * @param {boolean} shouldMorphMain - If the entire main content should be morphed. By default, only the variant picker is morphed.
   */
  fetchUpdatedSection(requestUrl, shouldMorphMain = false) {
    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    fetch(requestUrl, { signal: this.#abortController.signal })
      .then((response) => response.text())
      .then((responseText) => {
        this.#pendingRequestUrl = undefined;
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        // Defer is only useful for the initial rendering of the page. Remove it here.
        html.querySelector('overflow-list[defer]')?.removeAttribute('defer');

        const textContent = html.querySelector(`variant-picker script[type="application/json"]`)?.textContent;
        if (!textContent) return;

        if (shouldMorphMain) {
          this.updateMain(html);
        } else {
          const newProduct = this.updateVariantPicker(html);

          // We grab the variant object from the response and dispatch an event with it.
          if (this.selectedOptionId) {
            this.dispatchEvent(
              new VariantUpdateEvent(JSON.parse(textContent), this.selectedOptionId, {
                html,
                productId: this.dataset.productId ?? '',
                newProduct,
              })
            );
          }
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.warn('Fetch aborted by user');
        } else {
          console.error(error);
        }
      });
  }

  /**
   * @typedef {Object} NewProduct
   * @property {string} id
   * @property {string} url
   */

  /**
   * Re-renders the variant picker.
   * @param {Document} newHtml - The new HTML.
   * @returns {NewProduct | undefined} Information about the new product if it has changed, otherwise undefined.
   */
  updateVariantPicker(newHtml) {
    /** @type {NewProduct | undefined} */
    let newProduct;

    const newVariantPickerSource = newHtml.querySelector(this.tagName.toLowerCase());

    if (!newVariantPickerSource) {
      throw new Error('No new variant picker source found');
    }

    // For combined listings, the product might have changed, so update the related data attribute.
    if (newVariantPickerSource instanceof HTMLElement) {
      const newProductId = newVariantPickerSource.dataset.productId;
      const newProductUrl = newVariantPickerSource.dataset.productUrl;

      if (newProductId && newProductUrl && this.dataset.productId !== newProductId) {
        newProduct = { id: newProductId, url: newProductUrl };
      }

      this.dataset.productId = newProductId;
      this.dataset.productUrl = newProductUrl;
    }

    morph(this, newVariantPickerSource);

    return newProduct;
  }

  /**
   * Re-renders the entire main content.
   * @param {Document} newHtml - The new HTML.
   */
  updateMain(newHtml) {
    const main = document.querySelector('main');
    const newMain = newHtml.querySelector('main');

    if (!main || !newMain) {
      throw new Error('No new main source found');
    }

    morph(main, newMain);
  }

  /**
   * Gets the selected option.
   * @returns {HTMLInputElement | HTMLOptionElement | undefined} The selected option.
   */
  get selectedOption() {
    const selectedOption = this.querySelector('select option[selected], fieldset input:checked');

    if (!(selectedOption instanceof HTMLInputElement || selectedOption instanceof HTMLOptionElement)) {
      return undefined;
    }

    return selectedOption;
  }

  /**
   * Gets the selected option ID.
   * @returns {string | undefined} The selected option ID.
   */
  get selectedOptionId() {
    const { selectedOption } = this;
    if (!selectedOption) return undefined;
    const { optionValueId } = selectedOption.dataset;

    if (!optionValueId) {
      throw new Error('No option value ID found');
    }

    return optionValueId;
  }

  /**
   * Gets the selected options values.
   * @returns {string[]} The selected options values.
   */
  get selectedOptionsValues() {
    /** @type HTMLElement[] */
    const selectedOptions = Array.from(this.querySelectorAll('select option[selected], fieldset input:checked'));

    return selectedOptions.map((option) => {
      const { optionValueId } = option.dataset;

      if (!optionValueId) throw new Error('No option value ID found');

      return optionValueId;
    });
  }
}

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
}

const BASE = window.location.origin + '/apps/reviews';

document.addEventListener("DOMContentLoaded", function () {

  const notifyLink = document.getElementById("notify-link");
  const modal = document.querySelector(".notify-modal");
  const modalBg = document.querySelector(".modal-bg");
  const submitBtn = document.getElementById("notify-submit");
  const cancelBtn = document.getElementById("notify-cancel");
  const messageBox = document.getElementById("notify-message");
  const responseMsg = document.getElementById("response-msg");
  const resultResponse = document.getElementById("result-response");

  let subscribed = false;
  let isProcessing = false;

  function getNotifyData() {
    const dataEl = document.getElementById("notify-data");

    return {
      customerId: dataEl?.dataset.customerId || null,
      productId: dataEl?.dataset.productId || null,
      variantId: dataEl?.dataset.variantId || null,
      email: dataEl?.dataset.email || null
    };
  }

  function openModal() {
    document.body.style.overflow = "hidden";
    modal.style.display = "block";
    modal.classList.add("active");
    modalBg.classList.add("active");
  }

  function closeModal() {
    document.body.style.overflow = "";
    modal.style.display = "none";
    modal.classList.remove("active");
    modalBg.classList.remove("active");
  }

  modal.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  function setLoading(state) {
    isProcessing = state;
    submitBtn.disabled = state;

    if (state) {
      submitBtn.dataset.originalText = submitBtn.innerText;
      submitBtn.innerText = "Please wait...";
    }
  }

  async function checkStatus() {

    notifyLink.innerText = "Loading...";

    const notifyData = getNotifyData();
    if (!notifyData.customerId) return;

    setLoading(true);

    try {

      const res = await fetch(`${BASE}/api/v1/back-in-stock/integration/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${notifyData.customerId}`,
          variantId: `gid://shopify/ProductVariant/${notifyData.variantId}`
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

    const notifyData = getNotifyData();
    setLoading(true);

    try {

      const res = await fetch(`${BASE}/api/v1/back-in-stock/integration/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${notifyData.customerId}`,
          variantId: `gid://shopify/ProductVariant/${notifyData.variantId}`,
          productId: `gid://shopify/Product/${notifyData.productId}`,
          email: notifyData.email
        })
      });

      const data = await res.json();

      if (data?.status === "subscribed") {

        subscribed = true;
        cancelBtn.innerText = "Close";
        updateUI();

        responseMsg.innerText = "We will notify you when this item is back in stock.";
        resultResponse.classList.add("active");

        clearTimeout(window.unsubscribeTimeout);

        window.unsubscribeTimeout = setTimeout(() => {
          resultResponse.classList.remove("active");
          responseMsg.innerText = "";
          closeModal();
        }, 3000);
      }

    } catch (err) {
      console.error("Subscribe API error:", err);
      messageBox.innerText = "Subscription failed. Try again.";
    }

    setLoading(false);
  }

  async function unsubscribe() {

    const notifyData = getNotifyData();
    setLoading(true);

    try {

      const res = await fetch(`${BASE}/api/v1/back-in-stock/integration/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${notifyData.customerId}`,
          variantId: `gid://shopify/ProductVariant/${notifyData.variantId}`,
          productId: `gid://shopify/Product/${notifyData.productId}`
        })
      });

      const data = await res.json();

      if (data?.status === "unsubscribed") {

        subscribed = false;
        updateUI();

        responseMsg.innerText = "You've unsubscribed.";
        resultResponse.classList.add("active");

        clearTimeout(window.unsubscribeTimeout);

        window.unsubscribeTimeout = setTimeout(() => {
          resultResponse.classList.remove("active");
          responseMsg.innerText = "";
          closeModal();
        }, 3000);
      }

    } catch (err) {
      console.error("Unsubscribe API error:", err);
      messageBox.innerText = "Unsubscribe failed. Try again.";
    }

    setLoading(false);
  }

  function updateUI() {
    if (!notifyLink) return;

    if (subscribed) {

      messageBox.innerText = "You are already subscribed. Do you want to unsubscribe?";
      submitBtn.innerText = "Unsubscribe";

      notifyLink.classList.add("unsub");
      notifyLink.innerText = "Unsubscribe";

    } else {

      messageBox.innerText = "You will receive an email when this product is back in stock.";
      submitBtn.innerText = "Subscribe";

      notifyLink.classList.remove("unsub");
      notifyLink.innerText = "Notify Me";
    }
  }

  notifyLink.addEventListener("click", async function () {

    const notifyData = getNotifyData();

    if (!notifyData.customerId) {
      alert("Please login to subscribe.");
      return;
    }

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

  cancelBtn.addEventListener("click", closeModal);
  modalBg.addEventListener("click", closeModal);

  window.handleBackInStockVariantChange = async function (variantAvailable, dataVariantId) {

    const notifyLink = document.getElementById("notify-link");
    const dataEl = document.getElementById("notify-data");

    if (!notifyLink || !dataEl) return;

    // update dataset
    dataEl.dataset.variantId = dataVariantId;

    // show/hide notify button
    if (variantAvailable === "true") {
      notifyLink.style.display = "none";
      return;
    } else {
      notifyLink.style.display = "inline-block";
    }

    // check subscription for this variant
    await checkStatus();
  };
  const notifyData = getNotifyData();
    if (notifyData.customerId && notifyData.variantId) {
      checkStatus();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
});