const HIGH_RISK_PATTERNS = [
  /production mutation/i,
  /credential/i,
  /billing/i,
  /dns/i,
  /deploy/i,
  /account/i,
  /access-control/i,
  /destructive/i,
  /mcp writeback/i,
];

export function classifyOperationRisk(operationClass = '') {
  const text = String(operationClass || '');
  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text))) return 'high';
  if (/interactive|browser|external write|filesystem write/i.test(text)) return 'medium';
  return 'low';
}

export function scanAgenticSecurityPolicy({ operations = [] } = {}) {
  const findings = [];
  for (const operation of operations) {
    const risk = classifyOperationRisk(operation.class || operation.type || operation.id);
    const approval = operation.approval || 'missing';
    if (risk === 'high' && (approval === 'missing' || approval === 'not-required')) {
      findings.push({
        operationId: operation.id || 'unknown',
        code: 'hitl-approval-required',
        severity: 'high',
        message: 'High-risk agentic operation requires an explicit human approval lease.',
        risk,
      });
    }
  }
  return {
    pass: findings.length === 0,
    score: findings.length === 0 ? 10 : Math.max(0, 10 - findings.length),
    findings,
  };
}

export function formatAgenticSecurityReport(report) {
  return [
    'SUPERVIBE_AGENTIC_SECURITY',
    `PASS: ${report.pass ? 'true' : 'false'}`,
    `SCORE: ${report.score}/10`,
    `FINDINGS: ${report.findings.length}`,
    ...report.findings.map((finding) => `- ${finding.severity}: ${finding.operationId} ${finding.code} - ${finding.message}`),
  ].join('\n');
}
