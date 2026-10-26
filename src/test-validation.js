const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-validation-test",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp")
  );
  try {
    await client.connect(transport);
    console.log("Test 1: Invalid order ID");
    const result = await client.callTool({
      name: "get_order",
      arguments: { order_id: 0 }
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.isError) {
      throw new Error("Expected invalid order ID to be rejected.");
    }
    console.log("PASS: Invalid order ID was rejected.");
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("Validation test failed:", error.message);
  process.exitCode = 1;
});
