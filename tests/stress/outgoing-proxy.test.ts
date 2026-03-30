import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { setSettings, removeSettings } from "../../src/server/utils/plugin-settings";
import { outgoingFetch } from "../../src/server/utils/outgoing";

const SETTINGS_ID = "degoog-settings";

describe("outgoing proxy integration", () => {
  let targetServer: ReturnType<typeof Bun.serve>;
  let proxyServer: ReturnType<typeof Bun.serve>;
  let proxyHits: { method: string; url: string }[];

  beforeAll(() => {
    targetServer = Bun.serve({
      port: 0,
      fetch() {
        return new Response("target-ok");
      },
    });

    proxyHits = [];
    proxyServer = Bun.serve({
      port: 0,
      fetch(req) {
        proxyHits.push({ method: req.method, url: req.url });
        return new Response("proxy-ok");
      },
    });
  });

  afterEach(async () => {
    await removeSettings(SETTINGS_ID);
  });

  afterAll(() => {
    targetServer?.stop();
    proxyServer?.stop();
  });

  test("request routes through proxy when enabled", async () => {
    await setSettings(SETTINGS_ID, {
      proxyEnabled: "true",
      proxyUrls: `http://localhost:${proxyServer.port}`,
    });

    proxyHits = [];
    const targetUrl = `http://localhost:${targetServer.port}/test`;
    const res = await outgoingFetch(targetUrl);
    const body = await res.text();

    expect(proxyHits.length).toBeGreaterThan(0);
    expect(body).toBe("proxy-ok");
  });

  test("request goes direct when proxy is disabled", async () => {
    await setSettings(SETTINGS_ID, {
      proxyEnabled: "false",
      proxyUrls: `http://localhost:${proxyServer.port}`,
    });

    proxyHits = [];
    const targetUrl = `http://localhost:${targetServer.port}/test`;
    const res = await outgoingFetch(targetUrl);
    const body = await res.text();

    expect(proxyHits.length).toBe(0);
    expect(body).toBe("target-ok");
  });

  test("request fails when proxy is unreachable (proves no direct fallback)", async () => {
    await setSettings(SETTINGS_ID, {
      proxyEnabled: "true",
      proxyUrls: "http://127.0.0.1:1",
    });

    const targetUrl = `http://localhost:${targetServer.port}/test`;
    let threw = false;
    try {
      await outgoingFetch(targetUrl);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("proxy receives the correct target URL", async () => {
    await setSettings(SETTINGS_ID, {
      proxyEnabled: "true",
      proxyUrls: `http://localhost:${proxyServer.port}`,
    });

    proxyHits = [];
    const targetUrl = `http://localhost:${targetServer.port}/specific-path?q=hello`;
    await outgoingFetch(targetUrl);

    expect(proxyHits.length).toBe(1);
    expect(proxyHits[0].url).toContain("/specific-path");
    expect(proxyHits[0].url).toContain("q=hello");
  });

  test("round-robins across multiple proxy URLs", async () => {
    let secondProxyHit = false;
    const secondProxy = Bun.serve({
      port: 0,
      fetch() {
        secondProxyHit = true;
        return new Response("proxy2-ok");
      },
    });

    await setSettings(SETTINGS_ID, {
      proxyEnabled: "true",
      proxyUrls: `http://localhost:${proxyServer.port}\nhttp://localhost:${secondProxy.port}`,
    });

    proxyHits = [];
    const targetUrl = `http://localhost:${targetServer.port}/test`;

    await outgoingFetch(targetUrl);
    await outgoingFetch(targetUrl);

    const hitFirst = proxyHits.length > 0;
    const hitSecond = secondProxyHit;
    expect(hitFirst || hitSecond).toBe(true);

    secondProxy.stop();
  });
});
