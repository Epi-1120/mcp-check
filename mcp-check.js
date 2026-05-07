#!/usr/bin/env node

const { spawn } = require("node:child_process");

function headerEnd(buf) {
  for (let i = 0; i <= buf.length - 4; i += 1) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) {
      return i;
    }
  }
  return -1;
}

function frame(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
    body,
  ]);
}

function send(child, msg) {
  child.stdin.write(frame(msg));
}

function readOne(buf) {
  const pos = headerEnd(buf);
  if (pos === -1) return null;

  const header = buf.subarray(0, pos).toString("ascii");
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) return { err: "no content-length" };

  const start = pos + 4;
  const end = start + Number(match[1]);
  if (buf.length < end) return null;

  return {
    msg: buf.subarray(start, end),
    rest: buf.subarray(end),
  };
}

function run(cmd) {
  if (!cmd) {
    console.error('usage: node mcp-check.js "node server.js"');
    process.exit(1);
  }

  const child = spawn(cmd, {
    shell: true,
    stdio: ["pipe", "pipe", "inherit"],
  });

  let out = Buffer.alloc(0);
  let gotInit = false;
  let done = false;

  send(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-check", version: "0.0.0" },
    },
  });

  child.stdout.on("data", (chunk) => {
    out = Buffer.concat([out, chunk]);

    for (;;) {
      const part = readOne(out);
      if (!part) return;

      if (part.err) {
        console.error(part.err);
        child.kill();
        process.exit(1);
      }

      console.log(part.msg.toString("utf8"));
      out = part.rest;

      if (!gotInit) {
        gotInit = true;
        send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
        send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
        return;
      }

      done = true;
      child.kill();
      return;
    }
  });

  child.on("exit", (code) => {
    if (!done) process.exit(code || 1);
  });
}

if (require.main === module) {
  run(process.argv.slice(2).join(" "));
}

module.exports = { frame, readOne };
