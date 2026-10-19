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
      "get_inventory_summary"
    ]) {
      if (!result.tools.some(t => t.name === name)) {
        throw new Error(`Missing gateway tool: ${name}`);
      }
      const call = await client.callTool({
        name,
        arguments: {}
      });
      console.log(`Result from ${name}:`);
      console.log(JSON.stringify(call, null, 2));
    }
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error("Gateway test failed:", error);
  process.exitCode = 1;
});
