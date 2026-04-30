import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { getTriggerIntentCorpus, validateTriggerIntentCorpus } from "../scripts/lib/supervibe-trigger-intent-corpus.mjs";

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
    ]) {
      assert.equal(phrases.has(phrase), true, phrase);
    }
  });
});
