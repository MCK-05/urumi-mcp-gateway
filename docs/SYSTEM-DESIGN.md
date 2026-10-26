# System Design - Urumi.AI MCP Gateway

## 1. Overview
The project is a Kubernetes-hosted MCP gateway prototype. External MCP clients authenticate to one gateway endpoint. A React dashboard provides team administration, upstream configuration, audit visibility and a chat UI. The chat agent uses a configurable OpenAI-compatible chat-completions endpoint and calls tools through the same gateway MCP endpoint as external clients.

## 2. Components and request paths

### External MCP client
External MCP client -> POST /mcp -> bearer API-key validation -> request-scoped gateway MCP server -> enabled upstream MCP servers -> tool result.

### Dashboard chat
Authenticated dashboard session -> POST /api/chat -> short-lived API key for the logged-in user -> MCP client connects to the gateway's own /mcp endpoint -> LLM tool-calling loop -> tool results -> final response. The short-lived key is revoked after the chat request. Tool calls therefore pass through gateway authentication, routing and audit logic rather than bypassing the gateway.

### Dashboard identity
- team_users stores email, role, password salt/hash and disabled state.
- team_sessions stores only a hash of a random session token and an expiry.
- team_invites stores only a hash of a one-time invitation token and a 24-hour expiry.
- Passwords use Node.js scrypt; session and invite tokens are random and stored as SHA-256 hashes.
- Admin-only endpoints manage invitations, members, gateway API keys and audit events.

### Upstream registry
upstream_servers stores upstream name, MCP URL, enabled state and optional encrypted bearer credentials. Optional credentials use AES-256-GCM and require UPSTREAM_CREDENTIAL_ENCRYPTION_KEY. Plaintext credentials are never returned by the registry API. Only enabled upstreams are discovered for each gateway MCP session.

## 3. Tool discovery, naming and routing
The gateway discovers tools from every enabled upstream when constructing the MCP server. A tool is registered with the upstream client that supplied it. If a tool name is already registered, the later tool is exposed as upstream-name__tool-name. The tool description includes the originating server name so clients and the chat UI can identify the source. A second collision on the namespaced name is skipped and logged.

## 4. Authentication and audit
External MCP requests require Authorization: Bearer <API_KEY>. API keys are generated from cryptographically secure random bytes; only SHA-256 hashes are stored. Revocation updates revoked_at, and disabled team members' keys are rejected. Dashboard sessions use HttpOnly, SameSite=Lax cookies with an eight-hour expiry; Secure is enabled when the request is served over HTTPS.

Each tool call records user, upstream server, tool name, timestamp, duration and success/error outcome in SQLite. The dashboard audit table displays these fields. Audit logging must not leak credentials or tool arguments.

## 5. Failure behavior
Unavailable upstreams are skipped during discovery so other servers can still provide tools. Connection and discovery operations have bounded timeouts; tool calls have a 30-second gateway timeout. The dashboard performs bounded health checks and reports Connected, Unreachable or Disabled with discovered tool names. These behaviors require local acceptance testing, including killing an upstream pod and confirming the other upstreams remain usable.

## 6. Kubernetes and persistence
Kubernetes manifests are maintained under k8s/ and the Helm chart under helm/urumi-mcp-gateway/. The gateway SQLite databases share a persistent volume. WordPress files and MySQL data use persistent volumes. Gateway admin credentials, LLM API key and upstream encryption key are referenced through Kubernetes Secrets; secret values must be created out of band and never committed.

The same Helm chart has local and production-like values. A real VPS/k3s deployment and production ingress/TLS have not been verified.

## 7. Known limitations and production trade-offs
- The dashboard currently loads React from an external ESM CDN; production should bundle static assets and serve them locally.
- Invitations produce a one-time token for an administrator to share securely; email delivery is not implemented.
- The LLM integration targets the OpenAI-compatible chat-completions API; provider compatibility and model tool-call support must be tested.
- The chat agent includes a confirmation instruction for destructive actions, but application-level approval gates should be added before production.
- SQLite is suitable for this single-replica prototype; multi-replica production should use a managed transactional database and shared session/key stores.
- Further security testing is required for CSRF, rate limits, session rotation, SSRF/network policy, prompt injection and tenant-level tool permissions.
- Complete storefront checkout, two-user external MCP, key-revocation, upstream outage, audit-attribution and demo-video acceptance scenarios before submission.
