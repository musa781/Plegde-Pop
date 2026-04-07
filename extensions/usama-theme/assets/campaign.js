// extensions/campaign-widget/assets/campaign.js
// Add this at the VERY TOP to monitor all fetches
console.log("🔍 Monitoring all fetch requests");

const originalFetch = window.fetch;
window.fetch = function (url, options) {
  console.log("🌐 FETCH INTERCEPTED:", {
    url: url,
    method: options?.method || "GET",
    body: options?.body,
    headers: options?.headers,
  });

  // Don't modify the request, just log it
  return originalFetch.apply(this, arguments);
};

// Monitor all form submissions
document.addEventListener(
  "submit",
  function (e) {
    console.log("⚠️ FORM SUBMISSION:", {
      action: e.target.action,
      method: e.target.method,
      html: e.target.outerHTML,
    });
    e.preventDefault();
  },
  true,
);

document.addEventListener("DOMContentLoaded", function () {
  console.log("✅ PledgePop JS loaded");

  // Find all pledge buttons
  document.querySelectorAll(".pledgepop-cta-pledge").forEach((button) => {
    console.log("Found pledge button:", button);
    console.log("Found pledge button with type:", button.type);
    console.log("Button HTML:", button.outerHTML);

    button.addEventListener("click", function (e) {
      // 🔴 CRITICAL: Prevent multiple event handlers
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      console.log("🔴 Button clicked");
      console.log("All datasets:", this.dataset);
      console.log("Campaign ID from dataset:", this.dataset.campaignId);

      // Check all possible sources of campaign ID
      console.log("dataset.campaignId:", this.dataset.campaignId);
      console.log('dataset["campaignId"]:', this.dataset["campaignId"]);
      console.log(
        'getAttribute("data-campaign-id"):',
        this.getAttribute("data-campaign-id"),
      );

      // If campaign ID is invalid, try to get it from somewhere else
      let campaignId =
        this.dataset.campaignId || this.getAttribute("data-campaign-id");

      if (!campaignId || campaignId === "" || campaignId === "unknown") {
        console.error("❌ No valid campaign ID found!");
        console.log("Button HTML:", this.outerHTML);
        alert(
          "Error: Campaign ID is missing. Please check the debug info in the console.",
        );
        return;
      }

      console.log("✅ Using campaign ID:", campaignId);

      // Get button dataset
      console.log("Button dataset:", this.dataset);
      console.log("Campaign ID being sent:", this.dataset.campaignId);
      console.log("Properties being added:", {
        _campaign_id: this.dataset.campaignId,
        _pledge_amount: this.dataset.pledge,
        _is_main_product: "true",
      });

      // Get campaign data from data attributes
      const campaignData = {
        productId: this.dataset.productId || "",
        variantId: this.dataset.variantId || "",
        pledgeAmount: parseFloat(this.dataset.pledge) || 2,
        productTitle: this.dataset.productTitle || "Product",
        productImage: this.dataset.productImage || "",
        campaignId: campaignId || "unknown",

        addons: [],
      };
      console.log("✅ Campaign data:", campaignData);

      // Try to parse addons if they exist
      try {
        if (this.dataset.addons && this.dataset.addons !== "") {
          campaignData.addons = JSON.parse(this.dataset.addons);
          console.log("Addons loaded:", campaignData.addons);
        }
      } catch (e) {
        console.error("Error parsing addons:", e);
      }

      console.log("Campaign data:", campaignData);

      // 🔴 NEW: Check for selling plan selector
      const sellingPlanSelect = document.querySelector(".pledge-selling-plan");
      if (sellingPlanSelect) {
        campaignData.selectedSellingPlan = sellingPlanSelect.value;
        console.log(
          "Selling plan from selector:",
          campaignData.selectedSellingPlan,
        );
      }

      // Check if we have required data
      if (!campaignData.variantId) {
        alert("Error: Product variant not found");
        return;
      }

      // Open modal
      openPledgeModal(campaignData);
    });
  });
});

// =============================================
// Modal Functions
// =============================================

// Detect any form submissions
document.addEventListener("submit", function (e) {
  console.log("⚠️ Form submission detected:", e.target);
  e.preventDefault(); // Stop any form submissions
});

function openPledgeModal(data) {
  console.log("Opening modal with data:", data);

  // Remove any existing modal
  const existingModal = document.querySelector(".pledgepop-modal-overlay");
  if (existingModal) existingModal.remove();

  // Create modal element
  const modal = document.createElement("div");
  modal.className = "pledgepop-modal-overlay";
  modal.setAttribute("data-campaign-id", data.campaignId);

  // Generate addons HTML if they exist
  const addonsHTML =
    data.addons && data.addons.length > 0
      ? data.addons
          .map(
            (addon, index) => `
        <label class="pledgepop-addon-item">
          <input type="checkbox" 
                 class="pledgepop-addon-checkbox" 
                 data-index="${index}"
                 data-name="${addon.name || "Addon"}"
                 data-price="${addon.price || 0}">
          <div class="pledgepop-addon-content">
            <span class="pledgepop-addon-name">${addon.name || "Addon"}</span>
            <span class="pledgepop-addon-price">+$${(addon.price || 0).toFixed(2)}</span>
            ${addon.description ? `<span class="pledgepop-addon-description">${addon.description}</span>` : ""}
          </div>
        </label>
      `,
          )
          .join("")
      : '<p class="pledgepop-no-addons">No addons available</p>';

  modal.innerHTML = `
    <div class="pledgepop-modal">
      <button class="pledgepop-modal-close">✕</button>
      
      <h2 class="pledgepop-modal-title">Complete Your Pledge</h2>
      
      <!-- Main Product -->
      <div class="pledgepop-main-product">
        ${data.productImage ? `<img src="${data.productImage}" alt="${data.productTitle}" width="60" height="60">` : ""}
        <div class="pledgepop-main-product-details">
          <div class="pledgepop-main-product-title">${data.productTitle}</div>
          <div class="pledgepop-main-product-price">Pledge: $${data.pledgeAmount.toFixed(2)}</div>
        </div>
      </div>
      
      <!-- Addons Section -->
      <div class="pledgepop-addons-section">
        <h3 class="pledgepop-addons-title">Enhance Your Pledge</h3>
        <div class="pledgepop-addons-grid" id="addons-grid">
          ${addonsHTML}
        </div>
      </div>
      
      <!-- Order Summary -->
      <div class="pledgepop-summary">
        <h3 class="pledgepop-summary-title">Order Summary</h3>
        
        <div class="pledgepop-summary-row">
          <span>Pledge Amount:</span>
          <span>$${data.pledgeAmount.toFixed(2)}</span>
        </div>
        
        <div class="pledgepop-summary-row" id="addons-total-row" style="display: none;">
          <span>Addons:</span>
          <span id="addons-total">$0.00</span>
        </div>
        
        <div class="pledgepop-summary-total">
          <span>Total:</span>
          <span id="total-amount">$${data.pledgeAmount.toFixed(2)}</span>
        </div>
      </div>
      
      <!-- Checkout Button -->
      <button class="pledgepop-checkout-btn" id="checkout-btn">
        Proceed to Checkout
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  console.log("Modal added to DOM");

  // Add close button functionality
  const closeBtn = modal.querySelector(".pledgepop-modal-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      modal.remove();
    });
  }

  // Close modal when clicking overlay
  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Add change event to all checkboxes
  const checkboxes = modal.querySelectorAll(".pledgepop-addon-checkbox");
  console.log("Found", checkboxes.length, "addon checkboxes");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", function () {
      updateTotal(modal, data.pledgeAmount);
    });
  });

  // Add checkout button functionality
  const checkoutBtn = modal.querySelector("#checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log("Checkout button clicked");
      checkoutWithAddons(modal, data);
    });
  }
}

function updateTotal(modal, basePledge) {
  const checkboxes = modal.querySelectorAll(
    ".pledgepop-addon-checkbox:checked",
  );
  const addonsTotalRow = modal.querySelector("#addons-total-row");
  const addonsTotalSpan = modal.querySelector("#addons-total");
  const totalSpan = modal.querySelector("#total-amount");

  let addonsTotal = 0;

  checkboxes.forEach((checkbox) => {
    const price = parseFloat(checkbox.dataset.price) || 0;
    addonsTotal += price;
  });

  if (addonsTotal > 0) {
    addonsTotalRow.style.display = "flex";
    addonsTotalSpan.textContent = `$${addonsTotal.toFixed(2)}`;
  } else {
    addonsTotalRow.style.display = "none";
  }

  const grandTotal = basePledge + addonsTotal;
  totalSpan.textContent = `$${grandTotal.toFixed(2)}`;
}

// =============================================
// UPDATED: Checkout with Selling Plan Support
// =============================================
function checkoutWithAddons(modal, data) {
  console.log(
    "%c🚀 CHECKOUT STARTED",
    "background: #059669; color: white; font-size: 14px; padding: 4px;",
  );



  // Get selected selling plan
  const sellingPlanSelect = document.querySelector(".pledge-selling-plan");
  const selectedPlanId = sellingPlanSelect ? sellingPlanSelect.value : null;

  console.log(
    "%c🔴 SELLING PLAN CHECK",
    "background: #ff0000; color: white; font-size: 12px; padding: 2px;",
  );
  console.log("  - Selector found:", sellingPlanSelect ? "✅ YES" : "❌ NO");
  console.log("  - Selected value:", selectedPlanId || "No plan selected");


  // Prepare main item
  const mainItem = {
    id: data.variantId,
    quantity: 1,
    properties: {
      _campaign_id: data.campaignId,
      _pledge_amount: data.pledgeAmount.toString(),
      _is_main_product: "true",
      _campaign_title: data.productTitle,
    },
  };

  // ✅ Add selling plan at TOP LEVEL, not in properties
  if (selectedPlanId) {
    mainItem.selling_plan_id = selectedPlanId;
    console.log(
      "%c✅ SELLING PLAN ATTACHED at top level:",
      "color: green; font-weight: bold;",
      selectedPlanId,
    );
  }

  const items = [mainItem];
  console.log("📦 Final cart items:", JSON.stringify(items, null, 2));

  const storeDomain = window.location.origin;
  const cartUrl = storeDomain + "/cart/add.js";

  // Show loading
  const btn = modal.querySelector("#checkout-btn");
  const originalText = btn.textContent;
  btn.textContent = "Processing...";
  btn.disabled = true;

  const requestBody = JSON.stringify({ items }); // items should be an array
  console.log("Request body being sent:", requestBody);
  console.log('📦 Order items being sent:', JSON.stringify(items, null, 2));


  fetch(cartUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: requestBody,
  })
    .then((res) => {
      console.log("📡 Cart response status:", res.status);
      if (res.ok) return res.json();
      return res.text().then((text) => {
        throw new Error(text);
      });
    })
    .then((cartData) => {
      console.log(
        "%c✅ CART UPDATED:",
        "color: green; font-size: 14px;",
        cartData,
      );

      // Show appropriate message
      if (selectedPlanId) {
        alert("✅ Subscription added! Redirecting to checkout...");
      }

      window.location.href = storeDomain + "/checkout";
    })
    .catch((err) => {
      console.error(
        "%c❌ CHECKOUT ERROR:",
        "color: red; font-size: 14px;",
        err,
      );
      btn.textContent = originalText;
      btn.disabled = false;
      alert("Error adding to cart: " + err.message);
    });
}
