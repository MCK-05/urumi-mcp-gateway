const { Client } = require("@modelcontextprotocol/client");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-local-test-client",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp")
  );
  try {
    await client.connect(transport);
    console.log("\nConnected to the MCP server.");
    const tools = await client.listTools();
    console.log("\nAvailable tools:");
    console.log(JSON.stringify(tools, null, 2));
    const result = await client.callTool({
      name: "get_gateway_status",
      arguments: {}
    });
    console.log("\nTool call result:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("MCP test failed:", error);
  process.exitCode = 1;
});
