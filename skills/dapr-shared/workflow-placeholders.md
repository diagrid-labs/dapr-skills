# Workflow placeholder vocabulary

Every workflow template file (`dotnet-workflow-class.md`, `dotnet-activity-class.md`, `dotnet-models.md`,
`dotnet-workflow-endpoints.md`) is written against this vocabulary. The create and add skills resolve each
placeholder from the specification interview before copying a template, so the generated application is
about the user's process and never about a built-in sample.

**There is no default workflow.** When the prompt does not say what the workflow does, ask.

## Project placeholders

| Placeholder | Meaning | Example |
|---|---|---|
| `<ProjectRoot>` | root folder and solution name | `LoanReview` |
| `<ProjectName>` | the project folder inside the root | `LoanReviewApp` |
| `<ProjectNamespace>` | the namespace of the project a file lives in | `LoanReviewApp` |

## Domain placeholders

Resolved from the **Check specification** interview. The examples show one resolved loan-review scenario;
they illustrate the rules, they do not replace them.

| Placeholder | Meaning | Example |
|---|---|---|
| `<WorkflowName>` | PascalCase name of the workflow, always ending in `Workflow` | `LoanReviewWorkflow` |
| `<WorkflowInput>` | `<WorkflowName>` without the `Workflow` suffix, plus `Input` | `LoanReviewInput` |
| `<WorkflowOutput>` | the same stem, plus `Output` | `LoanReviewOutput` |
| `<ActivityName>` | PascalCase name of one activity, a verb phrase, always ending in `Activity` | `CheckCreditScoreActivity` |
| `<ActivityInput>` | `<ActivityName>` without the `Activity` suffix, plus `Input` | `CheckCreditScoreInput` |
| `<ActivityOutput>` | the same stem, plus `Output` | `CheckCreditScoreOutput` |
| `<workflowVar>` | camelCase instance name for a workflow or its id in endpoint code | `loanReview` |

### Python forms

Python uses the same concepts with Python casing.

| Placeholder | Meaning | Example |
|---|---|---|
| `<workflow_name>` | snake_case form of `<WorkflowName>`, used for the module and the registered name | `loan_review_workflow` |

### Deriving a name

Every derived name follows its rule exactly. A workflow for shipment approval gives `<WorkflowName>`
`ShipmentApprovalWorkflow`, `<WorkflowInput>` `ShipmentApprovalInput` and `<WorkflowOutput>`
`ShipmentApprovalOutput`. Dropping the `Workflow` or `Activity` suffix, or inventing another shortening,
breaks the convention the `review-workflow-*` skills expect to find.

## Names that are not placeholders

Keep these exactly as written; they come from the SDK, not from the domain:

- `WorkflowContext`, `WorkflowActivityContext`, `RunAsync`, `CallActivityAsync`, `CreateReplaySafeLogger`.
- The `Workflows` and `Activities` folder names, and the `Models` folder name.
