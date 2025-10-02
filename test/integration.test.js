const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../server");

const SECRET_KEY = process.env.SECRET_KEY || "mi_clave_secreta";

// Crea un token válido
function getToken() {
  return jwt.sign({ email: "alan@test.com", username: "Alan" }, SECRET_KEY, { expiresIn: "1h" });
}

describe("Auth y API protegida", () => {
  let token;

  beforeAll(() => {
    token = getToken();
  });

  test("Login correcto devuelve token", async () => {
    const res = await request(app)
      .post("/login")
      .send({ email: "alan@test.com", password: "123456" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("token");
  });

  test("Login incorrecto devuelve error", async () => {
    const res = await request(app)
      .post("/login")
      .send({ email: "fake@test.com", password: "123456" });

    expect(res.body.message).toMatch(/incorrectos/);
  });

  test("GET /api/products requiere token", async () => {
    const res = await request(app).get("/api/products");
    expect(res.statusCode).toBe(401);
  });

  test("GET /api/products con token válido", async () => {
    const res = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("POST /api/carrito/add agrega producto al carrito", async () => {
    const res = await request(app)
      .post("/api/carrito/add")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: 1, qty: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.items[0]).toHaveProperty("productId", 1);
  });

  test("PUT /api/carrito/update/:id actualiza cantidad", async () => {
    const res = await request(app)
      .put("/api/carrito/update/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ qty: 3 });

    expect(res.statusCode).toBe(200);
    expect(res.body.items[0]).toHaveProperty("qty", 3);
  });

  test("DELETE /api/carrito/remove/:id elimina producto", async () => {
    const res = await request(app)
      .delete("/api/carrito/remove/1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.items.length).toBe(0);
  });
});