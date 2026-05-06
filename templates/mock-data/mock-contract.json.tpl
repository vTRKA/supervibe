{
  "contractStatus": "<api-backed|schema-backed|data-model-backed|provisional>",
  "owner": "<api-designer|data-modeler|product-owner|backend-owner>",
  "sourceArtifacts": [
    "<openapi.yaml|schema.graphql|spec.md|data-model.md>"
  ],
  "schemaRefs": [
    "<contract reference or provisional reason>"
  ],
  "entities": [
    {
      "name": "<entity-name>",
      "fields": [
        {
          "name": "<field>",
          "type": "<type>",
          "required": true,
          "notes": "<layout, validation, or backend note>"
        }
      ]
    }
  ],
  "endpoints": [
    {
      "method": "GET",
      "path": "/v1/<resource>",
      "fixtureSet": "<fixture-set-name>",
      "responseEnvelope": "<problem+json|plain-json|graphql|custom>",
      "pagination": "<none|cursor|page|offset>",
      "authState": "<public|authenticated|role-gated>"
    }
  ],
  "piiPolicy": {
    "syntheticOnly": true,
    "forbiddenSources": ["production exports", "customer records", "secrets", "tokens"]
  },
  "backendQuestions": [
    "<question required before backend-ready handoff>"
  ],
  "driftRule": "Any removed field, renamed property, narrowed type, changed requiredness, pagination change, or error-envelope change requires mock update and frontend review.",
  "switchToLiveRule": "Replace local fixture fetches only after the live endpoint returns the same response envelope for every required scenario."
}
