export const REQUIRED_AGENT_FIELDS = [
  'name',
  'namespace',
  'description',
  'persona-years',
  'capabilities',
  'stacks',
  'tools',
  'skills',
  'verification',
  'anti-patterns',
  'version',
  'last-verified',
  'verified-against'
];

export const REQUIRED_SKILL_FIELDS = [
  'name',
  'namespace',
  'description',
  'allowed-tools',
  'phase',
  'emits-artifact',
  'confidence-rubric',
  'gate-on-exit',
  'version'
];

export const REQUIRED_RULE_FIELDS = [
  'name',
  'description',
  'applies-to',
  'version',
  'last-verified'
];

export function validateFrontmatter(data, type) {
  let required;
  switch (type) {
    case 'agent': required = REQUIRED_AGENT_FIELDS; break;
    case 'skill': required = REQUIRED_SKILL_FIELDS; break;
    case 'rule':  required = REQUIRED_RULE_FIELDS;  break;
    default: throw new Error(`Unknown frontmatter type: ${type}`);
  }

  const missing = required.filter(field => !(field in data));
  return {
    pass: missing.length === 0,
    missing,
    type
  };
}
