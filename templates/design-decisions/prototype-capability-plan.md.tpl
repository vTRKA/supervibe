# Prototype Capability Plan

Prototype: <slug>
Mode: <native-static | enhanced-native | bundled-dependency | framework-sandbox | handoff-only>
Owner: <agent or skill>
Date: <YYYY-MM-DD>

## Purpose

<What user-visible design or UX outcome this capability proves.>

## Libraries / APIs

- <library or browser API name> - <why this one fits>

## Artifact Scope

- Files affected: <prototype files or handoff-only docs>
- Runtime scope: <above fold / route / component / state>
- Non-goals: <what this dependency must not own>

## Rejected Native Alternative

<What native CSS/WAAPI/Canvas/SVG/local-asset approach was considered and why it is not enough.>

## License / Security

- License posture: <acceptable / needs review / blocked>
- Remote runtime imports: <none / reviewed exception / handoff-only>
- Supply-chain note: <lockfile, local vendor bundle, or production handoff owner>

## Bundle / Performance

- Estimated added size: <KB or N/A>
- Loading strategy: <eager / lazy / below fold / handoff-only>
- Performance risk: <main-thread, GPU, memory, layout, paint>
- Budget evidence: <command, profiler note, or reviewer check>

## Accessibility Fallback

- Semantic DOM fallback: <description>
- Keyboard/touch path: <description>
- Text alternative or adjacent explanation: <description>
- Static fallback for low-capability devices: <description>

## Reduced-Motion Fallback

<How `prefers-reduced-motion: reduce` changes or disables the effect. Vestibular triggers must be removed, not merely shortened.>

## Verification Commands

```bash
<command or reviewer action>
```

## Approval Notes

- Approved by: <user / reviewer / handoff-only>
- Reviewer notes: <ui-polish-reviewer and accessibility-reviewer findings>
