import { Hono } from "hono";
import {
  readServerSettings,
  writeServerSettings,
} from "../utils/server-settings";
import { logger } from "../utils/logger";

const router = new Hono();

router.get("/api/server-settings", async (c) => {
  try {
    const s = await readServerSettings();
    return c.json({ wizard: s.wizard });
  } catch (err) {
    logger.error("route:server-settings", "GET failed", err);
    return c.json({ wizard: false }, 500);
  }
});

router.patch("/api/server-settings", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: { wizard?: boolean } = {};
    if (typeof body.wizard === "boolean") patch.wizard = body.wizard;
    const next = await writeServerSettings(patch);
    return c.json({ wizard: next.wizard });
  } catch (err) {
    logger.error("route:server-settings", "PATCH failed", err);
    return c.json({ error: "failed to update server settings" }, 500);
  }
});

export default router;
