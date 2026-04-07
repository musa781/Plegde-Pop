// extensions/campaign-widget/assets/comment-bubble.js

console.log("💬 Comment bubble loaded");

class CommentBubble {
  constructor() {
    // Smart URL helper - get the base URL for API calls
    this.apiBaseUrl = this.getApiBaseUrl();
    console.log('🔧 API Base URL:', this.apiBaseUrl);
    
    this.isOpen = false;
    this.productId = null;
    this.productHandle = null;
    this.currentPage = 1;
    this.comments = [];
    this.ratingData = { average: 0, count: 0 };
    this.init();
  }

  // 🎯 Smart URL detection method (Option 4)
  getApiBaseUrl() {
    // Priority 1: Use window.APP_CONFIG if available (from Liquid)
    if (window.APP_CONFIG?.apiBaseUrl) {
      console.log('📡 Using APP_CONFIG URL:', window.APP_CONFIG.apiBaseUrl);
      return window.APP_CONFIG.apiBaseUrl;
    }
    
    // Priority 2: Check if we're on Shopify store domain
    if (window.location.hostname.includes('myshopify.com')) {
      const storeUrl = `${window.location.origin}/apps/testing-app-1209`;
      console.log('📡 Using store apps URL:', storeUrl);
      return storeUrl;
    }
    
    // Priority 3: Fallback to current origin (ngrok/cloudflare/localhost)
    console.log('📡 Using current origin:', window.location.origin);
    return window.location.origin;
  }

  // Helper method to build full API URLs
  buildApiUrl(path) {
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.apiBaseUrl}${cleanPath}`;
  }

  async init() {
    // Get product ID from the page
    this.productId = this.getProductId();
    this.productHandle = this.getProductHandle();

    if (!this.productId) {
      console.log("Not a product page, comment bubble not loaded");
      return;
    }

    console.log("Product ID:", this.productId);

    // Fetch existing comments
    await this.fetchComments();

    // Create the bubble HTML
    this.createBubble();

    // Add event listeners
    this.addEventListeners();
  }

  getProductId() {
    // Try multiple methods to get product ID
    // Method 1: meta tag
    const metaTag = document.querySelector('meta[name="product-id"]');
    if (metaTag) return metaTag.getAttribute("content");

    // Method 2: data attribute on product form
    const productForm = document.querySelector('form[action*="/cart/add"]');
    if (productForm) {
      const productIdInput = productForm.querySelector('input[name="id"]');
      if (productIdInput) return productIdInput.value;
    }

    // Method 3: from URL
    const pathParts = window.location.pathname.split("/");
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && lastPart !== "products") {
      return lastPart; // This is the handle, not ID, but we'll use it
    }

    return null;
  }

  getProductHandle() {
    const pathParts = window.location.pathname.split("/");
    return pathParts[pathParts.length - 1];
  }

  async fetchComments(page = 1) {
    try {
      const url = this.buildApiUrl(`/api/comments/product/${this.productId}?page=${page}&limit=5`);
      console.log('📥 Fetching comments from:', url);
      
      const response = await fetch(url, {
        headers: {
          'ngrok-skip-browser-warning': 'any-value'
        }
      });
      
      const data = await response.json();

      if (data.success) {
        this.comments = data.data.comments;
        this.ratingData = data.data.rating;
        this.currentPage = data.data.pagination.page;
        this.totalPages = data.data.pagination.pages;
        console.log("Comments loaded:", this.comments.length);
        console.log("Rating:", this.ratingData);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }

  getStarHTML(rating, size = 16) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    let stars = "";

    // Full stars
    for (let i = 0; i < fullStars; i++) {
      stars += `<span class="star full" style="font-size: ${size}px;">★</span>`;
    }

    // Half star
    if (halfStar) {
      stars += `<span class="star half" style="font-size: ${size}px;">★</span>`;
    }

    // Empty stars
    for (let i = 0; i < emptyStars; i++) {
      stars += `<span class="star empty" style="font-size: ${size}px;">☆</span>`;
    }

    return stars;
  }

  renderComments() {
    if (this.comments.length === 0) {
      return '<div class="no-comments">No reviews yet. Be the first to review!</div>';
    }

    return this.comments
      .map(
        (comment) => `
      <div class="comment-item">
        <div class="comment-header">
          <span class="comment-author">${comment.customerName || "Anonymous"}</span>
          <span class="comment-date">${new Date(comment.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="comment-rating">${this.getStarHTML(comment.rating)}</div>
        ${comment.title ? `<div class="comment-title">${comment.title}</div>` : ""}
        <div class="comment-text">${comment.comment}</div>
        ${comment.isVerifiedPurchase ? '<span class="verified-badge">✓ Verified Purchase</span>' : ""}
      </div>
    `,
      )
      .join("");
  }

  createBubble() {
    // Create bubble container
    const bubbleHTML = `
      <div class="comment-bubble-container" id="comment-bubble">
        <!-- Floating Bubble -->
        <div class="comment-bubble-trigger">
          <div class="comment-bubble-icon">💬</div>
          <div class="comment-bubble-rating">
            <div class="comment-stars">${this.getStarHTML(this.ratingData.average)}</div>
            <div class="comment-count">${this.ratingData.count} review${this.ratingData.count !== 1 ? "s" : ""}</div>
          </div>
        </div>
        
        <!-- Expanded Panel (hidden by default) -->
        <div class="comment-panel" id="comment-panel" style="display: none;">
          <div class="comment-panel-header">
            <h3>Customer Reviews</h3>
            <button class="comment-panel-close">✕</button>
          </div>
          
          <!-- Rating Summary -->
          <div class="comment-rating-summary">
            <div class="rating-average">
              <span class="rating-number">${this.ratingData.average.toFixed(1)}</span>
              <span class="rating-out-of">/5</span>
            </div>
            <div class="rating-stars-large">${this.getStarHTML(this.ratingData.average, 24)}</div>
            <div class="rating-count">Based on ${this.ratingData.count} review${this.ratingData.count !== 1 ? "s" : ""}</div>
          </div>
          
          <!-- Comment Form -->
          <div class="comment-form-section">
            <h4>Leave a Review</h4>
            <form id="comment-form">
              <div class="form-row">
                <label>Your Rating <span style="color: red;">*</span></label>
                <div class="star-rating">
                  <input type="radio" name="rating" value="5" id="star5" required><label for="star5">★</label>
                  <input type="radio" name="rating" value="4" id="star4"><label for="star4">★</label>
                  <input type="radio" name="rating" value="3" id="star3"><label for="star3">★</label>
                  <input type="radio" name="rating" value="2" id="star2"><label for="star2">★</label>
                  <input type="radio" name="rating" value="1" id="star1"><label for="star1">★</label>
                </div>
              </div>
              
              <div class="form-row">
                <label for="comment-title">Review Title (optional)</label>
                <input type="text" id="comment-title" placeholder="Great product!">
              </div>
              
              <div class="form-row">
                <label for="comment-text">Your Review <span style="color: red;">*</span></label>
                <textarea id="comment-text" rows="3" placeholder="Share your experience..." required></textarea>
              </div>
              
              <div class="form-row">
                <label for="comment-name">Your Name</label>
                <input type="text" id="comment-name" placeholder="Anonymous">
              </div>
              
              <div class="form-row">
                <label for="comment-email">Email (optional, for verification)</label>
                <input type="email" id="comment-email" placeholder="your@email.com">
              </div>
              
              <button type="submit" class="comment-submit-btn">Submit Review</button>
            </form>
          </div>
          
          <!-- Comments List -->
          <div class="comments-list" id="comments-list">
            ${this.renderComments()}
          </div>
          
          <!-- Load More -->
          ${this.currentPage < this.totalPages
            ? `
            <button class="load-more-btn" id="load-more-comments">Load More Reviews</button>
          `
            : ""
          }
        </div>
      </div>
    `;

    // Add to page
    document.body.insertAdjacentHTML("beforeend", bubbleHTML);
  }

  addEventListeners() {
    const trigger = document.querySelector(".comment-bubble-trigger");
    const panel = document.getElementById("comment-panel");
    const closeBtn = document.querySelector(".comment-panel-close");
    const form = document.getElementById("comment-form");
    const loadMore = document.getElementById("load-more-comments");

    if (!trigger || !panel) return;

    // Open panel
    trigger.addEventListener("click", () => {
      this.isOpen = !this.isOpen;
      panel.style.display = this.isOpen ? "block" : "none";
      if (this.isOpen) {
        trigger.classList.add("active");
      } else {
        trigger.classList.remove("active");
      }
    });

    // Close panel
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.isOpen = false;
        panel.style.display = "none";
        trigger.classList.remove("active");
      });
    }

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (
        this.isOpen &&
        !panel.contains(e.target) &&
        !trigger.contains(e.target)
      ) {
        this.isOpen = false;
        panel.style.display = "none";
        trigger.classList.remove("active");
      }
    });

    // Submit form
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log("Form submission intercepted, preventing default");

        const rating = form.querySelector('input[name="rating"]:checked')?.value;
        const title = document.getElementById("comment-title")?.value || "";
        const comment = document.getElementById("comment-text")?.value;
        const name = document.getElementById("comment-name")?.value || "Anonymous";
        const email = document.getElementById("comment-email")?.value || "";

        if (!rating) {
          alert("Please select a rating");
          return;
        }

        if (!comment || comment.trim() === "") {
          alert("Please enter a comment");
          return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Submitting...";
        submitBtn.disabled = true;

        try {
          // Use the smart URL builder
          const url = this.buildApiUrl('/api/comments/post');
          console.log("📤 Sending to API:", url);
          console.log("Payload:", {
            productId: this.productId,
            rating,
            title,
            comment,
          });

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "any-value",
            },
            body: JSON.stringify({
              productId: this.productId,
              rating: parseInt(rating),
              title: title,
              comment: comment,
              customerName: name,
              customerEmail: email,
            }),
          });

          console.log("Response status:", response.status);

          const text = await response.text();
          console.log("Response text:", text);

          // Try to parse JSON
          try {
            const data = JSON.parse(text);
            if (data.success) {
              alert(
                "Thank you for your review! It will appear after moderation.",
              );
              form.reset();
              // Reset star ratings
              document.querySelectorAll('.star-rating input').forEach(input => {
                input.checked = false;
              });
            } else {
              alert("Error: " + (data.error || "Unknown error"));
            }
          } catch (e) {
            console.error(
              "Failed to parse JSON. Response was HTML:",
              text.substring(0, 100),
            );
            alert("Server error. Please try again.");
          }
        } catch (error) {
          console.error("Submit error:", error);
          alert("Network error. Please check your connection.");
        } finally {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }
      });
    }

    // Load more
    if (loadMore) {
      loadMore.addEventListener("click", async () => {
        this.currentPage++;
        await this.fetchComments(this.currentPage);
        document.getElementById("comments-list").innerHTML =
          this.renderComments();

        if (this.currentPage >= this.totalPages) {
          loadMore.style.display = "none";
        }
      });
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    // Small delay to ensure everything is loaded
    setTimeout(() => {
      new CommentBubble();
    }, 500);
  });
} else {
  setTimeout(() => {
    new CommentBubble();
  }, 500);
}