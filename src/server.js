
const express = require("express");
const {
  createMcpHandler,
  McpServer
} = require("@modelcontextprotocol/server");
const { toNodeHandler } = require("@modelcontextprotocol/node");
const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

const UPSTREAMS = [
  {
    name: "catalog-upstream",
    url: process.env.CATALOG_MCP_URL || "http://localhost:3101/mcp"
  },
  {
    name: "inventory-upstream",
    url: process.env.INVENTORY_MCP_URL || "http://localhost:3102/mcp"
  }
];

async function buildGatewayServer() {
  const server = new McpServer({
    name: "urumi-mcp-gateway",
    version: "1.0.0"
  });

  const connectedClients = [];
  const registeredTools = new Set();

  for (const upstream of UPSTREAMS) {
    const client = new Client({
      name: "urumi-gateway-upstream-client",
      version: "1.0.0"
    });

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(upstream.url)
      );

      await client.connect(transport);
      connectedClients.push(client);

      const result = await client.listTools();

      for (const tool of result.tools) {
        if (registeredTools.has(tool.name)) {
          console.warn(
            `Skipping duplicate tool "${tool.name}" from ${upstream.name}`
          );
          continue;
        }

        // The current mock tools require no input arguments.
        server.registerTool(
          tool.name,
          {
            description:
              tool.description || `Tool provided by ${upstream.name}.`,
            inputSchema: {}
          },
          async (args) => {
            try {
              return await client.callTool({
                name: tool.name,
                arguments: args
              });
            } catch (error) {
              console.error(
                `Tool "${tool.name}" failed on ${upstream.name}:`,
                error.message
              );

              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Upstream "${upstream.name}" is unavailable. Please retry later.`
                  }
                ]
              };
            }
          }
        );

        registeredTools.add(tool.name);
      }

      console.log(
        `Discovered ${result.tools.length} tool(s) from ${upstream.name}`
      );
    } catch (error) {
      console.error(
        `Could not connect to ${upstream.name}: ${error.message}`
      );

      try {
        await client.close();
      } catch {
        // Ignore cleanup errors for an unavailable upstream.
      }
    }
  }

  // Close upstream connections when the request-scoped gateway server closes.
  const originalClose = server.close.bind(server);

  server.close = async () => {
    try {
      await originalClose();
    } finally {
      await Promise.allSettled(
        connectedClients.map((client) => client.close())
      );
    }
  };

  return server;
}

const mcpHandler = createMcpHandler(buildGatewayServer);
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
    mcp: "configured",
    upstreams: UPSTREAMS.length
  });
});

app.all("/mcp", (req, res) => {
  void nodeMcpHandler(req, res, req.body);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
