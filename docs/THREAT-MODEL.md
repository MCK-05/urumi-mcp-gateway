# Threat Model - Urumi.AI MCP Gateway
## 1. Assets to protect
- Gateway API keys and user identities
- WooCommerce REST API credentials and other upstream credentials
- LLM provider credentials
- Store orders, products, and customer information
- API-key database and audit history
- Kubernetes Secrets, persistent volumes, and service configuration
## 2. Trust boundaries
1. External MCP clients are untrusted until their API keys are validated.
2. The gateway is the intended entry point for upstream tool access.
3. Upstream MCP servers are separate services and may fail or return
   unexpected content.
4. Kubernetes configuration, Secrets, and persistent volumes require
   restricted access.
5. LLM prompts and tool outputs may contain untrusted content.
## 3. Threats and mitigations
### Stolen or leaked API keys
Threat: A leaked key could let another person call tools as its owner.
Mitigations: Generate high-entropy keys, store only cryptographic hashes,
validate every request, support revocation, never print keys in logs, and
keep local secret files out of Git.
Remaining work: Verify revocation through the live gateway and test key ownership and account-disable behavior end to end.
### Unauthorized administrative actions
Threat: A normal member could manage upstreams, invite users, or revoke keys.
Mitigations: Implement authenticated admin and member roles, enforce
authorization on the backend, and audit administrative changes.
Remaining work: Invitation delivery is manual (secure token sharing, not email). Test invite expiry/reuse, session expiry, CSRF protections and every role boundary.
### Upstream credential exposure
Threat: Static upstream tokens or WooCommerce credentials could leak to
browsers, external MCP clients, source control, or logs.
Mitigations: Keep credentials server-side, use Kubernetes Secrets, restrict
Secret access with least privilege, and redact sensitive values from logs.
Remaining work: Audit all manifests and source files for hardcoded secrets
and confirm that no credential is committed to Git.
### Malicious or unreliable upstream
Threat: An upstream may become unavailable, return malformed results, or
provide misleading content that influences an LLM.
Mitigations: Isolate upstream failures, validate tool inputs and outputs,
apply timeouts, and treat tool results as untrusted data. Do not allow tool
outputs to override system instructions or bypass authorization.
Remaining work: Verify timeouts and health reporting against live upstream failures. Review SSRF risks and enforce Kubernetes NetworkPolicies so only the gateway can reach upstream MCP services.
### Sensitive audit information
Threat: Logs could expose customer information, tokens, or internal errors.
Mitigations: Store only the fields needed for accountability, avoid logging
secrets, restrict access to audit records, and define retention policies.
Remaining work: Audit access is currently administrator-only. Test attribution for external MCP clients and dashboard chat, and define retention/deletion policies.
### Persistent storage compromise or loss
Threat: Unauthorized access to or deletion of a volume could expose or
destroy API-key records and audit history.
Mitigations: Restrict volume and Kubernetes access, persist required data,
and plan backups and recovery tests.
Remaining work: Verify recovery and backup procedures.
### LLM prompt injection
Threat: A user or upstream result may attempt to persuade the chat agent to
invoke tools inappropriately or reveal secrets.
Mitigations: Keep provider keys server-side, apply tool authorization in the
backend, validate arguments, and require confirmation for destructive actions
where appropriate. Never rely on prompt instructions as the sole security
control.
Remaining work: The first tool-calling loop is implemented through the gateway MCP endpoint. Test prompt injection, tool-call limits, destructive-action confirmation, provider failures and output redaction.
## 4. Minimum security verification
- Missing and invalid gateway keys are rejected.
- Revoked keys are rejected after revocation.
- API keys are stored as hashes rather than plaintext.
- Upstream and LLM credentials are not exposed to clients.
- Upstream bearer credentials are encrypted at rest with AES-256-GCM and a deployment-provided encryption key.
- Dashboard session cookies are HttpOnly and SameSite=Lax; Secure is set behind HTTPS.
- A failed upstream does not stop unrelated upstreams.
- Audit records identify the authenticated user and tool outcome.
- Persistent data survives pod restarts.
- Administrative routes enforce role checks.
- Git history and committed files are reviewed for secrets.
## 5. Scope statement
This document describes the current architecture, risks, mitigations, and
outstanding work. It is not a claim that all listed security controls or
acceptance tests have already been completed.
