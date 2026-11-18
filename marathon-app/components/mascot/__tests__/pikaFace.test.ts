import { PIKA_EXPRESSIONS, pikaFace, pikaFlagColor, type FaceShape } from "../pikaFace";

const numbersIn = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

function check(shape: FaceShape) {
  if (shape.kind === "path") {
    expect(shape.d.length).toBeGreaterThan(0);
    expect(shape.d).not.toMatch(/NaN|undefined|Infinity/);
    numbersIn(shape.d).forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(shape.fill ?? shape.stroke).toBeDefined();
  } else if (shape.kind === "circle") {
    [shape.cx, shape.cy, shape.r].forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(shape.r).toBeGreaterThan(0);
  } else {
    [shape.cx, shape.cy, shape.rx, shape.ry].forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(shape.rx).toBeGreaterThan(0);
    expect(shape.ry).toBeGreaterThan(0);
  }
}

describe("Pika's face", () => {
  it("defines all five expressions", () => {
    expect([...PIKA_EXPRESSIONS]).toEqual(["easy", "hard", "max", "rest", "pb"]);
  });

  it.each(PIKA_EXPRESSIONS.map((e) => [e]))("%s draws finite, valid shapes", (expression) => {
    const shapes = pikaFace(expression);
    expect(shapes.length).toBeGreaterThan(0);
    shapes.forEach(check);
  });

  it("every expression looks different from the others", () => {
    const keys = PIKA_EXPRESSIONS.map((e) => JSON.stringify(pikaFace(e)));
    expect(new Set(keys).size).toBe(PIKA_EXPRESSIONS.length);
  });

  it("scales with the scale argument and stays finite", () => {
    PIKA_EXPRESSIONS.forEach((e) => pikaFace(e, 0.6).forEach(check));
  });

  it("only a personal best gets the gold flag", () => {
    expect(pikaFlagColor("pb")).toBe("#F2B705");
    (["easy", "hard", "max", "rest"] as const).forEach((e) => expect(pikaFlagColor(e)).toBe("#C9B8FF"));
  });
});
