# Host Neutral Hook Portability

Provider hook patterns must be ported through Supervibe adapter contracts, not copied from a single host into shared surfaces.

- Claude-specific hooks stay in Claude-managed surfaces unless an adapter translates the behavior.
- Codex, Gemini, Cursor, OpenCode, and Claude support must be documented or explicitly scoped out.
- Unsupported hosts must fail closed with a clear diagnostic instead of silently skipping required proof.
- Shared logic must use host-neutral receipt, provider capability, and workflow state APIs.
