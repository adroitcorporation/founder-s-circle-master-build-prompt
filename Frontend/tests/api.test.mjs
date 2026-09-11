import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/api.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const { api } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

async function withResponse(response, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("preserves successful JSON responses", async () => {
  await withResponse(Response.json({ ok: true }), async () => {
    assert.deepEqual(await api("/auth/login"), { ok: true });
  });
});
test("preserves authentication error messages", async () => {
  await withResponse(
    Response.json(
      { error: "Email or password is incorrect." },
      { status: 401 },
    ),
    async () => {
      await assert.rejects(api("/auth/login"), {
        message: "Email or password is incorrect.",
      });
    },
  );
});
for (const [name, body, status] of [
  ["empty proxy failure", "", 500],
  ["HTML gateway failure", "<html>Bad gateway</html>", 502],
  ["invalid success body", "not JSON", 200],
]) {
  test(`handles ${name} without a JSON parser error`, async () => {
    await withResponse(new Response(body, { status }), async () => {
      await assert.rejects(api("/auth/login"), {
        message:
          status === 200
            ? "The server returned an unexpected response. Please try again."
            : "The service is temporarily unavailable. Please try again shortly.",
      });
    });
  });
}
test("handles a no-content response", async () => {
  await withResponse(new Response(null, { status: 204 }), async () => {
    assert.equal(await api("/example"), undefined);
  });
});
test("handles a null error body", async () => {
  await withResponse(Response.json(null, { status: 500 }), async () => {
    await assert.rejects(api("/auth/login"), {
      message: "Something went wrong. Please try again.",
    });
  });
});
test("handles connection failures", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(api("/auth/login"), {
      message: "Unable to connect. Please check your connection and try again.",
    });
  } finally {
    globalThis.fetch = original;
  }
});
