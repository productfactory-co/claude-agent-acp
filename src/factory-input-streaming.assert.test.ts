import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Regression suite for the vendored adapter patch (vendor/README.md).
// Exercises the REAL installed dist so a future adapter upgrade that loses
// the patch fails here, not in production paint quality.
// @ts-expect-error -- deep dist import, no exported types for this path
import { streamEventToAcpNotifications } from "../dist/acp-agent.js";

type Cache = Record<string, unknown>;

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const noopClient = {};

function streamEvent(event: Record<string, unknown>) {
  return { type: "stream_event", event, parent_tool_use_id: null } as Record<string, unknown>;
}

function emit(cache: Cache, event: Record<string, unknown>): Array<{ update: Record<string, unknown> }> {
  return streamEventToAcpNotifications(streamEvent(event), "sess-1", cache, noopClient, noopLogger, undefined);
}

function startWrite(cache: Cache, index = 0, id = "toolu_write_1") {
  return emit(cache, {
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id, name: "Write", input: {} },
  });
}

function inputDelta(cache: Cache, partial: string, index = 0) {
  return emit(cache, {
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: partial },
  });
}

describe("vendored adapter: partial tool-input streaming (FACTORY PATCH)", () => {
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
      _meta: { claudeCode: { inputJsonDelta: { seq: 2, partialJson: 'eckout.html","content":"<!doctype' } } },
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

  it("reserved cache key does not disturb upstream tool_call emission for the same block", () => {
    const cache: Cache = {};
    const started = startWrite(cache);
    // Upstream still emits the pending tool_call on content_block_start.
    expect(started.some((n) => (n.update as { sessionUpdate?: string }).sessionUpdate === "tool_call")).toBe(true);
    // And the reserved key never leaks a fake tool entry: only the real id plus marker.
    expect(Object.keys(cache).sort()).toEqual(["__factoryBlockIndex", "toolu_write_1"]);
  });
});
