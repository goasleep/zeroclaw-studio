import { describe, expect, it } from "vitest";
import {
  cleanToolText,
  hasMessageToolEventBlock,
  hasMessageToolResultBlock,
  parseMessageContentBlocks,
} from "./tool-result-blocks";

describe("parseMessageContentBlocks", () => {
  it("parses a single tool result block", () => {
    expect(
      parseMessageContentBlocks(
        '[Tool results] <tool_result name="web_fetch" status="error"> Error: HTTP 404 Not Found </tool_result>',
      ),
    ).toEqual([
      {
        kind: "tool_result",
        name: "web_fetch",
        status: "error",
        output: "Error: HTTP 404 Not Found",
      },
    ]);
  });

  it("keeps markdown around tool result blocks", () => {
    expect(
      parseMessageContentBlocks(
        'Before\n\n[Tool results] <tool_result name="shell" status="ok">done</tool_result>\n\nAfter',
      ),
    ).toEqual([
      { kind: "text", content: "Before" },
      { kind: "tool_result", name: "shell", status: "success", output: "done" },
      { kind: "text", content: "After" },
    ]);
  });

  it("parses multiline output and decodes common xml entities", () => {
    const blocks = parseMessageContentBlocks(
      '[Tool results] <tool_result name="shell" status="error"> Error: Command denied\nprint(&quot;hi&quot;)\n1 &lt; 2 </tool_result>',
    );

    expect(blocks).toEqual([
      {
        kind: "tool_result",
        name: "shell",
        status: "error",
        output: 'Error: Command denied\nprint("hi")\n1 < 2',
      },
    ]);
  });

  it("strips ansi terminal color codes from tool output", () => {
    expect(cleanToolText("\u001b[38;5;17mcloudy\u001b[0m")).toBe("cloudy");
    expect(cleanToolText("\uFFFD[38;5;17mcloudy\uFFFD[0m")).toBe("cloudy");

    expect(
      parseMessageContentBlocks(
        '[Tool results] <tool_result name="web_fetch" status="ok">\u001b[38;5;17mGuangzhou\u001b[0m</tool_result>',
      ),
    ).toEqual([
      {
        kind: "tool_result",
        name: "web_fetch",
        status: "success",
        output: "Guangzhou",
      },
    ]);
  });

  it("detects parsed tool result blocks", () => {
    expect(
      hasMessageToolResultBlock(
        parseMessageContentBlocks(
          '[Tool results] <tool_result name="calculator" status="ok">4</tool_result>',
        ),
      ),
    ).toBe(true);

    expect(hasMessageToolResultBlock(parseMessageContentBlocks("regular user text"))).toBe(false);
  });

  it("parses raw tool call blocks", () => {
    expect(
      parseMessageContentBlocks(
        '<tool_call>{"name":"weather","arguments":{"location":"Guangzhou","days":3,"units":"metric"}}</tool_call> <tool_call>{"name":"web_search_tool","arguments":{"query":"广州未来7天天气预报 2026年6月"}}</tool_call>',
      ),
    ).toEqual([
      {
        kind: "tool_call",
        name: "weather",
        args: { location: "Guangzhou", days: 3, units: "metric" },
        raw: '{"name":"weather","arguments":{"location":"Guangzhou","days":3,"units":"metric"}}',
      },
      {
        kind: "tool_call",
        name: "web_search_tool",
        args: { query: "广州未来7天天气预报 2026年6月" },
        raw: '{"name":"web_search_tool","arguments":{"query":"广州未来7天天气预报 2026年6月"}}',
      },
    ]);
  });

  it("detects parsed tool event blocks", () => {
    expect(
      hasMessageToolEventBlock(
        parseMessageContentBlocks('<tool_call>{"name":"weather","arguments":{}}</tool_call>'),
      ),
    ).toBe(true);

    expect(hasMessageToolEventBlock(parseMessageContentBlocks("regular user text"))).toBe(false);
  });
});
