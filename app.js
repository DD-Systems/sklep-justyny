const MAX_PRODUCTS = 30;
const PRODUCTS_URL = "products.json";
const CART_STORAGE_KEY = "friends-shop-cart-v1";
const ORDER_CONTACT_STORAGE_KEY = "friends-shop-order-contact-v1";
const DEFAULT_STOCK_PER_PRODUCT = 30;
const SHOP_CONFIG = window.SHOP_CONFIG || {};
const ORDER_API_URL = String(SHOP_CONFIG.orderApiUrl || "").trim();

const fallbackProducts = [
  {
    id: "kawa-ziarnista",
    name: "Kawa ziarnista",
    price: "39,99",
    description: "Aromatyczna kawa 1 kg do ekspresu.",
    image: "",
    stock: 30
  },
  {
    id: "herbata-malinowa",
    name: "Herbata malinowa",
    price: "14,50",
    description: "Owocowa herbata w opakowaniu 100 g.",
    image: "",
    stock: 30
  },
  {
    id: "miod-lipowy",
    name: "Miód lipowy",
    price: "28,00",
    description: "Słoik 400 g z lokalnej pasieki.",
    image: "",
    stock: 30
  }
];

const grid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const counter = document.querySelector("#productCounter");
const installButton = document.querySelector("#installButton");
const cartToggle = document.querySelector("#cartToggle");
const cartPanel = document.querySelector("#cartPanel");
const cartItems = document.querySelector("#cartItems");
const cartSummary = document.querySelector("#cartSummary");
const cartTotal = document.querySelector("#cartTotal");
const clearCartButton = document.querySelector("#clearCartButton");
const sendOrderButton = document.querySelector("#sendOrderButton");
const orderStatus = document.querySelector("#orderStatus");
const customerNameInput = document.querySelector("#customerName");
const customerContactInput = document.querySelector("#customerContact");
const customerNoteInput = document.querySelector("#customerNote");
const imageDialog = document.querySelector("#imageDialog");
const largeImage = document.querySelector("#largeImage");
const largeImageCaption = document.querySelector("#largeImageCaption");
const closeImageButton = document.querySelector("#closeImageButton");

let products = [];
let inventoryMap = new Map();
let cart = loadCart();
let deferredInstallPrompt = null;
let checkoutNotice = "";

function isApiEnabled() {
  return /^https?:\/\//i.test(ORDER_API_URL);
}

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function clearCheckoutNotice() {
  checkoutNotice = "";
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function loadOrderContact() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_CONTACT_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    customerNameInput.value = String(parsed.name || "");
    customerContactInput.value = String(parsed.contact || "");
    customerNoteInput.value = String(parsed.note || "");
  } catch {
    // ignore
  }
}

function saveOrderContact() {
  localStorage.setItem(
    ORDER_CONTACT_STORAGE_KEY,
    JSON.stringify({
      name: customerNameInput.value.trim(),
      contact: customerContactInput.value.trim(),
      note: customerNoteInput.value.trim()
    })
  );
}

function normalizeProducts(items) {
  if (!Array.isArray(items)) {
    return fallbackProducts;
  }

  return items
    .filter((product) => product && product.name && product.price)
    .slice(0, MAX_PRODUCTS)
    .map((product, index) => ({
      id: String(product.id || `product-${index + 1}`),
      name: String(product.name),
      price: String(product.price),
      description: String(product.description || ""),
      image: String(product.image || ""),
      stock: normalizeStock(product.stock)
    }));
}

function normalizeStock(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STOCK_PER_PRODUCT;
}

function normalizeInventoryMap(rawInventory) {
  inventoryMap = new Map();
  if (!rawInventory || typeof rawInventory !== "object") {
    return;
  }

  for (const [productId, record] of Object.entries(rawInventory)) {
    inventoryMap.set(productId, {
      currentStock: normalizeStock(record?.currentStock),
      confirmedSold: normalizeStock(record?.confirmedSold),
      updatedAt: String(record?.updatedAt || "")
    });
  }
}

function getInventoryRecord(productId) {
  return inventoryMap.get(productId) || null;
}

function getProductStock(product) {
  const inventory = getInventoryRecord(product?.id);
  return inventory ? inventory.currentStock : normalizeStock(product?.stock);
}

function syncCartToStock() {
  let changed = false;

  for (const [productId, quantity] of Object.entries(cart)) {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      delete cart[productId];
      changed = true;
      continue;
    }

    const stock = getProductStock(product);
    const safeQuantity = Math.max(0, Math.min(stock, quantity));

    if (safeQuantity !== quantity) {
      changed = true;
    }

    if (safeQuantity === 0) {
      delete cart[productId];
    } else {
      cart[productId] = safeQuantity;
    }
  }

  if (changed) {
    saveCart();
  }
}

async function apiRequest(payload) {
  const response = await fetch(ORDER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Błąd API: ${response.status}`);
  }

  return response.json();
}

async function loadInventory() {
  if (!isApiEnabled()) {
    inventoryMap = new Map();
    return;
  }

  try {
    const payload = await apiRequest({ action: "getInventory" });
    if (payload.ok) {
      normalizeInventoryMap(payload.inventory);
      return;
    }

    inventoryMap = new Map();
  } catch {
    inventoryMap = new Map();
  }
}

async function loadProducts() {
  try {
    const response = await fetch(`${PRODUCTS_URL}?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Products request failed: ${response.status}`);
    }

    products = normalizeProducts(await response.json());
  } catch {
    products = fallbackProducts;
  }

  await loadInventory();
  syncCartToStock();
  renderProducts();
  renderCart();
}

function formatPrice(value) {
  const amount = parsePrice(value);
  if (Number.isNaN(amount)) {
    return `${value} zł`;
  }

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN"
  }).format(amount);
}

function parsePrice(value) {
  const normalized = String(value).replace(",", ".").replace(/[^0-9.]/g, "");
  return Number.parseFloat(normalized);
}

function productInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function renderProducts() {
  const visibleProducts = products;

  grid.innerHTML = "";
  counter.textContent = `${products.length}/${MAX_PRODUCTS} produktów`;
  emptyState.hidden = visibleProducts.length > 0;

  visibleProducts.forEach((product) => {
    const quantityInCart = cart[product.id] || 0;
    const stock = getProductStock(product);
    const inventory = getInventoryRecord(product.id);
    const card = document.createElement("article");
    card.className = "product-card";

    const photo = product.image
      ? `
        <button class="product-photo-button" type="button" data-view-id="${escapeHtml(product.id)}" aria-label="Powiększ zdjęcie: ${escapeHtml(product.name)}">
          <img class="product-photo" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
        </button>
      `
      : `<div class="product-photo"><span class="photo-fallback">${escapeHtml(productInitials(product.name))}</span></div>`;

    card.innerHTML = `
      ${photo}
      <div class="product-body">
        <h2 class="product-name">${escapeHtml(product.name)}</h2>
        <p class="product-description">${escapeHtml(product.description)}</p>
        ${product.description.length > 82 ? '<button class="description-toggle" type="button">Pokaż opis</button>' : ""}
        <div class="stock-row">
          <p class="stock-note">${stock} szt. dostępne</p>
        </div>
        <div class="product-bottom">
          <span class="price">${escapeHtml(formatPrice(product.price))}</span>
          <button class="add-cart-button" type="button" data-cart-id="${escapeHtml(product.id)}" ${quantityInCart >= stock ? "disabled" : ""}>${quantityInCart > 0 ? `W koszyku: ${quantityInCart}` : "Dodaj"}</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function getCartEntries() {
  return Object.entries(cart)
    .map(([id, quantity]) => {
      const product = products.find((item) => item.id === id);
      return product ? { product, quantity } : null;
    })
    .filter(Boolean);
}

function cartTotals() {
  return getCartEntries().reduce(
    (totals, entry) => {
      const price = parsePrice(entry.product.price);
      totals.quantity += entry.quantity;
      totals.total += Number.isNaN(price) ? 0 : price * entry.quantity;
      return totals;
    },
    { quantity: 0, total: 0 }
  );
}

function setCartQuantity(productId, quantity) {
  clearCheckoutNotice();
  const product = products.find((item) => item.id === productId);
  const stock = getProductStock(product);
  const safeQuantity = Math.max(0, Math.min(stock, quantity));
  if (safeQuantity === 0) {
    delete cart[productId];
  } else {
    cart[productId] = safeQuantity;
  }

  saveCart();
  renderCart();
  renderProducts();
}

function addToCart(productId) {
  clearCheckoutNotice();
  const currentQuantity = cart[productId] || 0;
  const product = products.find((item) => item.id === productId);
  const stock = getProductStock(product);
  if (currentQuantity >= stock) {
    alert("W koszyku jest już maksymalna ilość tego produktu.");
    return;
  }

  setCartQuantity(productId, currentQuantity + 1);
  cartPanel.hidden = false;
  cartToggle.setAttribute("aria-expanded", "true");
}

function renderCart() {
  const entries = getCartEntries();
  const totals = cartTotals();

  cartToggle.textContent = `Koszyk: ${totals.quantity} szt. / ${formatPrice(totals.total)}`;
  cartSummary.textContent = `${entries.length} produktów, ${totals.quantity} szt.`;
  cartTotal.textContent = formatPrice(totals.total);
  clearCartButton.hidden = entries.length === 0;
  sendOrderButton.hidden = entries.length === 0;
  orderStatus.textContent =
    checkoutNotice ||
    (isApiEnabled()
      ? "Zamówienie zostanie zapisane online."
      : "Po kliknięciu otworzy się e-mail z gotowym zamówieniem do wysłania.");

  cartItems.innerHTML = "";

  if (entries.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Koszyk jest pusty.</p>';
    return;
  }

  entries.forEach(({ product, quantity }) => {
    const stock = getProductStock(product);
    const price = parsePrice(product.price);
    const lineTotal = Number.isNaN(price) ? 0 : price * quantity;
    const item = document.createElement("article");
    item.className = "cart-item";
    item.innerHTML = `
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(formatPrice(product.price))} / szt. · max ${stock} szt.</p>
      </div>
      <div class="quantity-controls">
        <button type="button" data-cart-change="-1" data-cart-id="${escapeHtml(product.id)}">−</button>
        <span>${quantity}</span>
        <button type="button" data-cart-change="1" data-cart-id="${escapeHtml(product.id)}" ${quantity >= stock ? "disabled" : ""}>+</button>
      </div>
      <button class="remove-cart-button" type="button" data-cart-remove="${escapeHtml(product.id)}">Usuń</button>
      <strong>${escapeHtml(formatPrice(lineTotal))}</strong>
    `;
    cartItems.appendChild(item);
  });
}

function orderEmailAddress() {
  return String(SHOP_CONFIG.orderEmail || ["sklepapp2026", "gmail.com"].join("@")).trim();
}

function orderSource() {
  return String(SHOP_CONFIG.orderSource || "Sklep oryginalny").trim();
}

function partnerShare() {
  const percent = Number(SHOP_CONFIG.partnerSharePercent || 0);
  return Number.isFinite(percent) && percent > 0 ? percent : 0;
}

function sendOrderByEmail() {
  const entries = getCartEntries();
  if (entries.length === 0) {
    alert("Koszyk jest pusty.");
    return;
  }

  const customerName = customerNameInput.value.trim();
  const customerContact = customerContactInput.value.trim();
  const customerNote = customerNoteInput.value.trim();
  const totals = cartTotals();
  const source = orderSource();
  const sharePercent = partnerShare();
  const partnerName = String(SHOP_CONFIG.partnerName || source).trim();
  const lines = entries.map(({ product, quantity }, index) => {
    const price = parsePrice(product.price);
    const lineTotal = Number.isNaN(price) ? 0 : price * quantity;
    return `${index + 1}. ${product.name} | ${quantity} szt. | ${formatPrice(product.price)} | ${formatPrice(lineTotal)}`;
  });

  const body = [
    "Dzień dobry,",
    "",
    "Chcę złożyć zamówienie:",
    "",
    `Źródło zamówienia: ${source}`,
    customerName ? `Imię i nazwisko: ${customerName}` : "",
    customerContact ? `Kontakt: ${customerContact}` : "",
    customerNote ? `Uwagi: ${customerNote}` : "",
    "",
    "PRODUKTY",
    "Lp. | Produkt | Ilość | Cena | Wartość",
    "------------------------------------------------------------",
    ...lines,
    "------------------------------------------------------------",
    "",
    `RAZEM | ${totals.quantity} szt. | ${formatPrice(totals.total)}`,
    "",
    sharePercent ? `ROZLICZENIE ${partnerName.toUpperCase()}` : "",
    sharePercent ? "Pozycja | Wartość" : "",
    sharePercent ? "----------------------------------------" : "",
    sharePercent ? `Wartość sprzedaży | ${formatPrice(totals.total)}` : "",
    sharePercent ? `Prowizja ${partnerName} | ${sharePercent}%` : "",
    sharePercent ? `Należna prowizja | ${formatPrice(totals.total * sharePercent / 100)}` : "",
    sharePercent ? `Kwota po odjęciu prowizji | ${formatPrice(totals.total * (100 - sharePercent) / 100)}` : ""
  ].filter(Boolean).join("\n");

  const subject = encodeURIComponent(`[${source.toUpperCase()}${sharePercent ? ` ${sharePercent}%` : ""}] Zamówienie ze sklepu`);
  const encodedBody = encodeURIComponent(body);
  const partnerEmail = String(SHOP_CONFIG.partnerEmail || "").trim();
  const cc = partnerEmail ? `cc=${encodeURIComponent(partnerEmail)}&` : "";
  window.location.href = `mailto:${orderEmailAddress()}?${cc}subject=${subject}&body=${encodedBody}`;
  checkoutNotice = "Wiadomość e-mail została przygotowana. Wyślij ją w aplikacji pocztowej.";
  saveOrderContact();
  renderCart();
}

function submitOrder() {
  saveOrderContact();
  sendOrderByEmail();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openLargeImage(image, name) {
  largeImage.src = image;
  largeImage.alt = name;
  largeImageCaption.textContent = name;
  imageDialog.showModal();
}

function closeLargeImage() {
  imageDialog.close();
  largeImage.removeAttribute("src");
}

function openProductImageFromTrigger(trigger) {
  const product = products.find((item) => item.id === trigger.dataset.viewId);
  if (!product || !product.image) {
    return;
  }

  openLargeImage(product.image, product.name);
}

grid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-cart-id]");
  if (addButton) {
    event.stopPropagation();
    addToCart(addButton.dataset.cartId);
    return;
  }

  const toggle = event.target.closest(".description-toggle");
  if (toggle) {
    event.stopPropagation();
    const card = toggle.closest(".product-card");
    const isOpen = card.classList.toggle("description-open");
    toggle.textContent = isOpen ? "Zwiń opis" : "Pokaż opis";
    return;
  }

  const trigger = event.target.closest("[data-view-id]");
  if (trigger) {
    openProductImageFromTrigger(trigger);
  }
});

cartItems.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-cart-remove]");
  if (removeButton) {
    setCartQuantity(removeButton.dataset.cartRemove, 0);
    return;
  }

  const button = event.target.closest("[data-cart-change]");
  if (!button) {
    return;
  }

  const productId = button.dataset.cartId;
  const change = Number.parseInt(button.dataset.cartChange, 10);
  setCartQuantity(productId, (cart[productId] || 0) + change);
});

cartToggle.addEventListener("click", () => {
  cartPanel.hidden = !cartPanel.hidden;
  cartToggle.setAttribute("aria-expanded", String(!cartPanel.hidden));
});

clearCartButton.addEventListener("click", () => {
  cart = {};
  saveCart();
  renderCart();
  renderProducts();
});

sendOrderButton.addEventListener("click", submitOrder);
customerNameInput.addEventListener("change", saveOrderContact);
customerContactInput.addEventListener("change", saveOrderContact);
customerNoteInput.addEventListener("change", saveOrderContact);

imageDialog.addEventListener("click", (event) => {
  if (event.target === imageDialog) {
    closeLargeImage();
  }
});

closeImageButton.addEventListener("click", closeLargeImage);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

loadOrderContact();
loadProducts();
