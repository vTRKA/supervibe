{
  "scenarios": [
    {
      "id": "success",
      "label": "Successful response",
      "uiState": "success",
      "fixture": "api-fixtures/success.json",
      "httpStatus": 200,
      "latencyMs": 120,
      "acceptance": "Primary content renders without layout shift or overflow."
    },
    {
      "id": "loading",
      "label": "Loading state",
      "uiState": "loading",
      "fixture": "api-fixtures/loading.json",
      "httpStatus": 200,
      "latencyMs": 1500,
      "acceptance": "Skeleton or busy state is visible and accessible."
    },
    {
      "id": "empty",
      "label": "Empty result",
      "uiState": "empty",
      "fixture": "api-fixtures/empty.json",
      "httpStatus": 200,
      "latencyMs": 120,
      "acceptance": "Empty message and next action are visible."
    },
    {
      "id": "error",
      "label": "Server error",
      "uiState": "error",
      "fixture": "api-fixtures/error.json",
      "httpStatus": 500,
      "latencyMs": 120,
      "acceptance": "Actionable error message and retry path render."
    },
    {
      "id": "permission",
      "label": "Permission denied",
      "uiState": "permission",
      "fixture": "api-fixtures/permission.json",
      "httpStatus": 403,
      "latencyMs": 120,
      "acceptance": "Permission copy explains what is blocked and what to do next."
    },
    {
      "id": "validation",
      "label": "Validation failure",
      "uiState": "validation",
      "fixture": "api-fixtures/validation.json",
      "httpStatus": 422,
      "latencyMs": 120,
      "acceptance": "Field-level and form-level errors render with focus guidance."
    },
    {
      "id": "partial",
      "label": "Partial response",
      "uiState": "partial",
      "fixture": "api-fixtures/partial.json",
      "httpStatus": 206,
      "latencyMs": 120,
      "acceptance": "Missing optional data does not break layout or actions."
    },
    {
      "id": "large-list",
      "label": "Large list",
      "uiState": "success",
      "fixture": "api-fixtures/large-list.json",
      "httpStatus": 200,
      "latencyMs": 220,
      "acceptance": "Pagination, truncation, and scroll behavior hold under realistic volume."
    }
  ]
}
