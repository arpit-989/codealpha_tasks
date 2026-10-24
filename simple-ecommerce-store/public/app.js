const API = "/api";
const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem("shopease-cart") || "[]"),
  token: localStorage.getItem("shopease-token") || "",
  user: JSON.parse(localStorage.getItem("shopease-user") || "null")
};

const productGrid = document.getElementById("productGrid");
const panel = document.getElementById("contentPanel");
const searchInput = document.getElementById("searchInput");
const cartCount = document.getElementById("cartCount");
const authBtn = document.getElementById("authBtn");
const logoutBtn = document.getElementById("logoutBtn");
const ordersBtn = document.getElementById("ordersBtn");
let toastTimer;

document.getElementById("year").textContent = new Date().getFullYear();

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function saveCart() {
  localStorage.setItem("shopease-cart", JSON.stringify(state.cart));
  cartCount.textContent = state.cart.reduce((total, item) => total + item.quantity, 0);
}
function updateHeader() {
  const loggedIn = Boolean(state.token && state.user);
  authBtn.textContent = loggedIn ? `Hi, ${state.user.name.split(" ")[0]}` : "Login / Register";
  logoutBtn.hidden = !loggedIn;
  ordersBtn.hidden = !loggedIn;
}
async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API}${url}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.message || "Something went wrong.");
  }
  return data;
}
function showPanel(html) {
  panel.innerHTML = html;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}
function hidePanel() {
  panel.hidden = true;
  panel.innerHTML = "";
}
function renderProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const products = state.products.filter((p) =>
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query)
  );
  if (!products.length) {
    productGrid.innerHTML = '<p class="muted">No products found. Try another search.</p>';
    return;
  }
  productGrid.innerHTML = products.map((p) => `
    <article class="product-card">
      <img class="product-image" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" data-detail="${p.id}" loading="lazy"
           onerror="this.src='https://placehold.co/700x500/f7f7f1/244f38?text=ShopEase'">
      <div class="product-info">
        <span class="category">${escapeHtml(p.category)}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description)}</p>
        <div class="product-bottom">
          <span class="price">${money(p.price)}</span>
          <div class="product-actions">
            <button class="small-button" data-detail="${p.id}">Details</button>
            <button class="primary-button" data-add="${p.id}" ${p.stock < 1 ? "disabled" : ""}>${p.stock < 1 ? "Sold out" : "Add to cart"}</button>
          </div>
        </div>
      </div>
    </article>`).join("");
}
function addToCart(id) {
  const product = state.products.find((p) => p.id === Number(id));
  if (!product) return;
  const existing = state.cart.find((item) => item.productId === product.id);
  if (existing) {
    if (existing.quantity >= product.stock) return showToast("You have reached the available stock.");
    existing.quantity += 1;
  } else {
    if (product.stock < 1) return showToast("This product is out of stock.");
    state.cart.push({ productId: product.id, quantity: 1 });
  }
  saveCart();
  showToast(`${product.name} added to cart.`);
}
function showProductDetails(id) {
  const p = state.products.find((product) => product.id === Number(id));
  if (!p) return;
  showPanel(`
    <div class="detail-layout">
      <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" onerror="this.src='https://placehold.co/700x500/f7f7f1/244f38?text=ShopEase'">
      <div>
        <p class="eyebrow">${escapeHtml(p.category)}</p>
        <h2>${escapeHtml(p.name)}</h2>
        <p class="muted">${escapeHtml(p.description)}</p>
        <h2>${money(p.price)}</h2>
        <p class="muted">${p.stock} available</p>
        <button class="primary-button" data-add="${p.id}">Add to cart</button>
        <button class="small-button" id="backToProducts">Back to products</button>
      </div>
    </div>`);
}
function showCart() {
  const lines = state.cart.map((item) => {
    const p = state.products.find((product) => product.id === item.productId);
    return p ? { ...p, quantity: item.quantity } : null;
  }).filter(Boolean);
  if (!lines.length) {
    showPanel('<h2>Your cart</h2><p class="muted">Your cart is empty. Add a product to get started.</p><button class="primary-button" id="backToProducts">Browse products</button>');
    return;
  }
  const total = lines.reduce((sum, p) => sum + p.price * p.quantity, 0);
  showPanel(`
    <h2>Your shopping cart</h2>
    ${lines.map((p) => `
      <div class="cart-row">
        <div class="cart-product"><img src="${escapeHtml(p.image)}" alt=""><div><h3>${escapeHtml(p.name)}</h3><span class="muted">${money(p.price)} each</span></div></div>
        <div class="quantity-control">
          <button data-qty="${p.id}" data-change="-1" aria-label="Decrease quantity">−</button>
          <strong>${p.quantity}</strong>
          <button data-qty="${p.id}" data-change="1" aria-label="Increase quantity">+</button>
          <button class="remove-button" data-remove="${p.id}">Remove</button>
        </div>
        <strong>${money(p.price * p.quantity)}</strong>
      </div>`).join("")}
    <div class="cart-summary"><span>Total</span><span>${money(total)}</span></div>
    <button class="primary-button" id="checkoutBtn">Place order</button>
    <button class="small-button" id="backToProducts">Continue shopping</button>
  `);
}
function changeQuantity(id, change) {
  const item = state.cart.find((entry) => entry.productId === Number(id));
  const product = state.products.find((p) => p.id === Number(id));
  if (!item || !product) return;
  item.quantity += Number(change);
  if (item.quantity <= 0) state.cart = state.cart.filter((entry) => entry.productId !== Number(id));
  else if (item.quantity > product.stock) {
    item.quantity = product.stock;
    showToast("You have reached the available stock.");
  }
  saveCart();
  showCart();
}
function removeFromCart(id) {
  state.cart = state.cart.filter((item) => item.productId !== Number(id));
  saveCart();
  showCart();
}
function showAuth(mode = "login") {
  const isRegister = mode === "register";
  showPanel(`
    <h2>${isRegister ? "Create your account" : "Welcome back"}</h2>
    <p class="muted">${isRegister ? "Register to place and track your orders." : "Log in to continue shopping and view your orders."}</p>
    <form id="authForm" class="form-grid">
      ${isRegister ? '<label>Full name<input class="field" name="name" required minlength="2" autocomplete="name"></label>' : ""}
      <label>Email address<input class="field" type="email" name="email" required autocomplete="email"></label>
      <label>Password<input class="field" type="password" name="password" required minlength="6" autocomplete="${isRegister ? "new-password" : "current-password"}"></label>
      <button class="primary-button" type="submit">${isRegister ? "Create account" : "Login"}</button>
    </form>
    <p class="form-switch">${isRegister ? "Already have an account?" : "New here?"}
      <button class="text-button" id="switchAuth">${isRegister ? "Login" : "Register"}</button>
    </p>`);
  document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const data = await api(`/auth/${isRegister ? "register" : "login"}`, { method: "POST", body: JSON.stringify(body) });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("shopease-token", state.token);
      localStorage.setItem("shopease-user", JSON.stringify(state.user));
      updateHeader();
      showToast(data.message);
      hidePanel();
    } catch (error) {
      showToast(error.message);
    }
  });
  document.getElementById("switchAuth").addEventListener("click", () => showAuth(isRegister ? "login" : "register"));
}
function logout(showMessage = true) {
  state.token = "";
  state.user = null;
  localStorage.removeItem("shopease-token");
  localStorage.removeItem("shopease-user");
  updateHeader();
  if (showMessage) showToast("You have logged out.");
}
async function checkout() {
  if (!state.token) {
    showToast("Please log in before placing an order.");
    showAuth("login");
    return;
  }
  try {
    const result = await api("/orders", {
      method: "POST",
      body: JSON.stringify({ items: state.cart })
    });
    state.cart = [];
    saveCart();
    await loadProducts();
    showPanel(`<p class="eyebrow">ORDER CONFIRMED</p><h2>Thank you for your order!</h2><p>Your order number is <strong>#${result.orderId}</strong>.</p><p class="muted">Order total: ${money(result.total)} · Status: Placed</p><button class="primary-button" id="viewOrdersBtn">View my orders</button>`);
    showToast(result.message);
  } catch (error) {
    showToast(error.message);
  }
}
async function showOrders() {
  if (!state.token) return showAuth("login");
  try {
    const orders = await api("/orders");
    if (!orders.length) {
      showPanel('<h2>My orders</h2><p class="muted">You have not placed any orders yet.</p><button class="primary-button" id="backToProducts">Browse products</button>');
      return;
    }
    showPanel(`<h2>My orders</h2>${orders.map((order) => `
      <div class="order-row"><div><strong>Order #${order.id}</strong><p class="muted">${new Date(order.created_at.replace(" ", "T") + "Z").toLocaleString()} · ${escapeHtml(order.status)}</p>
      <p class="muted">${order.items.map((item) => `${escapeHtml(item.product_name)} × ${item.quantity}`).join(", ")}</p></div><strong>${money(order.total)}</strong></div>`).join("")}`);
  } catch (error) {
    showToast(error.message);
  }
}
async function loadProducts() {
  try {
    state.products = await api("/products");
    renderProducts();
  } catch (error) {
    productGrid.innerHTML = `<p class="muted">${escapeHtml(error.message)} Please refresh the page.</p>`;
  }
}

productGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const detailButton = event.target.closest("[data-detail]");
  if (addButton) addToCart(addButton.dataset.add);
  if (detailButton) showProductDetails(detailButton.dataset.detail);
});
panel.addEventListener("click", (event) => {
  const qtyButton = event.target.closest("[data-qty]");
  const removeButton = event.target.closest("[data-remove]");
  if (qtyButton) changeQuantity(qtyButton.dataset.qty, qtyButton.dataset.change);
  if (removeButton) removeFromCart(removeButton.dataset.remove);
  if (event.target.id === "backToProducts") {
    hidePanel();
    document.getElementById("products").scrollIntoView({ behavior: "smooth" });
  }
  if (event.target.id === "checkoutBtn") checkout();
  if (event.target.id === "viewOrdersBtn") showOrders();
});
searchInput.addEventListener("input", renderProducts);
document.getElementById("cartBtn").addEventListener("click", showCart);
document.getElementById("authBtn").addEventListener("click", () => state.token ? showPanel(`<h2>Account</h2><p>Signed in as ${escapeHtml(state.user.email)}</p><button class="primary-button" id="viewOrdersBtn">View my orders</button>`) : showAuth("login"));
document.getElementById("logoutBtn").addEventListener("click", () => logout());
document.getElementById("ordersBtn").addEventListener("click", showOrders);
document.getElementById("homeLink").addEventListener("click", (event) => {
  event.preventDefault();
  hidePanel();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

saveCart();
updateHeader();
loadProducts();
