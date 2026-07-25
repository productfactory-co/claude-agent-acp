import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Regression suite for the Product Factory adapter patch (FORK.md).
// Importing the source keeps repeated TypeScript builds deterministic; the
// supervisor integration suite separately exercises the packed adapter.
import { streamEventToAcpNotifications } from "../acp-agent.js";

type Cache = Parameters<typeof streamEventToAcpNotifications>[2];
type StreamOptions = NonNullable<Parameters<typeof streamEventToAcpNotifications>[5]>;

const noopLogger = {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
const noopClient = {} as Parameters<typeof streamEventToAcpNotifications>[3];

function streamEvent(event: Record<string, unknown>, parentToolUseId: string | null = null) {
  return {
    type: "stream_event",
    event,
    parent_tool_use_id: parentToolUseId,
  } as unknown as Parameters<typeof streamEventToAcpNotifications>[0];
}

function emit(
  cache: Cache,
  event: Record<string, unknown>,
  options?: StreamOptions,
  parentToolUseId: string | null = null,
): Array<{ update: Record<string, unknown> }> {
  return streamEventToAcpNotifications(
    streamEvent(event, parentToolUseId),
    "sess-1",
    cache,
    noopClient,
    noopLogger,
    options,
  );
}

function startWrite(cache: Cache, index = 0, id = "toolu_write_1", options?: StreamOptions) {
  return emit(
    cache,
    {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id, name: "Write", input: {} },
    },
    options,
  );
}

function inputDelta(cache: Cache, partial: string, index = 0, options?: StreamOptions) {
  return emit(
    cache,
    {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partial },
    },
    options,
  );
}

describe("Product Factory adapter: partial tool-input streaming", () => {
  beforeEach(() => {
    process.env.FACTORY_STREAM_TOOL_INPUT = "1";
  });
  afterEach(() => {
    delete process.env.FACTORY_STREAM_TOOL_INPUT;
  });

  it("is fully inert without the env gate — no tracking, no notifications, no cache marker", () => {
    delete process.env.FACTORY_STREAM_TOOL_INPUT;
    const cache: Cache = {};
    startWrite(cache);
    expect(inputDelta(cache, '{"file_path":"/home/user/artifacts/a.html"')).toHaveLength(0);
    expect(Object.keys(cache)).not.toContain("__factoryBlockIndex");
  });

  it("relays input_json_delta for a Write block as tool_call_update meta with monotonic seq", () => {
    const cache: Cache = {};
    startWrite(cache);

    const first = inputDelta(cache, '{"file_path":"/home/user/artifacts/ch');
    expect(first).toHaveLength(1);
    expect(first[0]?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_write_1",
      _meta: {
        claudeCode: {
          toolName: "Write",
          inputJsonDelta: { seq: 1, partialJson: '{"file_path":"/home/user/artifacts/ch' },
        },
      },
    });

    const second = inputDelta(cache, 'eckout.html","content":"<!doctype');
    expect(second[0]?.update).toMatchObject({
      _meta: {
        claudeCode: {
          inputJsonDelta: { seq: 2, partialJson: 'eckout.html","content":"<!doctype' },
        },
      },
    });
  });

  it("keeps per-block isolation: deltas for untracked indexes are dropped as upstream", () => {
    const cache: Cache = {};
    startWrite(cache, 0);
    // A text block's delta at another index must not produce a notification.
    expect(inputDelta(cache, '{"x":1', 3)).toHaveLength(0);
  });

  it("does not track non-file tools", () => {
    const cache: Cache = {};
    emit(cache, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "toolu_bash_1", name: "Bash", input: {} },
    });
    expect(inputDelta(cache, '{"command":"ls')).toHaveLength(0);
  });

  it("stops relaying after content_block_stop and drops empty fragments", () => {
    const cache: Cache = {};
    startWrite(cache);
    expect(inputDelta(cache, "")).toHaveLength(0);
    emit(cache, { type: "content_block_stop", index: 0 });
    expect(inputDelta(cache, '"tail"')).toHaveLength(0);
  });

  it("tracks Edit blocks so revision patches stream too", () => {
    const cache: Cache = {};
    emit(cache, {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "toolu_edit_1", name: "Edit", input: {} },
    });
    const out = inputDelta(cache, '{"old_string":"--accent: oklch(', 1);
    expect(out[0]?.update).toMatchObject({
      toolCallId: "toolu_edit_1",
      _meta: { claudeCode: { toolName: "Edit", inputJsonDelta: { seq: 1 } } },
    });
  });

  it("does not contaminate upstream's tool-use cache", () => {
    const cache: Cache = {};
    const started = startWrite(cache);
    // Upstream still emits the pending tool_call on content_block_start.
    expect(
      started.some((n) => (n.update as { sessionUpdate?: string }).sessionUpdate === "tool_call"),
    ).toBe(true);
    expect(Object.keys(cache)).toEqual(["toolu_write_1"]);
  });

  it("isolates matching block indexes across main and subagent streams", () => {
    const cache: Cache = {};
    startWrite(cache, 0, "toolu_main");
    emit(
      cache,
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_sub", name: "Write", input: {} },
      },
      undefined,
      "toolu_parent_task",
    );

    const mainFirst = inputDelta(cache, '{"file_path":"main.ts","content":"a');
    const subFirst = emit(
      cache,
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"file_path":"sub.ts","content":"b' },
      },
      undefined,
      "toolu_parent_task",
    );

    expect(mainFirst[0]?.update).toMatchObject({
      toolCallId: "toolu_main",
      _meta: { claudeCode: { inputJsonDelta: { seq: 1 } } },
    });
    expect(subFirst[0]?.update).toMatchObject({
      toolCallId: "toolu_sub",
      _meta: {
        claudeCode: {
          parentToolUseId: "toolu_parent_task",
          inputJsonDelta: { seq: 1 },
        },
      },
    });

    emit(cache, { type: "content_block_stop", index: 0 }, undefined, "toolu_parent_task");
    expect(inputDelta(cache, '"tail"')[0]?.update).toMatchObject({
      toolCallId: "toolu_main",
      _meta: { claudeCode: { inputJsonDelta: { seq: 2 } } },
    });
  });

  it("composes raw deltas with upstream completed-field refinements", () => {
    const cache: Cache = {};
    const options: StreamOptions = {
      emittedToolCalls: new Set(),
      streamedToolInputs: new Map(),
    };
    startWrite(cache, 0, "toolu_write_1", options);

    const updates = inputDelta(
      cache,
      '{"file_path":"/home/user/artifacts/checkout.html","content":"<!doctype',
      0,
      options,
    );

    expect(updates).toHaveLength(2);
    expect(updates[0]?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_write_1",
      _meta: {
        claudeCode: {
          inputJsonDelta: {
            seq: 1,
            partialJson: '{"file_path":"/home/user/artifacts/checkout.html","content":"<!doctype',
          },
        },
      },
    });
    expect(updates[1]?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "toolu_write_1",
      rawInput: { file_path: "/home/user/artifacts/checkout.html" },
    });
  });
});
