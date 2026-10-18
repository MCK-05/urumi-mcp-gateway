
# Urumi.AI FDE Internship — MCP Gateway on Kubernetes

A WooCommerce hosting platform with a team MCP gateway, dashboard, and chat agent. The goal is to let an administrator register MCP servers once so team members can access tools through one authenticated gateway endpoint.

> **Project status:** In development. The sections below describe the intended implementation, not features that are already complete.

## Architecture

The required system has four layers:

1. **Store:** WordPress and WooCommerce, with persistent database and WordPress content.
2. **WooCommerce MCP server:** A custom Streamable HTTP MCP server exposing product and order tools.
3. **Gateway and dashboard:** A React dashboard and backend that aggregate tools from enabled upstream MCP servers and route calls.
4. **Chat agent:** A dashboard chat that uses an LLM to call tools through the gateway as the logged-in user.

Both chat and external MCP clients must access upstream servers through the gateway.

## Required WooCommerce tools

- List products
- Create product
- List orders
- Get order
- Update order status

The planned store connection method is the WooCommerce REST API. The final implementation and credential handling will be documented after it is built.

## Planned upstream MCP servers

At least three upstream MCP servers are required:

- WooCommerce MCP server
- Additional MCP server 2 — to be selected
- Additional MCP server 3 — to be selected

## Planned security and access controls

- Admin and member roles
- Individual gateway API keys, stored as hashes and revocable
- Upstream credentials stored server-side, never exposed to browser clients
- LLM API keys kept secret
- Audit records for each tool call: user, server, tool, timestamp, duration, and outcome
- WooCommerce MCP server internal to the Kubernetes cluster

## Local development

### Prerequisites

- Docker
- Minikube
- kubectl
- Helm
- Node.js and npm
- Git

### Current application bootstrap

The initial Node.js/Express application is located in `src/server.js`.

Install dependencies:

```powershell
npm.cmd install
```

Start the development server:

```powershell
npm.cmd start
```

The health endpoint is intended to be available at:

`http://localhost:3000/health`

The full local setup is not yet complete. Kubernetes, Helm, WooCommerce, the gateway, dashboard, and MCP servers still need to be implemented and verified.

## Production-like deployment

The target deployment is a VPS running k3s. The same Helm charts will be used for local and production-like deployments, with differences supplied through values files, such as:

- `values-local.yaml`
- `values-prod.yaml`

Production setup, DNS, ingress, persistent storage, and secret configuration will be documented after the Helm deployment is implemented.

## Required end-to-end demonstration

1. Place a storefront order and confirm it in WooCommerce admin.
2. As user A, create a product through dashboard chat and verify it on the storefront.
3. Place an order for that product and ask chat for today's orders.
4. Connect an external MCP client as user B using the gateway URL and API key.
5. Demonstrate tools from two upstream servers in one prompt.
6. Revoke user B's key and verify rejection.
7. Disable an upstream and verify its tools disappear from clients.
8. Stop an upstream pod and verify other upstreams continue working.
9. Verify audit events are attributed to the correct users.

## Repository documentation

- `docs/ASSIGNMENT-CHECKLIST.md` — mandatory requirements and completion status
- `docs/SYSTEM-DESIGN.md` — architecture and design tradeoffs (to be completed)
- `docs/THREAT-MODEL.md` — security risks and mitigations (to be completed)

## Test evidence

Implementation and test results will be recorded as each required feature is built. No feature should be marked complete until it has been tested.

## Optional work

Optional features such as multi-store provisioning, OAuth, advanced scaling, and observability will be considered only after the mandatory end-to-end requirements work.

## Submission

The required submission includes this GitHub repository, a demo video, and the submission form:

https://forms.gle/nftwgyNeenSDmiRb6
