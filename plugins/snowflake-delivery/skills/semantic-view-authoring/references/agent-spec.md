# CREATE AGENT: the specification this skill uses

Official reference: https://docs.snowflake.com/en/sql-reference/sql/create-agent

This page lists only the keys that appear in the source lab script. For other tools (search, custom tools), other
`models` values and other keys, read the official reference. Do not invent keys.

## Shape

```
CREATE OR REPLACE AGENT <db>.<schema>.<agent_name>
  COMMENT = '<one line: what questions it answers>'
  PROFILE = '{"display_name": "<Name>", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    budget:
      seconds: 30
      tokens: 16000

  instructions:
    response: "<tone and format of answers>"
    orchestration: "<when to use which tool>"
    sample_questions:
      - question: "<question 1>"
      - question: "<question 2>"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "<Tool Name>"
        description: "<what the tool answers, in business words>"

  tool_resources:
    "<Tool Name>":
      semantic_view: "<db>.<schema>.<semantic_view_name>"
      execution_environment:
        type: "warehouse"
        warehouse: "<WAREHOUSE>"
  $$
;
```

## Key by key

| Key | Meaning | Notes |
|---|---|---|
| `models.orchestration` | model that plans tool calls | the lab used `auto` |
| `orchestration.budget.seconds` / `.tokens` | per-question limits | lab values 30 and 16000; raise only with a reason |
| `instructions.response` | how to answer | the lab used "Respond concisely" |
| `instructions.orchestration` | routing rule | name the tool and the topics it covers |
| `instructions.sample_questions` | example questions shown to users | use the same questions as the verification queries |
| `tools[].tool_spec.type` | tool kind | `cortex_analyst_text_to_sql` binds to a semantic view |
| `tools[].tool_spec.name` | tool name | must match the key under `tool_resources` exactly, including case and spaces |
| `tools[].tool_spec.description` | what the tool answers | the model reads this to decide when to call the tool |
| `tool_resources.<name>.semantic_view` | fully qualified semantic view | database, schema and view name |
| `tool_resources.<name>.execution_environment` | where generated SQL runs | `type: "warehouse"` and a warehouse name |

## Rules

- The tool name in `tool_spec.name` and the key in `tool_resources` are the same string.
- The role that runs the agent needs `USAGE` on the warehouse and `SELECT` on the semantic view. (Privilege names:
  confirm in the docs.)
- Sample questions must be answerable by the semantic view. If a sample question needs a metric that does not exist,
  add the metric or remove the question.
- Never put secrets or real customer names in `COMMENT`, `description` or sample questions.
- The `$$ ... $$` block is YAML. Indent with spaces, never tabs.

## Smoke test

After creating the agent, ask each sample question in Snowsight and compare the answer to the reconciled
`SEMANTIC_VIEW(...)` query for the same question. **UNVERIFIED:** the way to call an agent from SQL or the REST API
is not covered by the lab scripts. See the docs page above.
