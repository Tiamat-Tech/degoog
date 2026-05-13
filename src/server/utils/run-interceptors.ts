import { getInterceptors } from "../extensions/interceptors/registry";
import { createCache } from "./cache";
import { outgoingFetch } from "./outgoing";
import { logger } from "./logger";
import { isDisabled } from "./plugin-settings";

export const runIntercepts = async (
  query: string,
  lang?: string,
): Promise<{ query: string }> => {
  const interceptors = getInterceptors();
  if (interceptors.length === 0) return { query };

  let current = query;

  for (const interceptor of interceptors) {
    const sid = interceptor.settingsId;
    if (sid && (await isDisabled(sid))) continue;

    try {
      const result = await interceptor.intercept(current, {
        fetch: outgoingFetch as (url: string, init?: RequestInit) => Promise<Response>,
        createCache,
        lang,
      });
      current = result.query;
    } catch (err) {
      logger.debug("interceptors", `${interceptor.name} threw`, err);
    }
  }

  return { query: current };
};
