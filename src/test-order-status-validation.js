const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-order-status-validation",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp")
  );
  try {
    await client.connect(transport);
    console.log("Testing invalid order status...");
    const result = await client.callTool({
      name: "update_order_status",
      arguments: {
        order_id: 999999999,
        status: "invalid-status"
      }
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.isError) {
      console.log("PASS: Invalid status was rejected.");
    } else {
      throw new Error("Expected the invalid status to be rejected.");
    }
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("Validation test failed:", error.message);
  process.exitCode = 1;
});
