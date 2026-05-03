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
  const headerEnd = out.indexOf("\r\n\r\n");
  if (headerEnd === -1) return;

  const header = out.slice(0, headerEnd);
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) {
    console.error("no content-length");
    child.kill();
    process.exit(1);
  }

  const start = headerEnd + 4;
  const end = start + Number(match[1]);
  if (out.length < end) return;

  const msg = out.slice(start, end);
  console.log(msg);
  out = out.slice(end);

  if (!gotInit) {
    gotInit = true;
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    return;
  }

  done = true;
  child.kill();
});

child.on("exit", (code) => {
  if (!done) process.exit(code || 1);
});
