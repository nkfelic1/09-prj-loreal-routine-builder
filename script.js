/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

// Cached product list and current selections
let allProducts = [];
let selectedProducts = [];

/* Load product data from JSON file (cached after first load) */
async function loadProducts() {
  if (allProducts.length) return allProducts;
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return allProducts;
}

/* Utility: find product by id from the cached list */
function getProductById(id) {
  return allProducts.find((p) => Number(p.id) === Number(id));
}

/* Render product cards and attach interaction handlers */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card" data-id="${product.id}" role="button" tabindex="0" aria-pressed="false">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `
    )
    .join("");

  // Attach click + keyboard handlers to each rendered card
  productsContainer.querySelectorAll(".product-card").forEach((card) => {
    const id = Number(card.dataset.id);

    // Reflect selection state
    if (selectedProducts.some((p) => p.id === id)) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    } else {
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
    }

    // Click to toggle selection
    card.addEventListener("click", () => toggleSelect(id));

    // Keyboard accessibility: Enter or Space toggles selection
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSelect(id);
      }
    });
  });
}

/* Toggle selection for a product id */
function toggleSelect(id) {
  const existingIndex = selectedProducts.findIndex((p) => p.id === id);

  if (existingIndex > -1) {
    // already selected -> remove
    selectedProducts.splice(existingIndex, 1);
  } else {
    // not selected -> add full product object (so we can show name/brand)
    const prod = getProductById(id);
    if (prod) selectedProducts.push(prod);
  }

  // Update product card visuals if rendered
  const card = productsContainer.querySelector(
    `.product-card[data-id='${id}']`
  );
  if (card) {
    if (selectedProducts.some((p) => p.id === id)) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    } else {
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
    }
  }

  renderSelectedProducts();
}

/* Render the Selected Products list (small chips) */
function renderSelectedProducts() {
  if (!selectedProducts.length) {
    selectedProductsList.innerHTML = `
      <div class="placeholder-message">No products selected</div>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (p) => `
      <div class="selected-chip" data-id="${p.id}">
        <span class="chip-label">${p.name}</span>
        <button class="remove-chip" aria-label="Remove ${p.name}">&times;</button>
      </div>
    `
    )
    .join("");

  // Attach remove handlers
  selectedProductsList.querySelectorAll(".remove-chip").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parent = btn.closest(".selected-chip");
      const id = Number(parent.dataset.id);
      toggleSelect(id);
    });
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});

// Initialize selected area placeholder
renderSelectedProducts();
