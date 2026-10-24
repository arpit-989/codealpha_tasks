const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-before-deploying";

const dataDir = path.join(__dirname, "data");
require("fs").mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "store.db"));

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 20
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Placed',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (productCount === 0) {
  const seed = db.prepare(`
    INSERT INTO products (name, description, price, image, category, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const sampleProducts = [
    ["Wireless Headphones", "Comfortable over-ear headphones with clear sound and long battery life.", 1499, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700", "Electronics", 20],
    ["Smart Watch", "A lightweight smart watch for everyday activity and notifications.", 2299, "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700", "Electronics", 15],
    ["Casual Backpack", "A practical backpack with room for books, gadgets, and daily essentials.", 999, "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700", "Accessories", 25],
    ["Running Shoes", "Everyday running shoes designed for comfort and easy movement.", 1899, "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700", "Fashion", 18],
    ["Classic Sunglasses", "Minimal sunglasses for sunny days and casual outfits.", 799, "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=700", "Fashion", 30],
    ["Coffee Mug", "A simple ceramic mug for your morning tea or coffee.", 299, "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=700", "Home", 40]
  ];
  const insertMany = db.transaction((items) => items.forEach((item) => seed.run(...item)));
  insertMany(sampleProducts);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Please log in to continue." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Your session expired. Please log in again." });
  }
}

app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT id, name, description, price, image, category, stock FROM products ORDER BY id DESC").all();
  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const product = db.prepare("SELECT id, name, description, price, image, category, stock FROM products WHERE id = ?").get(Number(req.params.id));
  if (!product) return res.status(404).json({ message: "Product not found." });
  res.json(product);
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }
  if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
      .run(name.trim(), normalizedEmail, passwordHash);
    const user = { id: Number(result.lastInsertRowid), name: name.trim(), email: normalizedEmail };
    res.status(201).json({ message: "Account created successfully.", token: createToken(user), user });
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT")) return res.status(409).json({ message: "An account with this email already exists." });
    res.status(500).json({ message: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
  const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!userRow || !(await bcrypt.compare(password, userRow.password_hash))) {
    return res.status(401).json({ message: "Incorrect email or password." });
  }
  const user = { id: userRow.id, name: userRow.name, email: userRow.email };
  res.json({ message: "Logged in successfully.", token: createToken(user), user });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json(user);
});

app.post("/api/orders", requireAuth, (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Your cart is empty." });
  }

  const getProduct = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ?");
  const createOrder = db.prepare("INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'Placed')");
  const addItem = db.prepare("INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)");
  const reduceStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?");

  try {
    const result = db.transaction(() => {
      let total = 0;
      const checkedItems = items.map((item) => {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          throw new Error("Each item must have a valid product and quantity.");
        }
        const product = getProduct.get(productId);
        if (!product) throw new Error("A product in your cart no longer exists.");
        if (product.stock < quantity) throw new Error(`${product.name} does not have enough stock.`);
        total += product.price * quantity;
        return { product, quantity };
      });

      const orderResult = createOrder.run(req.user.id, Number(total.toFixed(2)));
      const orderId = Number(orderResult.lastInsertRowid);
      for (const item of checkedItems) {
        const stockResult = reduceStock.run(item.quantity, item.product.id, item.quantity);
        if (stockResult.changes !== 1) throw new Error(`Could not reserve stock for ${item.product.name}.`);
        addItem.run(orderId, item.product.id, item.product.name, item.quantity, item.product.price);
      }
      return { orderId, total: Number(total.toFixed(2)) };
    })();
    res.status(201).json({ message: "Order placed successfully.", ...result });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not place order." });
  }
});

app.get("/api/orders", requireAuth, (req, res) => {
  const orders = db.prepare("SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  const getItems = db.prepare("SELECT product_name, quantity, price FROM order_items WHERE order_id = ?");
  res.json(orders.map((order) => ({ ...order, items: getItems.all(order.id) })));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Simple E-commerce Store running at http://localhost:${PORT}`);
});
