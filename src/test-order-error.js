const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-order-error-test",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp")
  );
  try {
    await client.connect(transport);
    console.log("Testing a nonexistent order...");
    const result = await client.callTool({
      name: "get_order",
      arguments: { order_id: 999999999 }
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.isError) {
      console.log("PASS: The tool handled the nonexistent order.");
    } else {
      console.log(
        "Review the response: the store returned a successful tool result."
      );
    }
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
});
