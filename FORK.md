# Fork notice

Fork of [agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)
(Apache-2.0, LICENSE retained), published as `@productfactory/claude-agent-acp`.

One additive, env-gated change on the `factory` branch (based on v0.58.1):
`streamEventToAcpNotifications` relays `input_json_delta` stream events as
`tool_call_update` notifications carrying
`_meta.claudeCode.inputJsonDelta = { seq, partialJson }` for file tools
(Write/Edit/MultiEdit), enabling consumers to reassemble streaming tool
input (Factory uses this for live design-artifact paint). Gated on
`FACTORY_STREAM_TOOL_INPUT=1` — default behavior is identical to upstream.

`main` tracks upstream; the delta is intended to be offered upstream.
