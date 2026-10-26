
const express = require("express");
const {
  createMcpHandler,
  McpServer,
  fromJsonSchema
} = require("@modelcontextprotocol/server");
const { toNodeHandler } = require("@modelcontextprotocol/node");

const app = express();

const PORT = Number(process.env.PORT || 3103);
const SERVER_NAME = "woocommerce-upstream";
const STORE_API_URL =
  process.env.WOOCOMMERCE_API_URL ||
  "http://store-wordpress/wp-json/wc/v3";

app.use(express.json());

async function wooRequest(path, { method = "GET", body } = {}) {
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("WooCommerce API credentials are not configured.");
  }

  // Accept only relative API paths, not arbitrary URLs.
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..")
  ) {
    throw new Error("Invalid WooCommerce API path.");
  }

  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`
  ).toString("base64");

  const response = await fetch(`${STORE_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "X-Forwarded-Proto": "https",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Keep credentials and raw API error details out of tool responses.
    throw new Error(`WooCommerce API returned HTTP ${response.status}.`);
  }

  return data;
}


async function fetchWooCommerceProducts({ page, limit }) {
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("WooCommerce API credentials are not configured.");
  }

  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`
  ).toString("base64");

  const url = new URL(`${STORE_API_URL}/products`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(limit));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
      "X-Forwarded-Proto": "https",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    // Do not include request headers or credentials in errors.
    throw new Error(
      `WooCommerce API returned HTTP ${response.status}.`
    );
  }

  const products = await response.json();

  if (!Array.isArray(products)) {
    throw new Error("WooCommerce returned an unexpected response.");
  }

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    status: product.status
  }));
}

const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({
    name: SERVER_NAME,
    version: "1.0.0"
  });

  server.registerTool(
    "list_products",
    {
      description:
        "Lists real products from the connected WooCommerce store. " +
        "Returns product IDs, names, prices, and publication statuses.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          page: {
            type: "integer",
            description: "Page number, starting at 1.",
            default: 1,
            minimum: 1
          },
          limit: {
            type: "integer",
            description: "Maximum number of products to return (1–20).",
            default: 10,
            minimum: 1,
            maximum: 20
          }
        },
        additionalProperties: false
      })
    },
    async ({ page = 1, limit = 10 }) => {
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Invalid input. Page must be at least 1 and limit must be between 1 and 20."
            }
          ]
        };
      }

      try {
        const products = await fetchWooCommerceProducts({
          page,
          limit
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ok",
                count: products.length,
                products
              })
            }
          ]
        };
      } catch (error) {
        console.error("WooCommerce product request failed:", error.message);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Could not retrieve products from WooCommerce. Check the server configuration and API connectivity."
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "create_product",
    {
      description:
        "Creates a WooCommerce product as a draft by default. " +
        "Returns the new product ID, name, price, and status.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Product name (1–100 characters).",
            minLength: 1,
            maxLength: 100
          },
          price: {
            type: "number",
            description: "Non-negative regular price.",
            minimum: 0
          },
          status: {
            type: "string",
            enum: ["draft", "publish"],
            description:
              "Product status. Defaults to draft; publish only when explicitly requested."
          }
        },
        required: ["name", "price"],
        additionalProperties: false
      })
    },
    async ({ name, price, status = "draft" }) => {
      const cleanName = typeof name === "string" ? name.trim() : "";

      if (
        cleanName.length < 1 ||
        cleanName.length > 100 ||
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0 ||
        !["draft", "publish"].includes(status)
      ) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Invalid input. Provide a product name of 1–100 characters, a non-negative finite price, and a valid status."
            }
          ]
        };
      }

      try {
        const product = await wooRequest("/products", {
          method: "POST",
          body: {
            name: cleanName,
            type: "simple",
            regular_price: price.toFixed(2),
            status
          }
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ok",
                product: {
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  status: product.status
                }
              })
            }
          ]
        };
      } catch (error) {
        console.error("WooCommerce create product failed:", error.message);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Could not create the WooCommerce product. Check API permissions and connectivity."
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "list_orders",
    {
      description:
        "Lists recent WooCommerce orders with limited, non-sensitive fields.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          page: {
            type: "integer",
            description: "Page number, starting at 1.",
            minimum: 1,
            default: 1
          },
          limit: {
            type: "integer",
            description: "Number of orders to return (1–20).",
            minimum: 1,
            maximum: 20,
            default: 10
          }
        },
        additionalProperties: false
      })
    },
    async ({ page = 1, limit = 10 }) => {
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Invalid input. Page must be at least 1 and limit must be between 1 and 20."
            }
          ]
        };
      }

      try {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(limit),
          orderby: "date",
          order: "desc"
        });

        const orders = await wooRequest(`/orders?${query}`);

        if (!Array.isArray(orders)) {
          throw new Error("Unexpected WooCommerce response.");
        }

        const safeOrders = orders.map((order) => ({
          id: order.id,
          status: order.status,
          currency: order.currency,
          total: order.total,
          date_created: order.date_created
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ok",
                count: safeOrders.length,
                orders: safeOrders
              })
            }
          ]
        };
      } catch (error) {
        console.error("WooCommerce list orders failed:", error.message);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Could not retrieve WooCommerce orders. Check API permissions and connectivity."
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "get_order",
    {
      description:
        "Retrieves a WooCommerce order by ID and returns limited, non-sensitive fields.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          order_id: {
            type: "integer",
            description: "The numeric WooCommerce order ID.",
            minimum: 1
          }
        },
        required: ["order_id"],
        additionalProperties: false
      })
    },
    async ({ order_id }) => {
      if (!Number.isSafeInteger(order_id) || order_id < 1) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Invalid input. Order ID must be a positive integer."
            }
          ]
        };
      }

      try {
        const order = await wooRequest(`/orders/${order_id}`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ok",
                order: {
                  id: order.id,
                  status: order.status,
                  currency: order.currency,
                  total: order.total,
                  date_created: order.date_created,
                  line_items: (order.line_items || []).map((item) => ({
                    product_id: item.product_id,
                    name: item.name,
                    quantity: item.quantity,
                    total: item.total
                  }))
                }
              })
            }
          ]
        };
      } catch (error) {
        console.error("WooCommerce get order failed:", error.message);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Could not retrieve the order. Verify the order ID and API permissions."
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "update_order_status",
    {
      description:
        "Updates a WooCommerce order status after validating the order ID and allowed status.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          order_id: {
            type: "integer",
            description: "The numeric WooCommerce order ID.",
            minimum: 1
          },
          status: {
            type: "string",
            description: "The requested order status.",
            enum: [
              "pending",
              "processing",
              "on-hold",
              "completed",
              "cancelled",
              "refunded"
            ]
          }
        },
        required: ["order_id", "status"],
        additionalProperties: false
      })
    },
    async ({ order_id, status }) => {
      const allowedStatuses = [
        "pending",
        "processing",
        "on-hold",
        "completed",
        "cancelled",
        "refunded"
      ];

      if (
        !Number.isSafeInteger(order_id) ||
        order_id < 1 ||
        !allowedStatuses.includes(status)
      ) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Invalid input. Provide a positive order ID and an allowed order status."
            }
          ]
        };
      }

      try {
        const order = await wooRequest(`/orders/${order_id}`, {
          method: "PUT",
          body: { status }
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "ok",
                order: {
                  id: order.id,
                  status: order.status,
                  total: order.total,
                  currency: order.currency
                }
              })
            }
          ]
        };
      } catch (error) {
        console.error("WooCommerce update order failed:", error.message);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Could not update the order. Verify the order ID, current order state, and API permissions."
            }
          ]
        };
      }
    }
  );

  return server;
});

const nodeMcpHandler = toNodeHandler(mcpHandler);

app.get("/health", (req, res) => {
  res.json({
    server: SERVER_NAME,
    status: "healthy"
  });
});

app.all("/mcp", (req, res) => {
  void nodeMcpHandler(req, res, req.body);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SERVER_NAME} running on port ${PORT}`);
});
