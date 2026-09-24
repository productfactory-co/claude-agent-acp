# Fork notice

Fork of [agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)
(Apache-2.0, LICENSE retained), published as `@productfactory/claude-agent-acp`.

The release on `main` is based on upstream v0.81.1 (Claude Agent SDK `0.3.280`,
Claude Code `2.1.280`, the first with Opus 5.5) and carries one deliberately
small delta:

An additive, env-gated streaming change: `streamEventToAcpNotifications` relays
`input_json_delta` stream events as `tool_call_update` notifications carrying
`_meta.claudeCode.inputJsonDelta = { seq, partialJson }` for file tools
(Write/Edit/MultiEdit), enabling consumers to reassemble streaming tool input
(Factory uses this for live design-artifact paint). Gated on
`FACTORY_STREAM_TOOL_INPUT=1` — default behavior is identical to upstream.
Upstream's own streamed-input refinement emits only at top-level field
boundaries, so a Write's `content` still arrives whole there; the relay is what
makes character-level paint possible.

The SDK version follows upstream; Factory's standalone `CLAUDE_CODE_VERSION`
pin must match the SDK's bundled Claude Code.

The `upstream` remote tracks the original project; Factory releases land on `main`.
The streaming delta is intended to be offered upstream.

Local verification: `npm run build`, then
`env -u NO_BROWSER -u SSH_CONNECTION -u SSH_CLIENT -u SSH_TTY -u CLAUDE_CODE_REMOTE -u ANTHROPIC_BASE_URL npm test`.
The environment exclusions isolate upstream login-method assertions from the host
remote-session settings. Factory streaming regression tests remain enabled.
