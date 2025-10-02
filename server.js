require("dotenv").config();
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY || "mi_clave_secreta";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/imagenes", express.static(path.join(__dirname, "imagenes")));

// “DB” demo en memoria
const users = [
  { email: "alan@test.com", password: "123456", username: "Alan" },
  { email: "demo@test.com", password: "1234", username: "Admin" }
];

const products = [
  { id: 1, name: "Balón de Fútbol Adidas", price: 799.99, image: "/imagenes/images.jpeg", stock: 5 },   // NUEVO stock
  { id: 2, name: "Camiseta Oficial FC Barcelona", price: 1299.50, image: "/imagenes/barca.jpg", stock: 8 },
  { id: 3, name: "Guantes de Portero Nike", price: 699.00, image: "/imagenes/guantes.jpg", stock: 10 },
  { id: 4, name: "Tachones Puma", price: 1499.90, image: "/imagenes/tenis.jpg", stock: 6 },
  { id: 5, name: "Espinilleras Protectoras", price: 299.00, image: "/imagenes/espinilleras.jpg", stock: 20 },
  { id: 6, name: "Mangas Termicas", price: 200.00, image: "/imagenes/mangas.jpg", stock: 15 },
  { id: 7, name: "Termos", price: 300.00, image: "/imagenes/termo.jpg", stock: 12 },
  { id: 8, name: "Mochila", price: 350.00, image: "/imagenes/mochila.jpg", stock: 9 },
  { id: 9, name: "Bomba Para Inflar Balones", price: 250.00, image: "/imagenes/bomba.jpg", stock: 7 },
  { id: 10, name: "Bandas Para Pelo", price: 150.00, image: "/imagenes/banda.jpg", stock: 25 }
];

/* ---------- OAuth Google ---------- */
async function verifyGoogleIdToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    email: payload.email,
    username: payload.name || payload.email.split("@")[0],
    provider: "google",
    sub: payload.sub,
  };
}

// Acepta JWT propio o ID Token de Google
async function autenticarToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token no encontrado" });

    // 1) JWT propio
    try {
      const user = jwt.verify(token, SECRET_KEY);
      req.user = { ...user, provider: "local" };
      return next();
    } catch (_) {
      // 2) Google ID Token
      try {
        const gUser = await verifyGoogleIdToken(token);
        req.user = gUser;
        return next();
      } catch (err) {
        return res.status(403).json({ message: "Token inválido" });
      }
    }
  } catch (e) {
    return res.status(500).json({ message: "Error al validar token" });
  }
}

/* ---------- Auth local ---------- */
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return res.json({ message: "❌ Usuario o contraseña incorrectos" });

  const token = jwt.sign(
    { email: user.email, username: user.username },
    SECRET_KEY,
    { expiresIn: "1h" }
  );
  res.json({ token });
});

app.post("/register", (req, res) => {
  const { username, email, password } = req.body;
  const existe = users.find((u) => u.email === email);
  if (existe) return res.send("❌ Este usuario ya está registrado");
  users.push({ username, email, password });
  return res.redirect("/index.html");
});

/* ---------- Helpers carrito/stock (NUEVO) ---------- */
function getUserKey(user) {
  if (user?.provider === "google") return `google:${user.sub}`;
  return `local:${user?.email}`;
}
function ensureCart(userKey) {
  if (!carts.has(userKey)) carts.set(userKey, []);
  return carts.get(userKey);
}
function findProduct(productId) {
  return products.find(p => p.id === Number(productId));
}
function calcTotal(cart) {
  return cart.reduce((acc, it) => acc + it.price * it.qty, 0);
}
function cantidadFromBody(body) { // acepta qty o cantidad
  const raw = body?.qty ?? body?.cantidad;
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/* ---------- Catálogo protegido ---------- */
app.get("/api/products", autenticarToken, (req, res) => {
  res.json(products);
});

/* ---------- Carrito protegido ---------- */
const carts = new Map();

// GET /api/carrito
app.get("/api/carrito", autenticarToken, (req, res) => {
  const key = getUserKey(req.user);
  const cart = ensureCart(key);
  res.json({ items: cart, total: calcTotal(cart) });
});

// POST /api/carrito/add  body: { productId, qty|cantidad }
app.post("/api/carrito/add", autenticarToken, (req, res) => {
  const { productId } = req.body || {};
  let qty = cantidadFromBody(req.body);
  if (qty === undefined) qty = 1;

  // Validaciones
  if (!productId) return res.status(400).json({ message: "Falta productId" });
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ message: "Cantidad inválida (debe ser > 0)" }); // 400 negativo/0
  }

  const prod = findProduct(productId);
  if (!prod) return res.status(404).json({ message: "Producto no encontrado" }); // 404 inexistente

  if (prod.stock < qty) {
    return res.status(409).json({                                   // 409 sin stock
      message: "Producto sin stock suficiente",
      disponible: prod.stock
    });
  }

  const key = getUserKey(req.user);
  const cart = ensureCart(key);
  const existe = cart.find(it => it.productId === prod.id);

  // Descontar stock y actualizar carrito
  prod.stock -= qty;
  if (existe) {
    existe.qty += qty;
  } else {
    cart.push({
      productId: prod.id,
      name: prod.name,
      price: Number(prod.price),
      image: prod.image,
      qty
    });
  }

  res.status(201).json({ items: cart, total: calcTotal(cart) });
});

// PUT /api/carrito/update/:productId  body: { qty|cantidad }
app.put("/api/carrito/update/:productId", autenticarToken, (req, res) => {
  const productId = Number(req.params.productId);
  const newQty = cantidadFromBody(req.body);

  if (!Number.isFinite(productId)) {
    return res.status(400).json({ message: "productId inválido" });
  }
  if (!Number.isFinite(newQty) || newQty < 0) {
    return res.status(400).json({ message: "qty/cantidad debe ser número >= 0" }); // 400 negativo
  }

  const prod = findProduct(productId);
  if (!prod) return res.status(404).json({ message: "Producto no encontrado" }); // 404 inexistente

  const key = getUserKey(req.user);
  const cart = ensureCart(key);
  const idx = cart.findIndex(it => it.productId === productId);

  // Si no estaba y newQty > 0, equivale a agregar
  if (idx === -1) {
    if (newQty === 0) return res.json({ items: cart, total: calcTotal(cart) });
    if (prod.stock < newQty) {
      return res.status(409).json({ message: "Producto sin stock suficiente", disponible: prod.stock }); // 409
    }
    prod.stock -= newQty;
    cart.push({
      productId: prod.id,
      name: prod.name,
      price: Number(prod.price),
      image: prod.image,
      qty: newQty
    });
    return res.json({ items: cart, total: calcTotal(cart) });
  }

  // Ya estaba en carrito:
  const current = cart[idx];
  const diff = newQty - current.qty;

  if (newQty === 0) {
    // Devolver todo el stock y eliminar
    prod.stock += current.qty;
    cart.splice(idx, 1);
    return res.json({ items: cart, total: calcTotal(cart) });
  }

  if (diff > 0) {
    // Quieren aumentar
    if (prod.stock < diff) {
      return res.status(409).json({ message: "Producto sin stock suficiente", disponible: prod.stock }); // 409
    }
    prod.stock -= diff;
    current.qty = newQty;
  } else if (diff < 0) {
    // Reducen: devolver stock
    prod.stock += Math.abs(diff);
    current.qty = newQty;
  } // diff === 0 no hace nada

  res.json({ items: cart, total: calcTotal(cart) });
});

// DELETE /api/carrito/remove/:productId
app.delete("/api/carrito/remove/:productId", autenticarToken, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId)) {
    return res.status(400).json({ message: "productId inválido" });
  }

  const prod = findProduct(productId);
  if (!prod) return res.status(404).json({ message: "Producto no encontrado" }); // 404 inexistente

  const key = getUserKey(req.user);
  const cart = ensureCart(key);
  const idx = cart.findIndex(it => it.productId === productId);
  if (idx === -1) return res.status(404).json({ message: "No estaba en el carrito" }); // 404

  // Devolver stock y eliminar
  prod.stock += cart[idx].qty;
  cart.splice(idx, 1);

  res.json({ items: cart, total: calcTotal(cart) });
});

// DELETE /api/carrito/clear
app.delete("/api/carrito/clear", autenticarToken, (req, res) => {
  const key = getUserKey(req.user);
  const cart = ensureCart(key);

  // Devolver stock de todos (NUEVO)
  for (const item of cart) {
    const prod = findProduct(item.productId);
    if (prod) prod.stock += item.qty;
  }
  carts.set(key, []);

  res.json({ items: [], total: 0 });
});

/* ---------- Server ---------- */
if (require.main === module) {
  app.listen(PORT, () =>
    console.log(`🚀 Servidor en http://localhost:${PORT}`)
  );
}
module.exports = app; // exporta app para pruebas
