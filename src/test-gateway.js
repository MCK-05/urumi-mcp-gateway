const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-gateway-test-client",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp")
  );
  try {
    await client.connect(transport);
    console.log("Connected to gateway.");
    const result = await client.listTools();
    console.log("Gateway tools:", result.tools.map(t => t.name));
    for (const name of [
      "list_demo_products",
      "create_demo_product",
      "get_inventory_summary"
    ]) {
      if (!result.tools.some(t => t.name === name)) {
        throw new Error(`Missing gateway tool: ${name}`);
      }
    }
    const productTool = result.tools.find(
      t => t.name === "create_demo_product"
    );
    console.log("\nProduct tool input schema:");
    console.log(JSON.stringify(productTool.inputSchema, null, 2));
    const calls = [
      {
        name: "list_demo_products",
        arguments: {}
      },
      {
        name: "create_demo_product",
        arguments: {
          name: "Test Notebook",
          price: 149.5
        }
      },
      {
        name: "get_inventory_summary",
        arguments: {}
      }
    ];
    for (const request of calls) {
      const callResult = await client.callTool(request);
      console.log(`\nResult from ${request.name}:`);
      console.log(JSON.stringify(callResult, null, 2));
      if (callResult.isError) {
        throw new Error(`Tool call failed: ${request.name}`);
      }
    }
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error("Gateway test failed:", error);
  process.exitCode = 1;
});
