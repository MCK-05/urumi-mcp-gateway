# Urumi.AI FDE Internship - MCP Gateway on Kubernetes
A Kubernetes-based WooCommerce and MCP gateway prototype. The gateway discovers tools from multiple upstream MCP servers, routes tool calls, authenticates clients with API keys, and records audit events.
> **Project status:** A first implementation of the React dashboard, team identity APIs, dynamic upstream registry, configurable LLM chat tool loop, API-key management, and audit views has been added on the round1-completion branch. These new paths still require local build, security, Kubernetes, and end-to-end verification. Do not treat this repository as production-ready or as having passed all assignment acceptance criteria.
## Architecture
- **Store:** WordPress and WooCommerce with MySQL and persistent storage.
- **Gateway:** Node.js, Express, and MCP libraries for upstream discovery, tool aggregation, routing, authentication, and audit logging.
- **Upstreams:** Catalog, inventory, and WooCommerce-related MCP services.
- **Deployment:** Kubernetes manifests and a Helm chart with local and production-like values.
## Project structure
- `src/server.js` - MCP gateway.
- `src/api-key-store.js` - API-key storage and validation.
- `src/audit-log.js` - persistent audit records.
- `src/team-store.js` - password-hashed dashboard users, sessions, invitations and role state.
- `src/upstream-store.js` - persistent upstream registry with encrypted optional bearer credentials.
- `dashboard/` - React dashboard source and styles.
- `.github/workflows/validate.yml` - syntax and container-build validation.
- `src/woocommerce-mcp-server.js` - WooCommerce MCP service.
- `src/test-*.js` - test scripts.
- `k8s/` - Kubernetes manifests.
- `helm/urumi-mcp-gateway/` - Helm chart.
- `docs/ASSIGNMENT-CHECKLIST.md` - requirement tracking.
- `docs/SYSTEM-DESIGN.md` - architecture and design.
- `docs/THREAT-MODEL.md` - security considerations.
## Prerequisites
Node.js, npm, Docker Desktop, Minikube, kubectl, Helm, and Git.
## Local development
Install dependencies:
```powershell
npm.cmd ci
```
Start the gateway:
```powershell
npm.cmd start
```
Health check:
```powershell
curl.exe -i http://127.0.0.1:3000/health
```
Configure the first administrator and LLM provider before using dashboard/chat:
```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-at-least-12-characters"
$env:LLM_BASE_URL = "https://api.openai.com/v1"
$env:LLM_MODEL = "gpt-4o-mini"
$env:LLM_API_KEY = "set-this-in-your-secret-manager"
$env:UPSTREAM_CREDENTIAL_ENCRYPTION_KEY = "generate-a-random-secret-at-least-32-characters"
npm.cmd start
```
The first administrator is created only when the team database has no users. LLM settings must be supplied securely at runtime. The dashboard is served at http://127.0.0.1:3000/; sign in with the bootstrap admin. Never commit API keys, passwords, .env files, or database files.
## Kubernetes and Helm
Start Docker Desktop first, then run:
```powershell
minikube start --driver=docker
minikube addons enable ingress
```
Build and load the local gateway image:
```powershell
docker build -t urumi-mcp-gateway:local .
minikube image load urumi-mcp-gateway:local
```
Validate the Helm chart:
```powershell
helm lint .\helm\urumi-mcp-gateway
helm template urumi-mcp-gateway .\helm\urumi-mcp-gateway -f .\helm\urumi-mcp-gateway\values-local.yaml
```
Local example hostnames:
- `gateway.urumi.local`
- `store.urumi.local`
For the Minikube Docker driver on Windows, ingress may need port forwarding:
```powershell
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8081:80
```
The production values currently contain example hostnames and a placeholder container image. A public production deployment has not been verified.
## Tests performed
Previously exercised in the local environment:
- Gateway health endpoint.
- MCP client connection and discovery of eight tools.
- Product listing and order-list requests through the gateway.
- Catalog upstream outage isolation and recovery.
- API-key storage and audit-log persistence across a gateway pod restart.
- Helm lint and local/production template rendering.
- WordPress storefront responses through ingress using a host header.
These tests do not mean that all assignment acceptance criteria have passed.
## Incomplete requirements
- Run the new branch through CI and local npm test; fix any syntax/runtime failures.
- Verify admin/member login, invitation acceptance, role restrictions, disabled-user key rejection and session logout.
- Verify dynamic upstream CRUD, bearer credential encryption, health checks, timeout behavior and tool-name collision behavior.
- Configure an LLM secret and verify the chat tool-calling loop against the live gateway/upstreams.
- Verify audit attribution for both dashboard chat and external MCP clients.
- Harden CSRF/session cookie settings and validate all API routes before public exposure.
- Full storefront order placement and WooCommerce admin verification.
- Complete user A/user B and external MCP-client acceptance flows.
- Verified production-like k3s deployment.
- Demo video and final submission.
See `docs/ASSIGNMENT-CHECKLIST.md` for requirement status. Only mark requirements complete after implementation and testing.
## Security
Do not commit credentials, Kubernetes Secret values, `.env` files, or local databases. Keep upstream credentials server-side. This prototype requires further security review before production use.
## Submission
https://forms.gle/nftwgyNeenSDmiRb6
