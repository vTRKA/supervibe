#!/usr/bin/env node
import { getTriggerIntentCorpus } from "./lib/supervibe-trigger-intent-corpus.mjs";
import { routeTriggerRequest } from "./lib/supervibe-trigger-router.mjs";
import { evaluateTriggerMatrix, formatTriggerEvaluation } from "./lib/supervibe-trigger-evaluator.mjs";

const corpus = getTriggerIntentCorpus();
const failures = [];

for (const entry of corpus) {
  const route = routeTriggerRequest(entry.phrase, { corpus });
  if (route.intent !== entry.intent) {
    failures.push(`${entry.id}: expected intent ${entry.intent}, got ${route.intent}`);
  }
  if (route.command !== entry.command) {
    failures.push(`${entry.id}: expected command ${entry.command}, got ${route.command}`);
  }
  if (route.skill !== entry.skill) {
    failures.push(`${entry.id}: expected skill ${entry.skill}, got ${route.skill}`);
  }
  if (route.confidence < entry.confidenceFloor) {
    failures.push(`${entry.id}: expected confidence >= ${entry.confidenceFloor}, got ${route.confidence}`);
  }
  if (!route.nextQuestion.includes(entry.nextQuestionIncludes)) {
    failures.push(`${entry.id}: expected next question to include ${entry.nextQuestionIncludes}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Trigger replay passed for ${corpus.length} fixture(s).`);
}

const workflowEvaluation = evaluateTriggerMatrix();
console.log(formatTriggerEvaluation(workflowEvaluation));
if (!workflowEvaluation.pass) {
  process.exitCode = 1;
}
