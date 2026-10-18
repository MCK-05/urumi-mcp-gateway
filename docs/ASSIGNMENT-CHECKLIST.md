# Urumi.AI FDE Internship - Assignment Checklist
## Purpose
Track mandatory requirements from the assignment. Do not mark an item complete until it has been implemented and tested.
## 1. Store - WordPress and WooCommerce
- [ ] Deploy WordPress and WooCommerce on Kubernetes.
- [ ] Deploy the store database on Kubernetes.
- [ ] Persist database data and WordPress content.
- [ ] Expose the storefront through Ingress with a stable local URL.
- [ ] Configure a test-friendly checkout method (COD or dummy gateway).
- [ ] Place a storefront order and verify it in WooCommerce admin.
## 2. WooCommerce MCP server
- [ ] Write our own MCP server; do not install an existing WooCommerce MCP server/plugin.
- [ ] Implement MCP over Streamable HTTP.
- [ ] Implement list products.
- [ ] Implement create product.
- [ ] Implement list orders.
- [ ] Implement get order.
- [ ] Implement update order status.
- [ ] Connect to WooCommerce through a documented method (planned: WooCommerce REST API).
- [ ] Keep the MCP server internal to the cluster; only the gateway can call it.
## 3. Gateway and upstream MCP servers
- [ ] Implement a backend that acts as an MCP client to upstream servers and an MCP server to clients.
- [ ] Expose one gateway MCP endpoint.
- [ ] Pre-register the WooCommerce MCP server.
- [ ] Support adding, editing, disabling and removing upstream servers.
- [ ] Support optional static upstream credentials (header or bearer token).
- [ ] Aggregate tools from every enabled upstream.
- [ ] Route each tool call to its correct upstream.
- [ ] Document and implement a tool-name collision strategy.
- [ ] Add timeouts and clear errors for slow or dead upstreams.
- [ ] Ensure an unavailable upstream does not block other servers.
- [ ] Connect at least three upstream MCP servers: WooCommerce and two others.
- [ ] Keep upstream credentials server-side; never expose them to the browser or MCP clients.
## 4. Team access and audit
- [ ] Implement admin and member roles.
- [ ] Allow admins to invite/manage team members.
- [ ] Issue individual gateway API keys.
- [ ] Store API keys as hashes, not plaintext.
- [ ] Allow keys to be revoked and reject revoked keys.
- [ ] Record each tool call with user, server, tool, timestamp, duration and outcome.
- [ ] Display the audit log in the dashboard.
## 5. React dashboard and chat agent
- [ ] Build a React dashboard and backend.
- [ ] Show upstream server status: Connected, Unreachable or Disabled.
- [ ] Show tools exposed by each upstream.
- [ ] Provide upstream management controls.
- [ ] Provide member and API-key management.
- [ ] Display audit events.
- [ ] Implement a chat agent that uses an LLM tool-calling loop through the gateway.
- [ ] Show which tools the chat agent called.
- [ ] Attribute chat tool calls to the logged-in user.
- [ ] Keep LLM API keys secret.
- [ ] Ensure chat and external clients access upstreams only through the gateway.
## 6. Kubernetes and Helm
- [ ] Run the complete system on local Kubernetes (Minikube).
- [ ] Use Helm charts; do not replace Helm with Kustomize.
- [ ] Provide local and production values files.
- [ ] Use the same charts for local Kubernetes and a production-like VPS/k3s deployment.
- [ ] Run the store, database, WooCommerce MCP server, gateway backend and dashboard in the cluster.
- [ ] Expose storefront and dashboard through Ingress with stable URLs.
- [ ] Document the local domain approach.
- [ ] Add readiness and liveness probes to every workload.
- [ ] Set resource requests and limits for every workload.
- [ ] Keep credentials in Kubernetes Secrets; do not hardcode secrets in source code.
- [ ] Verify persistent storage survives pod restarts.
## 7. Required end-to-end demo
- [ ] Place an order through the storefront and verify it in WooCommerce admin.
- [ ] As user A, create a product through chat and verify it on the storefront.
- [ ] Place an order for that product manually through the storefront.
- [ ] Ask chat for today's orders and verify the new order is returned.
- [ ] As user B, connect an external MCP client using only the gateway URL and user B's API key.
- [ ] Verify the external client discovers tools from all enabled upstreams.
- [ ] Ask the same orders question through the external client.
- [ ] Demonstrate one prompt using tools from two different upstreams.
- [ ] Revoke user B's key and verify the next call is rejected.
- [ ] Disable an upstream and verify its tools disappear from chat and external clients.
- [ ] Stop an upstream pod and verify other upstreams continue working.
- [ ] Verify the dashboard reports the failed upstream as unreachable.
- [ ] Verify audit events are attributed to the correct users.
## 8. Mandatory repository deliverables
- [ ] README.md: local setup, production-like setup, ordering, external MCP client and chat instructions.
- [ ] Source code: dashboard, backend/gateway, WooCommerce MCP server and chat agent.
- [ ] Helm charts and local/production values files.
- [ ] docs/SYSTEM-DESIGN.md: architecture, routing, aggregation, failures and production tradeoffs.
- [ ] docs/THREAT-MODEL.md: shared credentials, client-token handling, untrusted upstreams and team-member risks.
- [ ] Document attempted optional extras, if any.
- [ ] Record test steps and results.
- [ ] Prepare the required demo video.
- [ ] Submit the GitHub repository and demo through the provided submission form.
## 9. Optional work - defer until the mandatory core passes
- [ ] Multi-store provisioning.
- [ ] Production-like VPS deployment and optional TLS.
- [ ] Per-user/tool permissions.
- [ ] OAuth.
- [ ] Large-tool-set handling.
- [ ] Hosted MCP server deployment.
- [ ] Additional security hardening.
- [ ] Scaling and rate limits.
- [ ] Metrics and advanced observability.
- [ ] Helm upgrade and rollback demonstration.
## Current progress
- [x] Project folder created.
- [x] Node.js and npm available.
- [x] Express installed.
- [x] Initial Express server starts on port 3000.
- [x] GET /health implemented and tested (confirm again if needed).
- [x] Assignment requirements checklist created and verified.
- [ ] All remaining requirements are pending until implemented and tested.
