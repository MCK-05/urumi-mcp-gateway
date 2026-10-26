const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-create-product-test",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp")
  );
  try {
    await client.connect(transport);
    console.log("Creating one draft test product...");
    const result = await client.callTool({
      name: "create_product",
      arguments: {
        name: "MCP Gateway Test Draft",
        price: 10,
        status: "draft"
      }
    });
    console.log("Create product result:");
    console.log(JSON.stringify(result, null, 2));
    if (result.isError) {
      throw new Error("WooCommerce rejected the draft product.");
    }
    console.log("\nPASS: Draft product creation call succeeded.");
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("Create product test failed:", error.message);
  process.exitCode = 1;
});
