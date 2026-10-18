const express = require("express");
const { createMcpHandler, McpServer } = require("@modelcontextprotocol/server");
const { toNodeHandler } = require("@modelcontextprotocol/node");
const z = require("zod/v4");
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
// Register the initial MCP test tool.
const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({
    name: "urumi-mcp-gateway",
    version: "1.0.0"
  });
  server.registerTool(
    "get_gateway_status",
    {
      description: "Returns the current status of the Urumi MCP Gateway.",
      inputSchema: {}
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              service: "urumi-mcp-gateway",
              status: "running",
              message: "The MCP test tool is working."
            })
          }
        ]
      };
    }
  );
  return server;
});
const nodeMcpHandler = toNodeHandler(mcpHandler);
app.get("/", (req, res) => {
  res.json({
    message: "Urumi MCP Gateway project is starting!",
    status: "running"
  });
});
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});
app.get("/api/status", (req, res) => {
  res.status(200).json({
    service: "urumi-mcp-gateway",
    status: "running",
    api: "available",
    mcp: "configured"
  });
});
app.all("/mcp", (req, res) => {
  void nodeMcpHandler(req, res, req.body);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
