#!/usr/bin/env node

const { spawn } = require("node:child_process");

const cmd = process.argv.slice(2).join(" ");

if (!cmd) {
  console.error('usage: node mcp-check.js "node server.js"');
  process.exit(1);
}

const child = spawn(cmd, {
  shell: true,
  stdio: ["pipe", "pipe", "inherit"],
});

let out = "";
let gotInit = false;
let done = false;

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function readOne(buf) {
  const headerEnd = buf.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const header = buf.slice(0, headerEnd);
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) return { err: "no content-length" };

  const start = headerEnd + 4;
  const end = start + Number(match[1]);
  if (buf.length < end) return null;

  return {
    msg: buf.slice(start, end),
    rest: buf.slice(end),
  };
}

send({
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
  out += chunk.toString("utf8");

  for (;;) {
    const part = readOne(out);
    if (!part) return;

    if (part.err) {
      console.error(part.err);
      child.kill();
      process.exit(1);
    }

    console.log(part.msg);
    out = part.rest;

    if (!gotInit) {
      gotInit = true;
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
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
