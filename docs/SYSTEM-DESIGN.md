# System Design - Urumi.AI MCP Gateway
## 1. Overview
This project provides a Kubernetes-hosted Model Context Protocol (MCP)
gateway for accessing multiple upstream MCP servers through one authenticated
endpoint. The current implementation includes a Node.js gateway, API-key
validation, SQLite-backed API-key storage, tool-call audit logging, mock
catalog and inventory upstreams, and a custom WooCommerce MCP server.
## 2. Architecture
The current request path is:
External MCP client
  -> Gateway HTTP endpoint (/mcp)
  -> API-key validation
  -> MCP tool discovery and registration
  -> Selected upstream MCP server
  -> Tool result returned through the gateway
The upstream configurations currently include:
- catalog-upstream
- inventory-upstream
- woocommerce-upstream
WordPress and MySQL run as Kubernetes workloads for the store.
## 3. Authentication and audit
Clients authenticate to the gateway using a bearer API key. The gateway
validates the supplied key against the API-key store. Keys are hashed for
storage; plaintext keys must not be committed or logged.
Tool executions record the authenticated user ID, tool name, status,
timestamp, and duration. Audit records are stored in SQLite on persistent
storage. Audit logging errors are logged without replacing the tool result.
## 4. Tool discovery and routing
At gateway-server construction, the gateway connects to configured upstreams,
discovers their tools, and registers them. Tool calls are forwarded to the
upstream client associated with the registered tool.
Duplicate tool names are currently skipped, with a warning. This is a
simple collision policy; production use should prefer explicit upstream
namespacing or reject ambiguous registrations.
## 5. Failure behavior
An upstream that is unavailable during discovery is logged and skipped,
while discovery continues for other upstreams. Consequently, its tools may
not be present in that gateway session. Tool execution errors return a
controlled error response and are recorded by the audit callback when that
callback is reached.
The current implementation has not yet demonstrated every required failure
scenario. In particular, discovery failures are application log events, not
tool-call audit records. Production hardening should add bounded connection
and request timeouts, retry/backoff where appropriate, health status reporting,
and tests for upstream failures after discovery.
## 6. Kubernetes and persistence
Kubernetes manifests are maintained under `k8s/`. The gateway uses persistent
storage for its SQLite databases. WordPress and MySQL are deployed separately.
Local development uses Minikube and service port-forwarding.
A Helm chart with local and production values is a required deployment
deliverable. Stable ingress routes, resource requests and limits, probes, and
Kubernetes Secret integration must be validated before claiming full
production-like readiness.
## 7. Production trade-offs and next steps
Before production use:
- Move configuration and credentials into Kubernetes Secrets.
- Add configurable upstream management and enabled/disabled state.
- Add explicit member roles and administrative authorization.
- Add timeouts, bounded retries, and upstream health checks.
- Complete the React dashboard and LLM chat tool-calling loop.
- Validate persistence, revocation, isolation, and audit attribution end to end.
- Add metrics, structured logging, and deployment rollback procedures.
