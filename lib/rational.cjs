"use strict";

// Exact rational arithmetic plus a small expression language.
// Integers stay BigInt end-to-end. Approximate results are labeled.

const MAX_DIGITS = 20000;
const MAX_EXPONENT = 100000n;

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function isqrt(n) {
  if (n < 0n) throw new Error("Square root of a negative number.");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

function schoolbookMul(a, b) {
  const neg = (a < 0n) !== (b < 0n);
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  if (x === 0n || y === 0n) return 0n;
  const A = x.toString();
  const B = y.toString();
  if (A.length + B.length > MAX_DIGITS + 2) {
    throw new Error(`Result would exceed ${MAX_DIGITS} digits.`);
  }
  const res = new Array(A.length + B.length).fill(0);
  for (let i = A.length - 1; i >= 0; i--) {
    const da = A.charCodeAt(i) - 48;
    for (let j = B.length - 1; j >= 0; j--) {
      res[i + j + 1] += da * (B.charCodeAt(j) - 48);
    }
  }
  for (let k = res.length - 1; k > 0; k--) {
    res[k - 1] += Math.floor(res[k] / 10);
    res[k] %= 10;
  }
  let s = res.join("").replace(/^0+/, "") || "0";
  if (s.length > MAX_DIGITS) throw new Error(`Result exceeds ${MAX_DIGITS} digits.`);
  return BigInt((neg ? "-" : "") + s);
}

function mulVerified(a, b) {
  const fast = a * b;
  const slow = schoolbookMul(a, b);
  if (fast !== slow) {
    throw new Error("Internal multiplication check failed. No result was returned.");
  }
  if (fast.toString().replace("-", "").length > MAX_DIGITS) {
    throw new Error(`Result exceeds ${MAX_DIGITS} digits.`);
  }
  return fast;
}

class Q {
  constructor(n, d = 1n) {
    if (typeof n !== "bigint" || typeof d !== "bigint") {
      throw new Error("Rational components must be BigInt.");
    }
    if (d === 0n) throw new Error("Division by zero.");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }

  static fromBigInt(n) {
    return new Q(n, 1n);
  }

  isZero() { return this.n === 0n; }
  isOne() { return this.n === 1n && this.d === 1n; }
  isInteger() { return this.d === 1n; }
  isNegative() { return this.n < 0n; }

  add(o) { return new Q(mulVerified(this.n, o.d) + mulVerified(o.n, this.d), mulVerified(this.d, o.d)); }
  sub(o) { return new Q(mulVerified(this.n, o.d) - mulVerified(o.n, this.d), mulVerified(this.d, o.d)); }
  mul(o) { return new Q(mulVerified(this.n, o.n), mulVerified(this.d, o.d)); }
  div(o) {
    if (o.n === 0n) throw new Error("Division by zero.");
    return new Q(mulVerified(this.n, o.d), mulVerified(this.d, o.n));
  }
  neg() { return new Q(-this.n, this.d); }
  abs() { return new Q(this.n < 0n ? -this.n : this.n, this.d); }

  pow(exp) {
    if (!exp.isInteger()) throw new Error("Non-integer powers are only supported through sqrt or a labeled approximation.");
    let e = exp.n;
    if (e === 0n) {
      if (this.isZero()) throw new Error("Zero to the power of zero is undefined.");
      return Q.fromBigInt(1n);
    }
    const neg = e < 0n;
    if (neg) e = -e;
    if (e > MAX_EXPONENT) throw new Error("Exponent is too large.");
    let base = this;
    let result = Q.fromBigInt(1n);
    while (e > 0n) {
      if (e & 1n) result = result.mul(base);
      e >>= 1n;
      if (e > 0n) base = base.mul(base);
    }
    return neg ? Q.fromBigInt(1n).div(result) : result;
  }

  cmp(o) {
    const left = mulVerified(this.n, o.d);
    const right = mulVerified(o.n, this.d);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  toIntegerString() {
    if (!this.isInteger()) throw new Error("Not an integer.");
    return this.n.toString();
  }
}

function terminatingDecimal(q) {
  let d = q.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
}

function exactDecimal(q) {
  if (!terminatingDecimal(q)) return null;
  const neg = q.n < 0n;
  const n = neg ? -q.n : q.n;
  const whole = n / q.d;
  let rem = n % q.d;
  if (rem === 0n) {
    const text = whole.toString();
    return neg && text !== "0" ? `-${text}` : text;
  }
  let frac = "";
  for (let i = 0; i < 10000 && rem !== 0n; i++) {
    rem *= 10n;
    frac += (rem / q.d).toString();
    rem %= q.d;
  }
  frac = frac.replace(/0+$/, "");
  const text = `${whole.toString()}.${frac}`;
  return neg ? `-${text}` : text;
}

function fractionString(q) {
  if (q.isInteger()) return q.n.toString();
  return `${q.n.toString()}/${q.d.toString()}`;
}

function integerQuotientRemainder(q, divisor) {
  if (!q.isInteger() || !divisor.isInteger()) return null;
  if (divisor.isZero()) throw new Error("Division by zero.");
  const quot = q.n / divisor.n;
  const rem = q.n - quot * divisor.n;
  return { quotient: quot.toString(), remainder: rem.toString() };
}

function formatExact(q, divisorForDivision) {
  const fraction = fractionString(q);
  const decimal = exactDecimal(q);
  const out = {
    kind: q.isInteger() ? "exact-integer" : "exact-rational",
    exact: q.isInteger() ? q.n.toString() : fraction,
    independentlyVerified: true
  };
  if (!q.isInteger()) out.fraction = fraction;
  if (decimal !== null) out.decimal = decimal;
  else if (!q.isInteger()) out.decimal = null;
  if (divisorForDivision) {
    const qr = integerQuotientRemainder(divisorForDivision.left, divisorForDivision.right);
    if (qr) {
      out.quotient = qr.quotient;
      out.remainder = qr.remainder;
      out.division = "truncating toward zero; dividend = quotient × divisor + remainder";
    }
  }
  return out;
}

function parseNumericLiteral(raw) {
  const text = raw.replace(/_/g, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw new Error(`Invalid number: ${raw}`);
  }
  const match = text.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] || "";
  const frac = match[3] != null ? match[3] : (match[4] || "");
  const exp = match[5] ? BigInt(match[5]) : 0n;
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, "") || "0";
  if (digits.length > MAX_DIGITS) throw new Error("Number is too large.");
  let n = sign * BigInt(digits);
  let scale = BigInt(frac.length);
  let e = exp - scale;
  if (e >= 0n) {
    if (e > MAX_EXPONENT) throw new Error("Exponent is too large.");
    return new Q(mulVerified(n, 10n ** e), 1n);
  }
  const mag = -e;
  if (mag > MAX_EXPONENT) throw new Error("Exponent is too large.");
  return new Q(n, 10n ** mag);
}

const FUNCTIONS = new Set([
  "sqrt", "cbrt", "abs", "floor", "ceil", "round", "ln", "log", "log10", "log2",
  "fact", "factorial", "gcd", "lcm", "min", "max", "pow", "sin", "cos", "tan", "quo", "rem"
]);

function normalizeSource(input) {
  return String(input)
    .replace(/×|·|∙/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\*\*/g, "^")
    .trim();
}

function parseExpression(input, variables) {
  const s = normalizeSource(input);
  if (!s) throw new Error("Empty expression.");
  if (s.length > 4000) throw new Error("Expression is too long.");
  let i = 0;
  const vars = variables || {};

  function skip() { while (s[i] && /\s/.test(s[i])) i++; }
  function peek() { skip(); return s[i] || ""; }

  function parseExpr() {
    let left = parseTerm();
    for (;;) {
      const c = peek();
      if (c !== "+" && c !== "-") break;
      i++;
      const right = parseTerm();
      left = c === "+" ? left.add(right) : left.sub(right);
    }
    return left;
  }

  function parseTerm() {
    let left = parsePower();
    for (;;) {
      const c = peek();
      if (c === "*" || c === "/" || (c === "/" && s[i + 1] === "/") || c === "%") {
        if (s[i] === "/" && s[i + 1] === "/") {
          i += 2;
          const right = parsePower();
          if (!left.isInteger() || !right.isInteger()) throw new Error("Integer division // needs integers.");
          if (right.isZero()) throw new Error("Division by zero.");
          const quot = new Q(left.n / right.n, 1n);
          left = quot;
          continue;
        }
        i++;
        const right = parsePower();
        if (c === "*") left = left.mul(right);
        else if (c === "/") left = left.div(right);
        else {
          if (right.isZero()) throw new Error("Division by zero.");
          if (!left.isInteger() || !right.isInteger()) throw new Error("Remainder % needs integers.");
          left = new Q(left.n % right.n, 1n);
        }
        continue;
      }
      break;
    }
    return left;
  }

  function parsePower() {
    const base = parseUnary();
    if (peek() !== "^") return base;
    i++;
    const exp = parsePower();
    return base.pow(exp);
  }

  function parseUnary() {
    const c = peek();
    if (c === "+") { i++; return parseUnary(); }
    if (c === "-") { i++; return parseUnary().neg(); }
    return parsePrimary();
  }

  function parsePrimary() {
    skip();
    const c = s[i];
    if (!c) throw new Error("Unexpected end of expression.");
    if (c === "(") {
      i++;
      const inner = parseExpr();
      skip();
      if (s[i] !== ")") throw new Error("Missing closing parenthesis.");
      i++;
      return maybePercent(inner);
    }
    if (/[0-9.]/.test(c)) {
      const start = i;
      if (s[i] === ".") i++;
      while (/[0-9]/.test(s[i] || "")) i++;
      if (s[start] !== "." && s[i] === ".") {
        i++;
        while (/[0-9]/.test(s[i] || "")) i++;
      }
      if ((s[i] === "e" || s[i] === "E") && /[0-9+-]/.test(s[i + 1] || "")) {
        i++;
        if (s[i] === "+" || s[i] === "-") i++;
        if (!/[0-9]/.test(s[i] || "")) throw new Error("Invalid scientific notation.");
        while (/[0-9]/.test(s[i] || "")) i++;
      }
      return maybePercent(parseNumericLiteral(s.slice(start, i)));
    }
    if (/[A-Za-zπ]/.test(c)) {
      const start = i;
      if (c === "π") i++;
      else while (/[A-Za-z0-9_π]/.test(s[i] || "")) i++;
      const name = s.slice(start, i);
      skip();
      if (s[i] === "(") {
        i++;
        const args = [];
        skip();
        if (s[i] !== ")") {
          for (;;) {
            args.push(parseExpr());
            skip();
            if (s[i] === ",") { i++; continue; }
            break;
          }
        }
        if (s[i] !== ")") throw new Error(`Missing ) after ${name}.`);
        i++;
        return maybePercent(callFunction(name.toLowerCase(), args));
      }
      return maybePercent(lookupName(name));
    }
    throw new Error(`Unexpected character '${c}' at position ${i + 1}.`);
  }

  function maybePercent(value) {
    skip();
    if (s[i] !== "%") return value;
    let j = i + 1;
    while (s[j] && /\s/.test(s[j])) j++;
    const next = s[j] || "";
    // 10%4 and 10 % 4 are remainder. 50% and 15%*2 are percent.
    if (/[0-9.(A-Za-zπ]/.test(next)) return value;
    i++;
    return value.div(new Q(100n, 1n));
  }

  function lookupName(name) {
    if (name === "pi" || name === "π") {
      throw approxError("pi is irrational. Use an approximate function result only when you ask for a decimal approximation explicitly.");
    }
    if (name === "e") {
      throw approxError("e is irrational and is not an exact constant in this engine.");
    }
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    throw new Error(`Unknown name '${name}'.`);
  }

  function callFunction(name, args) {
    if (!FUNCTIONS.has(name)) throw new Error(`Unknown function '${name}'.`);
    if (name === "abs") return need(1, args).abs();
    if (name === "floor") return new Q(floorDiv(need(1, args)), 1n);
    if (name === "ceil") {
      const q = need(1, args);
      const f = floorDiv(q);
      return new Q(q.isInteger() ? f : f + 1n, 1n);
    }
    if (name === "round") {
      const q = need(1, args);
      const doubled = q.mul(new Q(2n, 1n));
      const f = floorDiv(doubled);
      const rounded = (f + (f >= 0n || doubled.isInteger() ? 1n : 0n)) / 2n;
      // half away from zero via floor(n/d + sign/2) style using exact check
      return roundHalfAway(q);
    }
    if (name === "sqrt") return exactSqrt(need(1, args));
    if (name === "cbrt") return exactCbrt(need(1, args));
    if (name === "fact" || name === "factorial") return factorial(need(1, args));
    if (name === "gcd") return need(2, args, (a, b) => {
      if (!a.isInteger() || !b.isInteger()) throw new Error("gcd needs integers.");
      return new Q(gcd(a.n, b.n), 1n);
    });
    if (name === "lcm") return need(2, args, (a, b) => {
      if (!a.isInteger() || !b.isInteger()) throw new Error("lcm needs integers.");
      if (a.isZero() || b.isZero()) return Q.fromBigInt(0n);
      return new Q(mulVerified(a.n < 0n ? -a.n : a.n, (b.n < 0n ? -b.n : b.n) / gcd(a.n, b.n)), 1n);
    });
    if (name === "min") return need(2, args, (a, b) => (a.cmp(b) <= 0 ? a : b));
    if (name === "max") return need(2, args, (a, b) => (a.cmp(b) >= 0 ? a : b));
    if (name === "pow") return need(2, args, (a, b) => a.pow(b));
    if (name === "quo") return need(2, args, (a, b) => {
      if (!a.isInteger() || !b.isInteger()) throw new Error("quo needs integers.");
      if (b.isZero()) throw new Error("Division by zero.");
      return new Q(a.n / b.n, 1n);
    });
    if (name === "rem") return need(2, args, (a, b) => {
      if (!a.isInteger() || !b.isInteger()) throw new Error("rem needs integers.");
      if (b.isZero()) throw new Error("Division by zero.");
      return new Q(a.n % b.n, 1n);
    });
    if (name === "ln" || name === "log" || name === "log10" || name === "log2" || name === "sin" || name === "cos" || name === "tan") {
      return approximateTranscendental(name, args);
    }
    throw new Error(`Unsupported function '${name}'.`);
  }

  const value = parseExpr();
  skip();
  if (i !== s.length) throw new Error(`Unexpected input near '${s.slice(i, i + 16)}'.`);
  return value;
}

function need(count, args, fn) {
  if (args.length !== count) throw new Error(`Expected ${count} argument(s), got ${args.length}.`);
  if (fn) return fn(...args);
  return args[0];
}

function floorDiv(q) {
  if (q.isInteger()) return q.n;
  const quot = q.n / q.d;
  if (q.n < 0n && q.n % q.d !== 0n) return quot - 1n;
  return quot;
}

function roundHalfAway(q) {
  if (q.isInteger()) return q;
  const neg = q.n < 0n;
  const n = neg ? -q.n : q.n;
  const quot = n / q.d;
  const rem = n % q.d;
  const twice = rem * 2n;
  const up = twice >= q.d ? quot + 1n : quot;
  return new Q(neg ? -up : up, 1n);
}

function exactSqrt(q) {
  if (q.isNegative()) throw new Error("Square root of a negative number.");
  const ns = isqrt(q.n);
  const ds = isqrt(q.d);
  if (ns * ns === q.n && ds * ds === q.d) return new Q(ns, ds);
  const err = new Error("SQRT_APPROX");
  err.approx = sqrtDecimal(q, 50);
  err.note = "Not an exact square. 50 significant digits, rounded half away from zero. Not an exact integer.";
  throw err;
}

function exactCbrt(q) {
  if (q.isZero()) return q;
  const neg = q.isNegative();
  const n = neg ? -q.n : q.n;
  const nr = icbrt(n);
  const dr = icbrt(q.d);
  if (nr * nr * nr === n && dr * dr * dr === q.d) return new Q(neg ? -nr : nr, dr);
  throw new Error("Cube root is not exact for this value. Ask for a decimal only when an approximation is acceptable.");
}

function icbrt(n) {
  if (n < 2n) return n;
  let x = n;
  let y = (2n * x + n / (x * x)) / 3n;
  while (y < x) {
    x = y;
    y = (2n * x + n / (x * x)) / 3n;
  }
  while ((x + 1n) * (x + 1n) * (x + 1n) <= n) x++;
  while (x * x * x > n) x--;
  return x;
}

function sqrtDecimal(q, digits) {
  const scale = 10n ** BigInt(digits);
  const scaled = mulVerified(mulVerified(q.n, scale), scale) / q.d;
  let root = isqrt(scaled);
  const rem = scaled - root * root;
  if (rem * 2n >= root * 2n + 1n) root += 1n;
  const neg = false;
  const text = root.toString().padStart(digits + 1, "0");
  const whole = text.slice(0, text.length - digits) || "0";
  const frac = text.slice(text.length - digits).replace(/0+$/, "");
  return (neg ? "-" : "") + (frac ? `${whole}.${frac}` : whole);
}

function factorial(q) {
  if (!q.isInteger() || q.n < 0n) throw new Error("Factorial needs a non-negative integer.");
  if (q.n > 20000n) throw new Error("Factorial argument is too large.");
  let r = 1n;
  for (let k = 2n; k <= q.n; k++) r = mulVerified(r, k);
  return new Q(r, 1n);
}

function approxError(message) {
  const err = new Error(message);
  err.code = "EXACT_ONLY";
  return err;
}

function toNumberLossy(q) {
  if (q.d === 1n) {
    const s = q.n.toString();
    if (s.replace("-", "").length > 15) {
      const neg = s.startsWith("-");
      const digits = neg ? s.slice(1) : s;
      const mantissa = Number(`${digits[0]}.${digits.slice(1, 16)}`);
      const exp = digits.length - 1;
      return { value: (neg ? -mantissa : mantissa) * 10 ** exp, digits: 15 };
    }
  }
  const value = Number(q.n) / Number(q.d);
  if (!Number.isFinite(value)) throw new Error("Value is outside the range of an approximate decimal.");
  return { value, digits: 15 };
}

function approximateTranscendental(name, args) {
  const q = need(name === "log" ? Math.min(args.length, 2) : 1, args);
  if (q.isZero() || (q.isNegative() && (name === "ln" || name === "log" || name === "log10" || name === "log2"))) {
    throw new Error(`${name} is undefined for this input.`);
  }
  const { value } = toNumberLossy(args[0]);
  let out;
  if (name === "ln") out = Math.log(value);
  else if (name === "log10") out = Math.log10(value);
  else if (name === "log2") out = Math.log2(value);
  else if (name === "log") {
    const base = args.length === 2 ? toNumberLossy(args[1]).value : 10;
    if (!(base > 0) || base === 1) throw new Error("Invalid logarithm base.");
    out = Math.log(value) / Math.log(base);
  } else if (name === "sin") out = Math.sin(value);
  else if (name === "cos") out = Math.cos(value);
  else if (name === "tan") out = Math.tan(value);
  if (!Number.isFinite(out)) throw new Error(`${name} did not produce a finite approximation.`);
  const err = new Error("APPROX");
  err.approx = String(Number(out.toPrecision(15)));
  err.note = "Approximation from IEEE-754 double precision (about 15 significant digits), not an exact result. Trig functions use radians.";
  throw err;
}

function evaluateExpression(expression) {
  const src = String(expression ?? "");
  const division = captureTopDivision(src);
  try {
    const q = parseExpression(src);
    return formatExact(q, division);
  } catch (error) {
    if (error.approx) {
      return {
        kind: "approximation",
        exact: null,
        decimal: error.approx,
        independentlyVerified: false,
        note: error.note || "Approximation."
      };
    }
    throw error;
  }
}

function captureTopDivision(src) {
  const s = normalizeSource(src);
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && c === "/" && s[i + 1] !== "/" && s[i - 1] !== "/") {
      const left = s.slice(0, i);
      const right = s.slice(i + 1);
      try {
        const L = parseExpression(left);
        const R = parseExpression(right);
        if (L.isInteger() && R.isInteger()) return { left: L, right: R };
      } catch { /* not a single top-level integer division */ }
      return null;
    }
  }
  return null;
}

function solveLinear(equation) {
  const raw = String(equation ?? "").trim();
  const parts = raw.split("=");
  if (parts.length !== 2) throw new Error("Equation must contain exactly one '='.");
  const expr = `(${parts[0]})-(${parts[1]})`;
  const names = new Set();
  const normalized = normalizeSource(expr);
  const ident = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m;
  while ((m = ident.exec(normalized))) {
    const name = m[1] ? m[0] : m[0];
    const lower = name.toLowerCase();
    if (FUNCTIONS.has(lower) || lower === "pi") continue;
    names.add(name);
  }
  if (names.size !== 1) {
    throw new Error(names.size === 0
      ? "No variable found. This solver handles one named variable, for example 2*x+3=11."
      : "Only one variable is supported.");
  }
  const variable = [...names][0];
  const at = (k) => parseExpression(expr, { [variable]: Q.fromBigInt(BigInt(k)) });
  const f0 = at(0);
  const f1 = at(1);
  const f2 = at(2);
  const coeff = f1.sub(f0);
  const predicted = f0.add(coeff.mul(Q.fromBigInt(2n)));
  if (predicted.cmp(f2) !== 0) {
    throw new Error("This equation is not linear. Only exact linear equations in one variable are solved.");
  }
  if (coeff.isZero()) {
    if (f0.isZero()) return { kind: "infinite-solutions", variable, note: "Both sides are identical." };
    throw new Error("No solution. The variable cancels and the two sides differ.");
  }
  const root = f0.neg().div(coeff);
  const check = parseExpression(expr, { [variable]: root });
  if (!check.isZero()) throw new Error("Internal solve check failed.");
  return {
    kind: root.isInteger() ? "exact-integer" : "exact-rational",
    variable,
    exact: root.isInteger() ? root.n.toString() : fractionString(root),
    decimal: exactDecimal(root),
    independentlyVerified: true
  };
}

module.exports = {
  Q,
  evaluateExpression,
  solveLinear,
  parseExpression,
  mulVerified,
  schoolbookMul,
  MAX_DIGITS
};
