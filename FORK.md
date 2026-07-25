# Fork notice

Fork of [agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)
(Apache-2.0, LICENSE retained), published as `@productfactory/claude-agent-acp`.

The `factory` branch is based on upstream v0.62.0 and carries two deliberately
small deltas:

1. An additive, env-gated streaming change:
   `streamEventToAcpNotifications` relays `input_json_delta` stream events as
   `tool_call_update` notifications carrying
   `_meta.claudeCode.inputJsonDelta = { seq, partialJson }` for file tools
   (Write/Edit/MultiEdit), enabling consumers to reassemble streaming tool
   input (Factory uses this for live design-artifact paint). Gated on
   `FACTORY_STREAM_TOOL_INPUT=1` — default behavior is identical to upstream.
   The raw relay composes with upstream's completed-field tool-input refinements.

2. `@anthropic-ai/claude-agent-sdk` is pinned to stable `0.3.220` (Claude Code
   `2.1.220`) instead of upstream v0.62.0's `0.3.219`. The public TypeScript
   declarations are unchanged between those SDK releases; `2.1.220` is a
   bug-fix/reliability update.

`main` tracks upstream; the delta is intended to be offered upstream.
