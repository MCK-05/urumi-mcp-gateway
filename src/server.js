
const express = require("express");
const path = require("node:path");
const apiKeyStore = require("./api-key-store");
const auditLog = require("./audit-log");
const upstreamStore = require("./upstream-store");
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
app.use("/dashboard", express.static(path.join(__dirname, "../dashboard")));

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

  const configuredUpstreams = await upstreamStore.getEnabled();
  for (const upstream of configuredUpstreams) {
    const client = new Client({
      name: "urumi-gateway-upstream-client",
      version: "1.0.0"
    });

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(upstream.url),
        upstream.bearerToken ? { requestInit: { headers: { Authorization: "Bearer " + upstream.bearerToken } } } : undefined
      );

      await client.connect(transport);
      connectedClients.push(client);

      const result = await client.listTools();

      for (const tool of result.tools) {
        const exposedToolName = registeredTools.has(tool.name) ? upstream.name + "__" + tool.name : tool.name;
        if (registeredTools.has(exposedToolName)) {
          console.warn("Tool collision remains for " + exposedToolName + "; skipping.");
          continue;
        }

        // The current mock tools require no input arguments.
        server.registerTool(
          exposedToolName,
          {
            description:
              (tool.description || "Tool provided by " + upstream.name + ".") + (exposedToolName !== tool.name ? " Original tool name: " + tool.name + ". Namespaced due to collision." : ""),
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

        registeredTools.add(exposedToolName);
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
    upstreams: "dynamic"
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
void Promise.all([teamStore.init(), upstreamStore.init(), apiKeyStore.initDb(), auditLog.initDb()]).then(() => teamStore.bootstrapAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD))
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
    const email = String(req.body?.userId || "").trim().toLowerCase();
    const member = (await teamStore.listUsers()).find(user => user.email === email && !user.disabledAt);
    if (!member) return res.status(400).json({ error: "Choose an active team member by their registered email address." });
    const result = await apiKeyStore.issueApiKey(member.email);
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
app.post("/api/chat", requireUser, async (req, res) => {
  const prompt = String(req.body?.message || "").trim();
  if (!prompt || prompt.length > 4000) return res.status(400).json({ error: "Message must contain 1–4000 characters." });
  const baseUrl = process.env.LLM_BASE_URL;
  const llmKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !llmKey || !model) return res.status(503).json({ error: "Chat is not configured. Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL as deployment secrets." });
  const clients = [], toolMap = new Map(), visibleTools = [], calls = [];
  try {
    const configured = await upstreamStore.getEnabled();
    for (const upstream of configured) {
      const client = new Client({ name: "urumi-chat-agent", version: "1.0.0" });
      try {
        const transport = new StreamableHTTPClientTransport(new URL(upstream.url), upstream.bearerToken ? { requestInit: { headers: { Authorization: "Bearer " + upstream.bearerToken } } } : undefined);
        await Promise.race([client.connect(transport), new Promise((_, reject) => setTimeout(() => reject(new Error("connect timeout")), 5000))]);
        clients.push(client);
        const discovered = await client.listTools();
        for (const tool of discovered.tools) {
          let name = tool.name;
          if (toolMap.has(name)) name = upstream.name + "__" + name;
          if (toolMap.has(name)) continue;
          toolMap.set(name, { client, upstream: upstream.name, originalName: tool.name });
          visibleTools.push({ type: "function", function: { name, description: String(tool.description || "Tool from " + upstream.name).slice(0, 1000), parameters: tool.inputSchema || { type: "object", properties: {} } } });
        }
      } catch (error) {
        console.warn("Chat discovery failed for " + upstream.name + ": " + error.message);
        await client.close().catch(() => {});
      }
    }
    const endpoint = baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const messages = [{ role: "system", content: "You are the Urumi store operations assistant. Use available MCP tools for store data and actions. Do not claim an action succeeded unless the tool result confirms it. Ask for confirmation before destructive or irreversible actions." }, { role: "user", content: prompt }];
    let answer = "";
    for (let turn = 0; turn < 5; turn++) {
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + llmKey, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages, tools: visibleTools.length ? visibleTools : undefined, tool_choice: visibleTools.length ? "auto" : undefined }), signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error("LLM provider returned HTTP " + response.status + ".");
      const payload = await response.json();
      const choice = payload.choices?.[0]?.message;
      if (!choice) throw new Error("LLM provider returned an invalid response.");
      messages.push(choice);
      if (!choice.tool_calls?.length) { answer = choice.content || ""; break; }
      for (const toolCall of choice.tool_calls) {
        const name = toolCall.function?.name;
        const target = toolMap.get(name);
        let result;
        const started = Date.now();
        try {
          if (!target) throw new Error("Tool is no longer available.");
          const args = JSON.parse(toolCall.function.arguments || "{}");
          result = await target.client.callTool({ name: target.originalName, arguments: args });
          calls.push({ name, upstream: target.upstream, outcome: result?.isError ? "error" : "success" });
          await auditLog.recordToolCall({ userId: req.dashboardUser.email, toolName: name, status: result?.isError ? "error" : "success", durationMs: Date.now() - started });
        } catch (error) {
          result = { isError: true, content: [{ type: "text", text: "Tool call failed safely: " + error.message }] };
          calls.push({ name, upstream: target?.upstream || "unknown", outcome: "error" });
          await auditLog.recordToolCall({ userId: req.dashboardUser.email, toolName: name || "unknown", status: "error", durationMs: Date.now() - started }).catch(() => {});
        }
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }
    res.json({ answer, toolCalls: calls });
  } catch (error) {
    console.error("Chat request failed:", error.message);
    res.status(502).json({ error: "Chat request failed. Check the configured LLM provider and upstream connectivity." });
  } finally { await Promise.allSettled(clients.map(client => client.close())); }
});

app.get("/api/upstreams", requireUser, async (req, res) => {
  const configured = await upstreamStore.list();
  res.json({ upstreams: configured.map(item => ({ ...item, status: item.enabled ? "Configured" : "Disabled" })) });
});
app.post("/api/upstreams", requireUser, requireAdmin, async (req, res) => {
  try { res.status(201).json({ upstream: await upstreamStore.save(req.body || {}) }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.put("/api/upstreams/:id", requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid upstream ID." });
  try { res.json({ upstream: await upstreamStore.save({ ...(req.body || {}), id }) }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.patch("/api/upstreams/:id", requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Valid ID and enabled boolean are required." });
  res.json({ updated: await upstreamStore.setEnabled(id, req.body.enabled) });
});
app.delete("/api/upstreams/:id", requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid upstream ID." });
  res.json({ removed: await upstreamStore.remove(id) });
});
app.post("/api/upstreams/:id/check", requireUser, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const entry = (await upstreamStore.list()).find(item => item.id === id);
  if (!entry) return res.status(404).json({ error: "Upstream not found." });
  let client;
  try {
    const { Client, StreamableHTTPClientTransport } = require("@modelcontextprotocol/client");
    client = new Client({ name: "urumi-health-check", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(entry.url));
    await Promise.race([client.connect(transport), new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timed out")), 5000))]);
    const tools = await client.listTools();
    res.json({ status: "Connected", tools: tools.tools.map(tool => tool.name) });
  } catch (error) {
    res.json({ status: "Unreachable", error: "Could not connect to the upstream within the health-check window." });
  } finally { if (client) await client.close().catch(() => {}); }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
