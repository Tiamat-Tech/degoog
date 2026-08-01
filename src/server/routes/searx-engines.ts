import { Hono, type Context } from "hono";
import { canBalrogPass, gandalf } from "./settings-auth";
import {
  installSearx,
  listSearxItems,
  uninstallSearx,
} from "../extensions/compatibility-layer/searx/install";
import { reloadEngines } from "../extensions/engines/registry";
import { logger } from "../utils/logger";

const NS = "searx-engines";

const router = new Hono();

const _refresh = async (code: string): Promise<void> => {
  try {
    await reloadEngines();
  } catch (err) {
    logger.warn(NS, `engine reload after ${code} failed, restart to pick it up`, err);
  }
};

const _codeFrom = async (c: Context): Promise<string> => {
  const body = (await c.req.json<{ code?: string }>().catch(() => ({}))) as {
    code?: string;
  };
  return body.code?.trim() ?? "";
};

router.get("/api/searx/engines", async (c) => {
  if (!(await gandalf(canBalrogPass(c))))
    return c.json({ error: "You shall not pass!" }, 401);
  return c.json({ engines: await listSearxItems() });
});

router.post("/api/searx/install", async (c) => {
  if (!(await gandalf(canBalrogPass(c))))
    return c.json({ error: "You shall not pass!" }, 401);
  const code = await _codeFrom(c);
  if (!code) return c.json({ error: "Missing code" }, 400);
  try {
    await installSearx(code);
    await _refresh(code);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Install failed";
    return c.json({ error: message }, 400);
  }
});

router.post("/api/searx/uninstall", async (c) => {
  if (!(await gandalf(canBalrogPass(c))))
    return c.json({ error: "You shall not pass!" }, 401);
  const code = await _codeFrom(c);
  if (!code) return c.json({ error: "Missing code" }, 400);
  try {
    await uninstallSearx(code);
    await _refresh(code);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Uninstall failed";
    return c.json({ error: message }, 400);
  }
});

export default router;
