# Fork notice

Fork of [agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)
(Apache-2.0, LICENSE retained), published as `@productfactory/claude-agent-acp`.

The release on `main` is based on upstream v0.75.1 and carries two deliberately
small deltas:

1. An additive, env-gated streaming change:
   `streamEventToAcpNotifications` relays `input_json_delta` stream events as
   `tool_call_update` notifications carrying
   `_meta.claudeCode.inputJsonDelta = { seq, partialJson }` for file tools
   (Write/Edit/MultiEdit), enabling consumers to reassemble streaming tool
   input (Factory uses this for live design-artifact paint). Gated on
   `FACTORY_STREAM_TOOL_INPUT=1` — default behavior is identical to upstream.
   The raw relay composes with upstream's completed-field tool-input refinements.

2. `@anthropic-ai/claude-agent-sdk` is pinned to stable `0.3.281` (Claude Code
   `2.1.281`) instead of upstream v0.75.1's `0.3.257`, including Fable 5.1 and
   Opus 5.5 support (the `opus` alias resolves to `claude-opus-5-5` from
   2.1.280) and subsequent SDK fixes.

The `upstream` remote tracks the original project; Factory releases land on `main`.
The streaming delta is intended to be offered upstream.

Local verification: `npm run build`, then
`env -u NO_BROWSER -u SSH_CONNECTION -u SSH_CLIENT -u SSH_TTY -u CLAUDE_CODE_REMOTE -u ANTHROPIC_BASE_URL npm test`.
The environment exclusions isolate upstream login-method assertions from the host
remote-session settings. Factory streaming regression tests remain enabled.
