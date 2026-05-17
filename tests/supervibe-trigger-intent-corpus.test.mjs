import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { getTriggerIntentCorpus, validateTriggerIntentCorpus } from "../scripts/lib/supervibe-trigger-intent-corpus.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

describe("supervibe trigger intent corpus", () => {
  it("is internally valid", () => {
    const result = validateTriggerIntentCorpus();
    assert.deepEqual(result.issues, []);
    assert.equal(result.pass, true);
  });

  it("matches the published JSON schema", () => {
    const schema = JSON.parse(fs.readFileSync("schemas/supervibe-trigger-intent.schema.json", "utf8"));
    const ajv = new Ajv2020();
    const validate = ajv.compile(schema);

    for (const entry of getTriggerIntentCorpus()) {
      assert.equal(validate(entry), true, JSON.stringify(validate.errors));
    }
  });

  it("covers the Russian escalation phrases from user feedback", () => {
    const phrases = new Set(getTriggerIntentCorpus().map((entry) => entry.phrase));
    for (const phrase of [
      "я сделал брейншторм",
      "после плана сделай ревью луп",
      "создай эпик из плана",
      "запусти эпик автономно в отдельном worktree",
      "почему не сработал триггер?",
      "обнови README под это",
      "show summary before creating documentation",
      "покажи саммари перед созданием документации",
      "explain this system visually with a text-first summary before implementation",
    ]) {
      assert.equal(phrases.has(phrase), true, phrase);
    }
  });

  it("routes exact create-epic phrases through the user-approved plan path", () => {
    const exactRoute = routeTriggerRequest("create an epic from the plan");
    assert.equal(exactRoute.intent, "create_epic");
    assert.equal(exactRoute.phase, "plan_approved");
    assert.equal(exactRoute.command, "/supervibe-loop --atomize-plan <plan-path> --user-approved-plan");

    for (const entry of getTriggerIntentCorpus().filter((item) => item.intent === "create_epic" || item.intent === "atomize_plan")) {
      assert.equal(entry.phase, "plan_approved", entry.id);
      assert.doesNotMatch(entry.command, new RegExp(["--from-plan", "--create-epic"].join(" "), "u"), entry.id);
    }
  });

  it("covers agent-system audit and anti-emulation phrases", () => {
    const phrases = new Set(getTriggerIntentCorpus().map((entry) => entry.phrase));
    for (const phrase of [
      "audit agent system maturity and intent routing",
      "check whether agents are really invoked with receipts instead of emulation",
      "оцени агентскую систему интенты receipts skills rag codegraph на 10 из 10",
      "проверь что агенты реально вызываются а не эмулируются",
    ]) {
      assert.equal(phrases.has(phrase), true, phrase);
    }
  });
});
