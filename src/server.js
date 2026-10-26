
const express = require("express");
const apiKeyStore = require("./api-key-store");
const auditLog = require("./audit-log");
const {
  createMcpHandler,
  McpServer,
  fromJsonSchema
} = require("@modelcontextprotocol/server");
const { toNodeHandler } = require("@modelcontextprotocol/node");
const {
  Client,
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/client");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

const UPSTREAMS = [
  {
    name: "catalog-upstream",
    url: process.env.CATALOG_MCP_URL || "http://localhost:3101/mcp"
  },
  {
    name: "inventory-upstream",
    url: process.env.INVENTORY_MCP_URL || "http://localhost:3102/mcp"
  },
  {
    name: "woocommerce-upstream",
    url: process.env.WOOCOMMERCE_MCP_URL || "http://localhost:3103/mcp"
  }
];
async function buildGatewayServer(context)  {
  const authenticatedUser =
    context?.requestInfo?.headers.get("x-urumi-authenticated-user") ||
    "unknown";
  const server = new McpServer({
    name: "urumi-mcp-gateway",
    version: "1.0.0"
  });

  const connectedClients = [];
  const registeredTools = new Set();

  for (const upstream of UPSTREAMS) {
    const client = new Client({
      name: "urumi-gateway-upstream-client",
      version: "1.0.0"
    });

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(upstream.url)
      );

      await client.connect(transport);
      connectedClients.push(client);

      const result = await client.listTools();

      for (const tool of result.tools) {
        if (registeredTools.has(tool.name)) {
          console.warn(
            `Skipping duplicate tool "${tool.name}" from ${upstream.name}`
          );
          continue;
        }

        // The current mock tools require no input arguments.
        server.registerTool(
          tool.name,
          {
            description:
              tool.description || `Tool provided by ${upstream.name}.`,
            inputSchema: fromJsonSchema(
            tool.inputSchema || {
              type: "object",
              properties: {}
              }
            )
          },

          async (args) => {
  const startedAt = Date.now();
  let status = "error";

  try {
    const result = await client.callTool({
      name: tool.name,
      arguments: args
    });

    status = result?.isError ? "error" : "success";
    return result;
  } catch (error) {
    console.error(
      `Tool "${tool.name}" failed on ${upstream.name}:`,
      error.message
    );

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Upstream "${upstream.name}" is unavailable. Please retry later.`
        }
      ]
    };
  } finally {
    try {
      await auditLog.recordToolCall({
        userId: authenticatedUser,
        toolName: tool.name,
        status,
        durationMs: Date.now() - startedAt
      });
    } catch (auditError) {
      // Audit failures must not expose secrets or replace the tool result.
      console.error("Audit logging failed:", auditError.message);
    }
  }
},

        );

        registeredTools.add(tool.name);
      }

      console.log(
        `Discovered ${result.tools.length} tool(s) from ${upstream.name}`
      );
    } catch (error) {
      console.error(
        `Could not connect to ${upstream.name}: ${error.message}`
      );

      try {
        await client.close();
      } catch {
        // Ignore cleanup errors for an unavailable upstream.
      }
    }
  }

  // Close upstream connections when the request-scoped gateway server closes.
  const originalClose = server.close.bind(server);

  server.close = async () => {
    try {
      await originalClose();
    } finally {
      await Promise.allSettled(
        connectedClients.map((client) => client.close())
      );
    }
  };

  return server;
}

const mcpHandler = createMcpHandler(buildGatewayServer);
const nodeMcpHandler = toNodeHandler(mcpHandler);

app.get("/", (req, res) => {
  res.json({
    message: "Urumi MCP Gateway project is starting!",
    status: "running"
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

app.get("/api/status", (req, res) => {
  res.status(200).json({
    service: "urumi-mcp-gateway",
    status: "running",
    api: "available",
    mcp: "configured",
    upstreams: UPSTREAMS.length
  });
});

app.all("/mcp", async (req, res) => {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!match) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "A valid API key is required."
    });
  }
  try {
    const apiKeyRecord = await apiKeyStore.validateApiKey(match[1]);
    if (!apiKeyRecord) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "A valid API key is required."
      });
    }
    req.apiKeyUser = apiKeyRecord.userId;
    req.headers["x-urumi-authenticated-user"] = apiKeyRecord.userId;
    void nodeMcpHandler(req, res, req.body);
  } catch (error) {
    console.error("API-key validation failed:", error.message);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
});


const teamStore = require("./team-store");
const cookieName = "urumi_session";
function readSessionToken(req) {
  const cookies = String(req.headers.cookie || "").split(";").map(v => v.trim());
  const entry = cookies.find(v => v.startsWith(cookieName + "="));
  return entry ? decodeURIComponent(entry.slice(cookieName.length + 1)) : null;
}
async function requireUser(req, res, next) {
  try {
    const user = await teamStore.authenticate(readSessionToken(req));
    if (!user) return res.status(401).json({ error: "Authentication required." });
    req.dashboardUser = user;
    next();
  } catch (error) {
    console.error("Dashboard authentication failed:", error.message);
    res.status(500).json({ error: "Authentication service unavailable." });
  }
}
function requireAdmin(req, res, next) {
  if (req.dashboardUser?.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
}
void teamStore.init().then(() => teamStore.bootstrapAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD))
  .then(created => { if (created) console.log("Initial dashboard administrator created from environment configuration."); })
  .catch(error => console.error("Team store initialization failed:", error.message));

app.post("/api/auth/login", async (req, res) => {
  try {
    const result = await teamStore.login(req.body?.email, req.body?.password);
    if (!result) return res.status(401).json({ error: "Invalid email or password." });
    setSessionCookie(res, result.token);
    res.json({ user: result.user });
  } catch (error) {
    console.error("Login failed:", error.message);
    res.status(500).json({ error: "Login failed." });
  }
});
app.get("/api/auth/me", requireUser, (req, res) => res.json({ user: req.dashboardUser }));
app.post("/api/auth/logout", async (req, res) => {
  await teamStore.logout(readSessionToken(req));
  res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.status(204).end();
});
app.post("/api/team/invites", requireUser, requireAdmin, async (req, res) => {
  try { res.status(201).json(await teamStore.createInvite(req.body?.email, req.body?.role || "member")); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/team/accept-invite", async (req, res) => {
  try { res.status(201).json(await teamStore.acceptInvite(req.body?.token, req.body?.password)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.get("/api/team/users", requireUser, requireAdmin, async (req, res) => res.json({ users: await teamStore.listUsers() }));
app.patch("/api/team/users/:id", requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.disabled !== "boolean") return res.status(400).json({ error: "A valid user ID and disabled boolean are required." });
  const changed = await teamStore.setUserDisabled(id, req.body.disabled);
  res.json({ updated: changed });
});
app.get("/api/keys", requireUser, requireAdmin, async (req, res) => res.json({ keys: await apiKeyStore.listApiKeys() }));
app.post("/api/keys", requireUser, requireAdmin, async (req, res) => {
  try {
    const result = await apiKeyStore.issueApiKey(String(req.body?.userId || ""));
    res.status(201).json({ id: result.id, userId: result.userId, apiKey: result.apiKey, warning: "Copy this key now. It is shown only once." });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/keys/:id/revoke", requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid key ID." });
  res.json({ revoked: await apiKeyStore.revokeApiKey(id) });
});
app.get("/api/audit", requireUser, requireAdmin, async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  res.json({ events: await auditLog.listAuditLogs(limit) });
});
app.get("/api/upstreams", requireUser, async (req, res) => {
  res.json({ upstreams: UPSTREAMS.map(item => ({ name: item.name, url: item.url, configured: true, management: "static-config" })) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
