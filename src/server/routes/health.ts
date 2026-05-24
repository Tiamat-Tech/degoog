import { Hono } from "hono";

let _ready = false;

export const markReady = (): void => {
  _ready = true;
};

const router = new Hono();

router.get("/healthz", (c) => c.json({ ok: true }));

router.get("/readyz", (c) =>
  _ready ? c.json({ ok: true }) : c.json({ ok: false }, 503),
);

export default router;
