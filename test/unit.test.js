const { calcTotal, cantidadFromBody, findProduct } = require("../server");

describe("Funciones helpers", () => {
  test("calcTotal calcula correctamente el total", () => {
    const cart = [
      { price: 100, qty: 2 },
      { price: 50, qty: 1 }
    ];
    expect(calcTotal(cart)).toBe(250);
  });

  test("cantidadFromBody extrae qty", () => {
    expect(cantidadFromBody({ qty: "3" })).toBe(3);
    expect(cantidadFromBody({ cantidad: "2" })).toBe(2);
    expect(cantidadFromBody({})).toBeUndefined();
    expect(cantidadFromBody({ qty: "abc" })).toBeNaN();
  });

  test("findProduct encuentra producto existente", () => {
    const prod = findProduct(1);
    expect(prod).toHaveProperty("name", "Balón de Fútbol Adidas");
  });

  test("findProduct devuelve undefined si no existe", () => {
    expect(findProduct(999)).toBeUndefined();
  });
});