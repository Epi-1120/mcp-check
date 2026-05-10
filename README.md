# mcp-check

Small check for MCP servers that speak over stdio.

It starts a command, sends `initialize`, then asks for `tools/list`. Messages use MCP's stdio line format.

```sh
node mcp-check.js "node server.js"
```

The command prints the two JSON-RPC responses it gets back. If the server never answers, it gives up after five seconds.

```sh
npm test
```
