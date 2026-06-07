import { describe, test, expect } from "bun:test";
import { getNaturalLanguageBangQuery } from "../../src/client/utils/search-helpers";
import type { Command } from "../../src/client/types";

const makeCmd = (trigger: string, opts: Partial<Command> = {}): Command => ({
  id: trigger,
  trigger,
  name: trigger,
  naturalLanguage: true,
  aliases: [],
  naturalLanguagePhrases: [],
  ...opts,
});

describe("getNaturalLanguageBangQuery", () => {
  test("returns null for empty query", () => {
    expect(getNaturalLanguageBangQuery("", [makeCmd("ip")])).toBeNull();
    expect(getNaturalLanguageBangQuery("   ", [makeCmd("ip")])).toBeNull();
  });

  test("returns null when no commands match", () => {
    expect(getNaturalLanguageBangQuery("weather", [makeCmd("ip")])).toBeNull();
  });

  test("matches by trigger word alone", () => {
    expect(getNaturalLanguageBangQuery("ip", [makeCmd("ip")])).toBe("!ip");
  });

  test("matches trigger with trailing query", () => {
    expect(getNaturalLanguageBangQuery("ip 1.2.3.4", [makeCmd("ip")])).toBe("!ip 1.2.3.4");
  });

  test("is case-insensitive for trigger matching", () => {
    expect(getNaturalLanguageBangQuery("IP", [makeCmd("ip")])).toBe("!ip");
  });

  test("matches alias as trigger word", () => {
    const cmd = makeCmd("ip", { aliases: ["myip"] });
    expect(getNaturalLanguageBangQuery("myip", [cmd])).toBe("!ip");
  });

  test("matches natural language phrase", () => {
    const cmd = makeCmd("ip", { naturalLanguagePhrases: ["what is my ip"] });
    expect(getNaturalLanguageBangQuery("what is my ip", [cmd])).toBe("!ip");
  });

  test("matches phrase prefix with trailing query", () => {
    const cmd = makeCmd("ip", { naturalLanguagePhrases: ["lookup ip"] });
    expect(getNaturalLanguageBangQuery("lookup ip 8.8.8.8", [cmd])).toBe("!ip 8.8.8.8");
  });

  test("longer phrase takes precedence over shorter", () => {
    const cmd = makeCmd("ip", {
      naturalLanguagePhrases: ["my ip address", "my ip"],
    });
    expect(getNaturalLanguageBangQuery("my ip address", [cmd])).toBe("!ip");
  });

  test("returns null when command has naturalLanguage false", () => {
    const cmd = makeCmd("ip", { naturalLanguage: false });
    expect(getNaturalLanguageBangQuery("ip", [cmd])).toBeNull();
  });

  test("returns null when command has no id", () => {
    const cmd = { ...makeCmd("ip"), id: undefined } as unknown as Command;
    expect(getNaturalLanguageBangQuery("ip", [cmd])).toBeNull();
  });
});
