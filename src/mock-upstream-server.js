const express = require("express");
const { createMcpHandler, McpServer } = require("@modelcontextprotocol/server");
const { toNodeHandler } = require("@modelcontextprotocol/node");
const app = express();
const PORT = Number(process.env.PORT || 3101);
const SERVER_NAME = process.env.UPSTREAM_NAME || "catalog-upstream";
const TOOL_NAME = process.env.TOOL_NAME || "list_demo_products";
app.use(express.json());
const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({
    name: SERVER_NAME,
    version: "1.0.0"
  });
  server.registerTool(
    TOOL_NAME,
    {
      description: `A test tool provided by ${SERVER_NAME}.`,
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            upstream: SERVER_NAME,
            tool: TOOL_NAME,
            status: "ok",
            items: ["demo-item-1", "demo-item-2"]
          })
        }
      ]
    })
  );
  return server;
});
const nodeMcpHandler = toNodeHandler(mcpHandler);
app.get("/health", (req, res) => {
  res.json({
    server: SERVER_NAME,
    status: "healthy"
  });
});
app.all("/mcp", (req, res) => {
  void nodeMcpHandler(req, res, req.body);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SERVER_NAME} running on port ${PORT}`);
});
