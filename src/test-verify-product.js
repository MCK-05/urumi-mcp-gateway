const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");
async function main() {
  const client = new Client({
    name: "urumi-product-verification",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3002/mcp")
  );
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "list_products",
      arguments: { page: 1, limit: 10 }
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.isError) {
      throw new Error("Product listing failed.");
    }
    const textContent = result.content?.find(
      (item) => item.type === "text"
    )?.text;
    const data = JSON.parse(textContent || "{}");
    const product = data.products?.find(
      (item) => item.id === 14
    );
    if (!product) {
      console.log(
        "Product ID 14 was not in this page. We may need to check pagination or draft visibility."
      );
      return;
    }
    console.log("Verified product:", product);
    if (
      product.name === "MCP Gateway Test Draft" &&
      product.status === "draft"
    ) {
      console.log("PASS: Created draft product verified.");
    } else {
      throw new Error("Product details did not match expectations.");
    }
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
});
