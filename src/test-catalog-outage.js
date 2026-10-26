const { Client } = require("@modelcontextprotocol/client");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/client");
async function main() {
  const apiKey = process.env.URUMI_API_KEY;
  if (!apiKey) throw new Error("URUMI_API_KEY is not set");
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp"),
    { authProvider: { token: async () => apiKey } }
  );
  const client = new Client(
    { name: "catalog-outage-test", version: "1.0.0" },
    { capabilities: {} }
  );
  try {
    await client.connect(transport);
    console.log("Connected to gateway.");
    const result = await client.callTool({
      name: "list_demo_products",
      arguments: {}
    });
    console.log("Catalog tool response:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error("Client request failed:", error.message);
  process.exitCode = 1;
});
