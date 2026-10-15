"use strict";

const assert = require("node:assert");
const { evaluateExpression, schoolbookMul } = require("../lib/rational.cjs");
const { executeTool } = require("../lib/tools.cjs");

function independentProduct(a, b) {
  return schoolbookMul(BigInt(a), BigInt(b)).toString();
}

async function main() {
  const left = "4353454523432432432";
  const right = "3074385743895348953485785345";
  const expression = `${left} * ${right}`;
  const calculated = evaluateExpression(expression);
  const independent = independentProduct(left, right);
  assert.strictEqual(calculated.kind, "exact-integer");
  assert.strictEqual(calculated.independentlyVerified, true);
  assert.strictEqual(calculated.exact, independent);
  assert.strictEqual(calculated.exact, (BigInt(left) * BigInt(right)).toString());

  assert.strictEqual(evaluateExpression("1+2+3").exact, "6");
  assert.strictEqual(evaluateExpression("20-8").exact, "12");
  assert.strictEqual(evaluateExpression("10/4").exact, "5/2");
  assert.strictEqual(evaluateExpression("10/4").quotient, "2");
  assert.strictEqual(evaluateExpression("10/4").remainder, "2");
  assert.strictEqual(evaluateExpression("1/2").decimal, "0.5");
  assert.strictEqual(evaluateExpression("50%").exact, "1/2");
  assert.strictEqual(evaluateExpression("(1/2)+(1/3)").exact, "5/6");

  const zero = await executeTool("calculate", { expression: "1/0" });
  assert.strictEqual(zero.ok, false);
  assert.match(zero.error, /zero/i);

  const bad = await executeTool("calculate", "{");
  assert.strictEqual(bad.ok, false);

  const js = await executeTool("run_javascript", { code: "2n ** 10n" });
  assert.strictEqual(js.ok, true);
  assert.strictEqual(js.result, "1024");

  const blocked = await executeTool("run_javascript", { code: "require('fs').readFileSync('/etc/hostname','utf8')" });
  assert.strictEqual(blocked.ok, false);

  const hung = await executeTool("run_javascript", { code: "while (true) {}" });
  assert.strictEqual(hung.ok, false);

  const py = await executeTool("run_python", { code: "result = 2 + 2" });
  assert.strictEqual(py.ok, true);
  assert.strictEqual(py.result, "4");

  console.log("All tool tests passed.");
  console.log("Product digits:", calculated.exact.length);
  console.log("Product:", calculated.exact);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
