# ShopEase — Simple E-commerce Store

A beginner-friendly e-commerce project built with **HTML, CSS, JavaScript, Node.js, Express.js, and SQLite**.

## Features

- Product listing with category and description
- Search products
- Product details view
- Shopping cart with quantity controls
- User registration and login
- Password hashing with bcrypt
- JWT-based authentication for protected routes
- Order processing and order history
- SQLite database for products, users, orders, and order items
- Stock validation when placing an order
- Responsive layout for mobile and desktop

## Requirements

- Node.js 18 or newer
- npm

## Run locally

1. Download or clone this repository.
2. Open a terminal in the project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open **http://localhost:3000** in your browser.

The SQLite database is created automatically at `data/store.db`. Sample products are inserted on the first run.

## How to test

1. Browse products and add items to the cart.
2. Click **Login / Register** and create an account.
3. Open the cart and click **Place order**.
4. Open **My Orders** to see the order history.

## API routes

| Method | Route | Description | Authentication |
|---|---|---|---|
| GET | `/api/products` | List products | No |
| GET | `/api/products/:id` | Product details | No |
| POST | `/api/auth/register` | Register user | No |
| POST | `/api/auth/login` | Login user | No |
| GET | `/api/auth/me` | Current user | Yes |
| POST | `/api/orders` | Place order | Yes |
| GET | `/api/orders` | Current user's orders | Yes |

## Project structure

```text
simple-ecommerce-store/
├── data/                 # SQLite database is created here at runtime
├── public/
│   ├── index.html        # Page structure
│   ├── styles.css        # Responsive styles
│   └── app.js            # Frontend interactions and API calls
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js             # Express API and database setup
```

## Push to GitHub

Create an empty repository on GitHub, then run these commands from the project folder:

```bash
git init
git add .
git commit -m "Build simple e-commerce store"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the URL with your own GitHub repository URL.

## Important notes

- This is a learning/demo project, not a production-ready store.
- Set a strong `JWT_SECRET` environment variable before deployment.
- Do not commit real credentials, `.env` files, database files, or customer data.
- Payments are not integrated; the demo records an order without charging a payment method.
- Product images use remote Unsplash URLs, so internet access is needed to load them.
