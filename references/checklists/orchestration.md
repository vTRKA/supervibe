# Orchestration Reference Pack

- Name the owner command, responsible orchestrator, worker lanes, reviewer timing, and final gate.
- Dispatch independent tasks in parallel when the graph allows it.
- Keep full tests and reviewer sweeps at the end unless a narrow blocker requires earlier proof.
- Stop idle background processes and stale claims.
