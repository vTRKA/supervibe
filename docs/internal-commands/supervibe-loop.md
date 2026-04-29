# Internal Notes: /supervibe-loop

The public command lives at `commands/supervibe-loop.md`. This internal note
records implementation boundaries for maintainers: the loop is bounded,
cancellable, policy-gated, and must not be used as hidden background automation.
