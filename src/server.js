
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Basic application information.
app.get("/", (req, res) => {
  res.json({
    message: "Urumi MCP Gateway project is starting!",
    status: "running"
  });
});

// Kubernetes liveness/readiness endpoint for the initial service.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy"
  });
});

// Current implementation status.
app.get("/api/status", (req, res) => {
  res.status(200).json({
    service: "urumi-mcp-gateway",
    status: "running",
    api: "available",
    mcp: "not_configured"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
