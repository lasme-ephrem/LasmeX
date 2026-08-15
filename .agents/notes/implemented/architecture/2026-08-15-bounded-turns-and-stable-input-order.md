# Agent Note: Bounded turns and stable entered-message order

Status: implemented

English | [中文](2026-08-15-bounded-turns-and-stable-input-order.zh.md)

## Problem

The inherited agent loop admitted an unbounded number of steps per turn and kept the entered-message array in producer order. A tool chain without new direct input could therefore run away, and an injected context message produced after the user's request could bury the direct prompt at the tail of the model request. Result-only continuations also left the model free to repeat tools it had already called.

## Decision

`lasmex-agent-loop` validates `maxStepsPerTurn` from plugin configuration: a positive safe integer, defaulting to `DEFAULT_MAX_STEPS_PER_TURN` (64). A step beyond the configured limit is rejected with the `MAX_STEPS` error instead of being admitted.

`orderEnteredMessages` stably partitions every admitted entered message: non-user-sourced messages come first, `source.kind === 'user'` messages last. Both groups keep producer order and message identity, so instructions, runtime context, and catalogs precede the direct prompt in both the durable log and the model request.

On a result-only continuation, `continuationAnchor` appends a plugin notice after the tool results. The notice lists every tool already called in the turn, forbids repeating those tools merely to satisfy the quoted request, and quotes the latest direct request's text so its remaining response instruction stays at the tail. The original message and tool history are unchanged.

A rejected or empty first claim still closes a durable turn that spent no step, so the log records the attempt.

## Alternatives considered

**Keep the inherited loop behavior.** Unbounded turns and producer-order entry are what upstream ships. The fork accepts the divergence because a bounded turn is a product safety property, and a direct prompt buried under injected context weakens instruction fidelity.

**Rewrite the direct user message instead of appending a notice.** Editing the durable message would change what the log reconstructs and would lose the distinction between user text and loop policy.

**Reject result-only continuations entirely.** Some workflows legitimately continue after tool results without new input; refusing them would break multi-step tool chains.

**Fix the cap as a constant.** A deployment-varying limit belongs in validated `Config` changeable from `cordis.yml`; a `DEFAULT_*` constant alone is not configurability.

## Consequences

Turns now terminate deterministically with `MAX_STEPS` instead of running until the model stops. Entered-message order is stable across producers, so a plugin that injects context cannot bury the direct request. The continuation notice is a regular `user/message` with a `plugin` source, so `SESSION_FORMAT_VERSION` stays unchanged. Package tests cover the `MAX_STEPS` rejection, and the keyless `context-before-prompt` CLI snapshot covers the stable ordering in the assembled application.
