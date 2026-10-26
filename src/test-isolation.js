const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "catalog-isolation-test",
    version: "1.0.0"
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("http://localhost:3002/mcp")
      )
    );
    const tools = await client.listTools();
    console.log("Available tools:", tools.tools.map(t => t.name));
    const result = await client.callTool({
      name: "list_demo_products",
      arguments: {}
    });
    console.log("Catalog result:", JSON.stringify(result, null, 2));
    if (result.isError) {
      throw new Error("Catalog tool call failed");
    }
    console.log("PASS: Catalog tool still works.");
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error("Isolation test failed:", error);
  process.exitCode = 1;
});
