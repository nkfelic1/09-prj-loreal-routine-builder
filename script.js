/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const userInput = document.getElementById("userInput");
const clearSelectionsBtn = document.getElementById("clearSelectionsBtn");
const productSearch = document.getElementById("productSearch");
// Panel elements
const productPanel = document.getElementById("productPanel");
const panelImage = document.getElementById("panelImage");
const panelTitle = document.getElementById("panelTitle");
const panelBrand = document.getElementById("panelBrand");
const panelDescription = document.getElementById("panelDescription");
const panelSelectBtn = document.getElementById("panelSelectBtn");
const closePanelBtn = document.getElementById("closePanel");

let panelOpenForId = null;
let lastFocusedElement = null;

function openPanelFor(product) {
  if (!product) return;
  panelOpenForId = Number(product.id);
  lastFocusedElement = document.activeElement;

  panelImage.src = product.image || "";
  panelImage.alt = product.name || "";
  panelTitle.textContent = product.name || "";
  panelBrand.textContent = product.brand || "";
  panelDescription.textContent = product.description || "";

  // Update select button text based on current selection
  const isSelected = selectedProducts.some((p) => p.id === panelOpenForId);
  panelSelectBtn.textContent = isSelected
    ? "Remove from Selected"
    : "Add to Selected";

  productPanel.setAttribute("aria-hidden", "false");

  // focus management
  closePanelBtn.focus();

  // key listener for Escape
  document.addEventListener("keydown", panelKeyHandler);
}

function closePanel() {
  productPanel.setAttribute("aria-hidden", "true");
  panelOpenForId = null;
  document.removeEventListener("keydown", panelKeyHandler);
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function panelKeyHandler(e) {
  if (e.key === "Escape") closePanel();
}

// Click on backdrop should close
productPanel.addEventListener("click", (e) => {
  const closeAttr =
    e.target.getAttribute && e.target.getAttribute("data-close");
  if (closeAttr) closePanel();
});

closePanelBtn.addEventListener("click", closePanel);

panelSelectBtn.addEventListener("click", () => {
  if (!panelOpenForId) return;
  toggleSelect(panelOpenForId);
  // update button text
  const nowSelected = selectedProducts.some((p) => p.id === panelOpenForId);
  panelSelectBtn.textContent = nowSelected
    ? "Remove from Selected"
    : "Add to Selected";
});

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
  if (!allProducts || !allProducts.length) return null;
  return allProducts.find((p) => Number(p.id) === Number(id)) || null;
}

function markdownToHtml(text) {
  // bold **text**
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // italic *text*
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // convert line breaks to <br>
  text = text.replace(/\n/g, "<br>");
  return text;
}

function renderContent(raw) {
  const escaped = escapeHtml(raw);
  const withLinks = linkify(escaped);
  const withMd = markdownToHtml(withLinks);
  return withMd;
}

/* Debounce helper to limit how often filtering runs while typing */
function debounce(fn, wait = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

/* Apply both category and search filters and render the grid */
async function applyFilters() {
  const products = await loadProducts();
  const selectedCategory = categoryFilter.value || "";
  const query =
    (productSearch && productSearch.value.trim().toLowerCase()) || "";

  let filtered = products;
  if (selectedCategory) {
    filtered = filtered.filter(
      (product) => product.category === selectedCategory
    );
  }

  if (query) {
    filtered = filtered.filter((p) => {
      const hay = (
        (p.name || "") +
        " " +
        (p.brand || "") +
        " " +
        (p.description || "")
      ).toLowerCase();
      return hay.indexOf(query) !== -1;
    });
  }

  displayProducts(filtered);
}

// Wire events: category change and search input (debounced)
categoryFilter.addEventListener("change", applyFilters);
if (productSearch) {
  productSearch.addEventListener("input", debounce(applyFilters, 180));
}

// Helper to append messages to the chat window
function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "ai") + " msg-enter";

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  if (role === "ai") {
    const img = document.createElement("img");
    img.src = "img/loreal-logo.png";
    img.alt = "L'Oréal";
    img.className = "avatar-img";
    avatar.appendChild(img);
  } else {
    // simple user avatar (initials) — can be replaced with user image later
    const userDot = document.createElement("div");
    userDot.className = "avatar-user";
    userDot.textContent = "You";
    avatar.appendChild(userDot);
  }

  const content = document.createElement("div");
  content.className = "msg-content";
  // Render richer markup: escape, then apply lightweight markdown (bold/italic)
  // and linkification for URLs.
  content.innerHTML = renderContent(text);

  // Optional timestamp
  const ts = document.createElement("div");
  ts.className = "msg-ts";
  ts.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // build order: for ai -> avatar, content, ts; for user -> content, avatar, ts (right aligned)
  if (role === "ai") {
    el.appendChild(avatar);
    el.appendChild(content);
    el.appendChild(ts);
  } else {
    el.appendChild(content);
    el.appendChild(avatar);
    el.appendChild(ts);
  }

  chatWindow.appendChild(el);
  // keep scroll at bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
  // remove enter class after animation completes to avoid re-triggering
  setTimeout(() => el.classList.remove("msg-enter"), 300);
}

// Conversation context (tracks user name and recent user questions)
const conversationContext = {
  userName: null,
  pastQuestions: [], // keep recent user messages
  generatedRoutine: null,
};

/**
 * Try to extract the user's name from natural phrases like "my name is..." or "I'm ..."
 * If found, store in conversationContext.userName and return the detected name.
 */
function updateContextFromMessage(text) {
  if (!text) return null;
  // simple patterns: "my name is NAME", "I'm NAME", "I am NAME"
  const namePatterns = [
    /my name is\s+([A-Za-z\-']{2,50})/i,
    /i'm\s+([A-Za-z\-']{2,50})/i,
    /i am\s+([A-Za-z\-']{2,50})/i,
  ];

  for (const re of namePatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const name = m[1].trim();
      conversationContext.userName = name;
      return name;
    }
  }
  return null;
}

function addUserQuestionToContext(text) {
  if (!text) return;
  conversationContext.pastQuestions.push({ text, time: Date.now() });
  // keep last 20 questions to avoid excessive context
  if (conversationContext.pastQuestions.length > 20) {
    conversationContext.pastQuestions.shift();
  }
}

function buildContextSystemMessage() {
  const parts = [];
  // include any generated routine as context for future requests
  if (conversationContext.generatedRoutine) {
    parts.push("Generated routine:\n" + conversationContext.generatedRoutine);
  }
  if (conversationContext.userName)
    parts.push(`user_name: ${conversationContext.userName}`);
  if (conversationContext.pastQuestions.length) {
    const last = conversationContext.pastQuestions.slice(-5).map((q) => q.text);
    parts.push(`recent_user_questions: ${last.join(" || ")}
`);
  }
  if (!parts.length) return null;
  return {
    role: "system",
    content: `Conversation context:\n${parts.join("\n")}`,
  };
}

// --- Rich text helpers ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function linkify(text) {
  const urlRegex =
    /((https?:\/\/|www\.)[\w\-@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/gi;
  return text.replace(urlRegex, (match) => {
    let url = match;
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

function markdownToHtml(text) {
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  text = text.replace(/\n/g, "<br>");
  return text;
}

function renderContent(raw) {
  const escaped = escapeHtml(raw);
  const withLinks = linkify(escaped);
  return markdownToHtml(withLinks);
}

/* Toggle product selection by id: add or remove from selectedProducts, update UI */
function toggleSelect(id) {
  const pid = Number(id);
  const product = getProductById(pid);
  if (!product) return;

  const idx = selectedProducts.findIndex((p) => Number(p.id) === pid);
  let added = false;
  if (idx > -1) {
    // remove
    selectedProducts.splice(idx, 1);
  } else {
    // add
    selectedProducts.push(product);
    added = true;
  }

  // Update product card appearance if it's currently rendered
  const card = productsContainer.querySelector(
    `.product-card[data-id="${pid}"]`
  );
  if (card) {
    card.classList.toggle("selected", added);
    card.setAttribute("aria-pressed", added ? "true" : "false");
  }

  // refresh selected products UI
  renderSelectedProducts();
  // persist selection
  saveSelectedToStorage();
}

function saveSelectedToStorage() {
  try {
    const ids = selectedProducts.map((p) => p.id);
    localStorage.setItem("selectedProducts", JSON.stringify(ids));
  } catch (err) {
    console.warn("Could not save selected products to localStorage", err);
  }
}

async function restoreSelectedFromStorage() {
  try {
    const raw = localStorage.getItem("selectedProducts");
    const ids = raw ? JSON.parse(raw) : [];
    if (!ids || !ids.length) {
      renderSelectedProducts();
      return;
    }
    // ensure products are loaded so getProductById works
    await loadProducts();
    selectedProducts = ids
      .map((id) => getProductById(id))
      .filter((p) => p !== null && p !== undefined);
    renderSelectedProducts();
    updateCardSelections();
  } catch (err) {
    console.warn("Could not restore selected products from localStorage", err);
    renderSelectedProducts();
  }
}

function updateCardSelections() {
  productsContainer.querySelectorAll(".product-card").forEach((card) => {
    const id = Number(card.dataset.id);
    const isSelected = selectedProducts.some((p) => Number(p.id) === id);
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
}

function renderSelectedProducts() {
  if (!selectedProducts || !selectedProducts.length) {
    selectedProductsList.innerHTML = `<div class="placeholder-message">No products selected</div>`;
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

function displayProducts(products) {
  if (!products || !products.length) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products found</div>`;
    return;
  }

  productsContainer.innerHTML = products
    .map((p) => {
      const selected = selectedProducts.some(
        (s) => Number(s.id) === Number(p.id)
      );
      return `
      <div class="product-card ${selected ? "selected" : ""}" data-id="${
        p.id
      }" tabindex="0" role="button" aria-pressed="${selected}">
        <img src="${p.image}" alt="${escapeHtml(
        p.name
      )}" class="product-image" />
        <div class="product-info">
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          <div class="product-brand">${escapeHtml(p.brand)}</div>
          <div class="product-price">${escapeHtml(p.price || "")}</div>
        </div>
        <button class="details-btn" aria-label="View details for ${escapeHtml(
          p.name
        )}">i</button>
      </div>
    `;
    })
    .join("");

  // attach handlers for cards and detail buttons
  productsContainer.querySelectorAll(".product-card").forEach((card) => {
    const id = Number(card.dataset.id);
    card.addEventListener("click", () => toggleSelect(id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSelect(id);
      }
    });
  });

  productsContainer.querySelectorAll(".details-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".product-card");
      const id = Number(card.dataset.id);
      const product = getProductById(id);
      openPanelFor(product);
    });
  });
}

const chatHistory = [
  {
    role: "developer",
    content: `You are a virtual beauty specialist who performs web searches in real time to provide current, accurate information about beauty products, routines, and recommendations, with a focus on L'Oréal and the site catalog. Your primary function is to assist users with questions about L'Oréal products, related routines, and brands sold on this site (including: CeraVe, La Roche-Posay, Vichy, L'Oréal Paris, Maybelline, Lancôme, Garnier, Kiehl's, Kérastase, SkinCeuticals, Urban Decay, Yves Saint Laurent, Redken, and others in the catalog). Your responses should always reflect the most recent information, referencing official sources, reputable sites, or the current product catalog, and must include links or citations for any web-derived info or recommendations.

Before producing your answer:
- **Step 1: Scope check:** Determine if the user question relates to beauty advice, products, routines, beauty concerns, or comparisons for items from the allowed catalog.
- **Step 2: If out of scope:** Politely decline to answer and guide the conversation back to beauty/product topics.
- **Step 3: If in scope:** Use live web search to:
    - Retrieve up-to-date information, details, or launches about relevant products (especially L'Oréal; include others as the user directs).
    - Suggest routines, recommendations, or comparisons using ONLY products in the allowed site catalog.
    - Reference and link to your sources/citations for any factual/product information provided, using inline links.
    - Prefer L'Oréal products when possible, but include other brands upon request or if more appropriate.
- **Step 4: Tone and detail:** Use a friendly, concise, and professional voice. Keep responses short to medium length (2–5 sentences); use short numbered lists for routines/steps if asked. Expand with step-by-step instructions only when the user requests more detail.
- **Step 5: Output format:** Use a single concise paragraph for general responses; use short numbered or bullet lists for routines. Ensure that every answer based on live web information includes proper citation(s)/link(s).

**Acceptable Topics:**
- Questions about L'Oréal or other allowed products, product comparisons, beauty routines (skin, hair, makeup), beauty concerns (e.g., dryness, aging, sensitivity), guidance for product selection from the site catalog.

**Unacceptable Topics:**
- Non-beauty questions, medical or legal advice, or topics beyond beauty products/practices and the brands listed.

**Important:**  
Always perform real-time web search for the latest info before responding. Never recommend, reference, or cite products/brands not explicitly included in the allowed catalog.

---

### Output Formatting

- **For short/general answers:** Single concise paragraph, 2–5 sentences, with inline link(s) or [citation(s)] referencing up-to-date sources where appropriate.
- **For routines/instructions:** Short numbered/bulleted list (up to 6 steps) using explicit product names and specific citation(s) after each recommended product if sourced online.
- **Declined/out-of-scope queries:** Brief, polite sentence redirecting to beauty topics.
- **Response length:** 2–5 sentences unless user requests detailed steps.

---

### Examples

**Example 1**  
**User input:** Which L'Oréal shampoo works best for dry hair?
**Output:** For dry hair, I'd recommend the [L'Oréal Paris Elvive Extraordinary Oil Shampoo](https://www.lorealparis.com/extrordinary-oil-shampoo), which deeply nourishes and hydrates for a softer, shinier finish\[^1^]. It's a popular choice for restoring moisture balance!  
\[^1^]: L'Oréal official product page, updated 2024

**Example 2**  
**User input:** Any new anti-aging serums from L'Oréal or La Roche-Posay?  
**Output:** The [L'Oréal Paris Revitalift 1.5% Pure Hyaluronic Acid Serum](https://www.lorealparis.com/revitalift) and [La Roche-Posay Pure Vitamin C10 Serum](https://www.laroche-posay.us/pure-vitamin-c10-serum) are both highly rated and recently recommended for anti-aging\[^1^]\[^2^]. Each provides visible plumping and radiance benefits.  
\[^1^]: L'Oréal Paris US, 2024; \[^2^]: La Roche-Posay US, 2024

**Example 3**  
**User input:** Can you tell me who won the World Cup in 2010?
**Output:** I’m here to help with all your beauty needs—especially questions about L’Oréal products or routines. If you’d like advice on skincare or haircare, just let me know!

**Example 4 (Routines)**  
**User input:** Create a simple skincare routine for oily skin using La Roche-Posay products.  
**Output:**  
1. Cleanse with [La Roche-Posay Effaclar Purifying Foaming Gel](https://www.laroche-posay.us/effaclar-gel)\[^1^].  
2. Tone using [Effaclar Clarifying Solution](https://www.laroche-posay.us/effaclar-solution)\[^2^].  
3. Moisturize with [Effaclar Mat Oil-Free Mattifying Moisturizer](https://www.laroche-posay.us/effaclar-mat)\[^3^].  
This lineup helps control oil and keep your skin clear!  
\[^1^]: La Roche-Posay, May 2024; \[^2^]: La Roche-Posay, 2024; \[^3^]: La Roche-Posay, 2024.

*(Full responses should reference up-to-date, official, or reputable information; real user examples should include current product links and relevant up-to-date info as above.)*

---

**Critical Reminders:**  
- Always conduct live web search for current info.  
- Reference, link, and cite for any product/factual statements.  
- Prioritize L'Oréal when suitable, but use user-specified brands from the allowed catalog as requested.  
- Polite refusal and redirection for non-beauty topics.  
- Responses must remain concise and friendly.

---

**IMPORTANT INSTRUCTION REMINDER:**  
Always use real-time web search to provide current information, cite your sources, and only suggest products from the allowed catalog. Responses should be short and friendly unless the user requests detailed steps.`,
  },
];

async function sendMessageToOpenAI(message) {
  const url = "https://loreal-worker.nkfelic1.workers.dev/";

  // Build messages: include base chatHistory (system prompt), then any context summary, then the user's message
  const messages = chatHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const contextMsg = buildContextSystemMessage();
  if (contextMsg) {
    // append context as an additional system message so the assistant can use it
    messages.push(contextMsg);
  }
  messages.push({ role: "user", content: message });

  const body = {
    model: "gpt-5-search-api",
    messages: messages,
    store: false,
  };
  // Debug: log outgoing body so we can confirm the client is sending valid JSON
  console.debug("Sending worker request body:", body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorDetails}`
    );
  }

  const data = await response.json();
  const assistantText = data.choices[0].message.content.trim();

  // Save conversation to history
  chatHistory.push({ role: "user", content: message });
  chatHistory.push({ role: "assistant", content: assistantText });

  return assistantText;
}

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  // show user's message immediately
  appendMessage("user", text);
  // update conversational context with user's message
  addUserQuestionToContext(text);
  const detectedName = updateContextFromMessage(text);
  if (detectedName) {
    // acknowledge name immediately in UI
    appendMessage(
      "ai",
      `Nice to meet you, ${detectedName}! How can I help today?`
    );
  }
  userInput.value = "";

  // disable submit while waiting
  const submitBtn = chatForm.querySelector("button");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const reply = await sendMessageToOpenAI(text);
    appendMessage("ai", reply);
  } catch (err) {
    console.error(err);
    appendMessage(
      "ai",
      "Sorry — I couldn't reach the API. Please try again later."
    );
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    userInput.focus();
  }
});

// Initialize selected area placeholder (restore persisted selections)
(async function initSelections() {
  await restoreSelectedFromStorage();
})();

/* Direction toggle: allow user to override automatic direction */
const dirToggleBtn = document.getElementById("dirToggleBtn");

function updateDirUI() {
  if (!dirToggleBtn) return;
  const dir = document.documentElement.getAttribute("dir") || "ltr";
  dirToggleBtn.textContent = dir === "rtl" ? "RTL" : "LTR";
  dirToggleBtn.setAttribute("aria-pressed", dir === "rtl" ? "true" : "false");
}

function setDirection(dir, save = true) {
  document.documentElement.setAttribute("dir", dir);
  updateDirUI();
  if (save) {
    try {
      localStorage.setItem("dirOverride", dir);
    } catch (err) {
      console.warn("Could not persist dir override", err);
    }
  }
}

if (dirToggleBtn) {
  dirToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const current = document.documentElement.getAttribute("dir") || "ltr";
    const next = current === "rtl" ? "ltr" : "rtl";
    setDirection(next, true);
  });
}

// Apply saved override (if any) after initial auto-detection
try {
  const saved = localStorage.getItem("dirOverride");
  if (saved) {
    setDirection(saved, false);
  } else {
    updateDirUI();
  }
} catch (err) {
  updateDirUI();
}

/* Generate Routine button: send selected products JSON to the API and show the result */
const generateBtn = document.getElementById("generateRoutine");
generateBtn.addEventListener("click", async () => {
  if (!selectedProducts || !selectedProducts.length) {
    appendMessage(
      "ai",
      "Please select at least one product before generating a routine."
    );
    return;
  }

  // Show a user-like action message
  appendMessage("user", "Generate a routine using the selected products.");

  // Build a clear prompt including the selected products as JSON
  const productsJson = JSON.stringify(selectedProducts, null, 2);
  const prompt = `Using ONLY the following JSON array of products, create a concise, step-by-step routine (morning and evening when applicable). For each step, reference the product by name and give one short instruction. Keep the routine focused and practical. Return the routine as plain text suitable for display in a chat.

Products JSON:\n${productsJson}`;

  // Disable button while waiting
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  try {
    const assistantText = await sendMessageToOpenAI(prompt);

    // Display the AI-generated routine in the chat window
    appendMessage("ai", assistantText);

    // Save it to conversation context so future requests use it as starting context
    conversationContext.generatedRoutine = assistantText;
  } catch (err) {
    console.error(err);
    appendMessage(
      "ai",
      "Sorry, I couldn't generate a routine right now. Please try again."
    );
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine';
  }
});

// Clear all selections handler
function clearAllSelections() {
  if (!selectedProducts || !selectedProducts.length) return;
  selectedProducts = [];
  saveSelectedToStorage();
  renderSelectedProducts();
  updateCardSelections();
  // close panel if open
  if (panelOpenForId) closePanel();
}

if (clearSelectionsBtn) {
  clearSelectionsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    clearAllSelections();
  });
}
