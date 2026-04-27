const TRIGGER_PATTERN = /\b(use|invoke)\s+(when|before|after|on|while)\b/i;
const PURPOSE_PATTERN = /\bto\s+\w{2,}/i;
const MIN_DESCRIPTION_LENGTH = 30;

export function checkTriggerClarity(description) {
  if (!description || description.length < MIN_DESCRIPTION_LENGTH) {
    return { pass: false, score: 0, reason: 'description too short or empty' };
  }

  const hasTrigger = TRIGGER_PATTERN.test(description);
  const hasPurpose = PURPOSE_PATTERN.test(description);

  if (hasTrigger && hasPurpose) {
    return { pass: true, score: 2, reason: 'has trigger phrase and purpose verb' };
  }

  if (hasTrigger && !hasPurpose) {
    return { pass: false, score: 1, reason: 'has trigger but no clear purpose' };
  }

  return { pass: false, score: 0, reason: 'no clear trigger phrase (WHEN/BEFORE/AFTER/ON/WHILE)' };
}
