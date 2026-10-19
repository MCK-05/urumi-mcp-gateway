const { Client, StreamableHTTPClientTransport } =
  require("@modelcontextprotocol/client");
async function main() {
  const url = process.env.MCP_URL;
  const toolName = process.env.TOOL_NAME;
  if (!url || !toolName) {
    throw new Error("Set MCP_URL and TOOL_NAME before running this test.");
  }
  const client = new Client({
    name: "urumi-upstream-test-client",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  try {
    await client.connect(transport);
    console.log(`Connected to ${url}`);
    const result = await client.listTools();
    console.log("Discovered tools:", result.tools.map(t => t.name));
    const tool = result.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Expected tool "${toolName}" was not found.`);
    }
    const callResult = await client.callTool({
      name: toolName,
      arguments: {}
    });
    console.log("Tool result:");
    console.log(JSON.stringify(callResult, null, 2));
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error("Upstream test failed:", error);
  process.exitCode = 1;
});
