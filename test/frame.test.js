const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { line, readOne } = require("../mcp-check.js");

function json(part) {
  return JSON.parse(part.msg.toString("utf8"));
}

test("one line", () => {
  const msg = { jsonrpc: "2.0", id: 1, result: { ok: true } };
  const got = readOne(line(msg));

  assert.deepEqual(json(got), msg);
  assert.equal(got.rest.length, 0);
});

test("split line", () => {
  const buf = line({ jsonrpc: "2.0", id: 2, result: { tools: [] } });
  const cut = buf.length - 2;

  assert.equal(readOne(buf.subarray(0, cut)), null);

  const got = readOne(Buffer.concat([buf.subarray(0, cut), buf.subarray(cut)]));
  assert.equal(json(got).id, 2);
});

test("two lines", () => {
  const a = { jsonrpc: "2.0", id: 1, result: {} };
  const b = { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "ping" }] } };
  const got = readOne(Buffer.concat([line(a), line(b)]));

  assert.deepEqual(json(got), a);
  assert.deepEqual(json(readOne(got.rest)), b);
});

test("utf8 line", () => {
  const msg = { jsonrpc: "2.0", id: 3, result: { name: "測試" } };
  const got = readOne(line(msg));

  assert.deepEqual(json(got), msg);
});

test("bad line", () => {
  const got = readOne(Buffer.from("\n"));

  assert.equal(got.err, "blank line");
});

test("talks to a tiny server", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-check-"));
  const server = path.join(dir, "server.js");

  fs.writeFileSync(
    server,
    `#!/usr/bin/env node
const { stdin, stdout } = process;
let buf = Buffer.alloc(0);

function readLines() {
  for (;;) {
    const nl = buf.indexOf(10);
    if (nl === -1) return;

    let end = nl;
    if (end > 0 && buf[end - 1] === 13) end -= 1;

    const raw = buf.subarray(0, end).toString("utf8");
    buf = buf.subarray(nl + 1);
    if (!raw) continue;

    const msg = JSON.parse(raw);

    if (msg.method === "initialize") {
      stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: { capabilities: {} }
      }) + "\\n");
      continue;
    }

    if (msg.method === "tools/list") {
      stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: [{ name: "ping" }] }
      }) + "\\n");
    }
  }
}

stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  readLines();
});
stdin.resume();
`
  );

  const cmd = `${JSON.stringify(process.execPath)} ${JSON.stringify(server)}`;
  const cli = spawn(process.execPath, [path.join(__dirname, "..", "mcp-check.js"), cmd], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  let err = "";
  cli.stdout.on("data", (chunk) => {
    out += chunk.toString("utf8");
  });
  cli.stderr.on("data", (chunk) => {
    err += chunk.toString("utf8");
  });

  const code = await new Promise((resolve, reject) => {
    cli.once("error", reject);
    cli.once("close", resolve);
  });

  try {
    assert.equal(code, 0, err);
    const lines = out.trim().split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s));

    assert.equal(lines.length, 2, out);
    assert.equal(lines[0].id, 1);
    assert.equal(lines[1].id, 2);
    assert.deepEqual(lines[1].result.tools, [{ name: "ping" }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
