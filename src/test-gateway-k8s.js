
const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");

async function main() {
  const client = new Client({
    name: "urumi-gateway-test-client",
    version: "1.0.0"
  });

  const apiKey = process.env.URUMI_API_KEY;
  if (!apiKey) {
    throw new Error("Set URUMI_API_KEY in the environment before running this test.");
  }
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp"),
    {
      authProvider: {
        token: async () => apiKey
      }
    }
  );

  try {
    await client.connect(transport);
    console.log("Connected to gateway.");

    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name);

    console.log("Gateway tools:", names);

    const requiredTools = [
      "list_demo_products",
      "create_demo_product",
      "get_inventory_summary",
      "list_products",
      "create_product",
      "list_orders",
      "get_order",
      "update_order_status"
    ];

    for (const name of requiredTools) {
      if (!names.includes(name)) {
        throw new Error(`Missing gateway tool: ${name}`);
      }
      console.log(`PASS: Found ${name}`);
    }

    console.log("\nCalling WooCommerce list_products...");

    const productsResult = await client.callTool({
      name: "list_products",
      arguments: { page: 1, limit: 10 }
    });

    console.log(
      "Products result:",
      JSON.stringify(productsResult, null, 2)
    );

    if (productsResult.isError) {
      throw new Error("WooCommerce list_products failed.");
    }

    console.log("\nCalling WooCommerce list_orders...");

    const ordersResult = await client.callTool({
      name: "list_orders",
      arguments: { page: 1, limit: 5 }
    });

    console.log(
      "Orders result:",
      JSON.stringify(ordersResult, null, 2)
    );

    if (ordersResult.isError) {
      throw new Error("WooCommerce list_orders failed.");
    }

    console.log("\nPASS: Product and order listing calls succeeded.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Gateway test failed:", error.message);
  process.exitCode = 1;
});
