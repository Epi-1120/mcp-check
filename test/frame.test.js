const test = require("node:test");
const assert = require("node:assert/strict");

const { frame, readOne } = require("../mcp-check.js");

function json(part) {
  return JSON.parse(part.msg.toString("utf8"));
}

test("one frame", () => {
  const msg = { jsonrpc: "2.0", id: 1, result: { ok: true } };
  const got = readOne(frame(msg));

  assert.deepEqual(json(got), msg);
  assert.equal(got.rest.length, 0);
});

test("split body", () => {
  const buf = frame({ jsonrpc: "2.0", id: 2, result: { tools: [] } });
  const cut = buf.length - 5;

  assert.equal(readOne(buf.subarray(0, cut)), null);

  const got = readOne(Buffer.concat([buf.subarray(0, cut), buf.subarray(cut)]));
  assert.equal(json(got).id, 2);
});

test("two frames", () => {
  const a = { jsonrpc: "2.0", id: 1, result: {} };
  const b = { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "ping" }] } };
  const got = readOne(Buffer.concat([frame(a), frame(b)]));

  assert.deepEqual(json(got), a);
  assert.deepEqual(json(readOne(got.rest)), b);
});

test("utf8 body", () => {
  const msg = { jsonrpc: "2.0", id: 3, result: { name: "測試" } };
  const got = readOne(frame(msg));

  assert.deepEqual(json(got), msg);
});

test("bad header", () => {
  const got = readOne(Buffer.from("X: 1\r\n\r\n{}"));

  assert.equal(got.err, "no content-length");
});
