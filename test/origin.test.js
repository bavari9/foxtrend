import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedOrigins } from "../src/lib/server.js";

test("defaults to the requested fawanews origins when no env override is set", () => {
  const origins = getAllowedOrigins(undefined);

  assert.ok(origins.includes("http://www.fawanews.sc"));
  assert.ok(origins.includes("https://www.fawanews.sc"));
  assert.ok(origins.includes("http://fawanews.sc"));
  assert.ok(origins.includes("https://fawanews.sc"));
});
