import "../src/config/runtime.js";
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../src/services/email.js";
afterEach(() => mock.restoreAll());
test("Resend sends verification links over HTTPS without SMTP", async () => {
  const old = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-placeholder";
  try {
    let calls = 0;
    mock.method(
      globalThis,
      "fetch",
      async (url: unknown, init: RequestInit) => {
        calls++;
        assert.equal(url, "https://api.resend.com/emails");
        assert.equal(init.method, "POST");
        const body = JSON.parse(String(init.body));
        assert.deepEqual(body.to, ["qa@example.test"]);
        assert(body.text.includes("https://example.test/verify?token=test"));
        return new Response("{}", { status: 200 });
      },
    );
    await sendEmail(
      "qa@example.test",
      "Verify",
      "https://example.test/verify?token=test",
    );
    assert.equal(calls, 1);
  } finally {
    if (old === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = old;
  }
});
test("Resend delivery failures do not expose provider response data", async () => {
  const old = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-placeholder";
  try {
    mock.method(
      globalThis,
      "fetch",
      async () => new Response("private provider data", { status: 429 }),
    );
    await assert.rejects(
      sendEmail("qa@example.test", "Verify", "https://example.test"),
      { message: "Unable to deliver email. Please try again." },
    );
  } finally {
    if (old === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = old;
  }
});
