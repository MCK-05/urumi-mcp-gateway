const store = require("./api-key-store");
async function main() {
  const issued = await store.issueApiKey("test-user-001");
  if (!issued.apiKey || issued.apiKey.length !== 64) {
    throw new Error("API key generation failed.");
  }
  console.log("PASS: API key generated.");
  const valid = await store.validateApiKey(issued.apiKey);
  if (!valid || valid.userId !== "test-user-001") {
    throw new Error("New API key was not validated.");
  }
  console.log("PASS: New key validated for the correct user.");
  const revoked = await store.revokeApiKey(issued.id);
  if (!revoked) {
    throw new Error("API key revocation failed.");
  }
  console.log("PASS: API key revoked.");
  const afterRevoke = await store.validateApiKey(issued.apiKey);
  if (afterRevoke !== null) {
    throw new Error("Revoked API key was still accepted.");
  }
  console.log("PASS: Revoked key rejected.");
  const records = await store.listApiKeys();
  if (
    records.length !== 1 ||
    records[0].userId !== "test-user-001" ||
    !records[0].revokedAt ||
    Object.hasOwn(records[0], "key_hash")
  ) {
    throw new Error("API-key listing check failed.");
  }
  console.log("PASS: Listing shows metadata, not the secret key or hash.");
  console.log("All API-key store tests passed.");
}
main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
