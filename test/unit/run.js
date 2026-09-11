#!/usr/bin/env node
// Runs every *.test.js in this directory. No framework: the engine is pure, so
// the whole suite is assertions over return values and finishes in a blink.

const fs   = require("fs");
const path = require("path");

let passed = 0, failed = 0;
const failures = [];
let suite = "";

global.describe = (name, fn) => { suite = name; fn(); suite = ""; };

global.it = (name, fn) => {
  const label = (suite ? suite + " › " : "") + name;
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push({ label, message: e && e.message ? e.message : String(e) });
  }
};

function fail(msg) { throw new Error(msg); }

global.eq = (actual, expected, note) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) fail((note ? note + ": " : "") + "expected " + b + ", got " + a);
};

global.near = (actual, expected, tol, note) => {
  if (!(Math.abs(actual - expected) <= (tol === undefined ? 0.001 : tol))) {
    fail((note ? note + ": " : "") + "expected ~" + expected + ", got " + actual);
  }
};

global.ok = (cond, note) => { if (!cond) fail(note || "expected truthy"); };

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith(".test.js")).sort();
if (!files.length) {
  console.error("no test files found in " + dir);
  process.exit(1);
}
files.forEach(f => require(path.join(dir, f)));

console.log("");
failures.forEach(f => {
  console.log("  ✗ " + f.label);
  console.log("      " + f.message);
});
console.log("  " + passed + " passed" + (failed ? ", " + failed + " failed" : "") +
            "  (" + files.length + " file" + (files.length === 1 ? "" : "s") + ")");
process.exit(failed ? 1 : 0);
