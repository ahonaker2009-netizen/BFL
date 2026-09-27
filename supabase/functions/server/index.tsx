import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const PREFIX = "/make-server-b45656e7";

app.use('*', logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get(`${PREFIX}/health`, (c) => c.json({ status: "ok" }));

// GET /data/:key — read a stored value
app.get(`${PREFIX}/data/:key`, async (c) => {
  const key = c.req.param("key");
  try {
    const value = await kv.get(key);
    return c.json({ value: value ?? null });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /data/:key — write a value
app.post(`${PREFIX}/data/:key`, async (c) => {
  const key = c.req.param("key");
  try {
    const body = await c.req.json();
    await kv.set(key, body.value);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /data-multi — read multiple keys at once
app.post(`${PREFIX}/data-multi`, async (c) => {
  try {
    const body = await c.req.json();
    const keys: string[] = body.keys || [];
    const values = await kv.mget(keys);
    const result: Record<string, any> = {};
    keys.forEach((k, i) => { result[k] = values[i] ?? null; });
    return c.json({ result });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

Deno.serve(app.fetch);
