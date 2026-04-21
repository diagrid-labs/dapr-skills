# Dapr Workflow Skills

This repository contains skill definitions that can be used with Claude Code to build Dapr Workflow applications.

- Text-spec skills: `create-workflow-dotnet`, `create-workflow-aspire`, `create-workflow-python` — describe the workflow in natural language and scaffold a runnable project.
- Diagram-input skill: `create-workflow-from-diagram` — provide a workflow diagram (PNG / JPG / JPEG / GIF / WebP) or a BPMN 2.0 XML file; the skill extracts structure and generates code for Go, Python, .NET, Java, or JavaScript.
- Review skills: `review-workflow-determinism`, `review-workflow-activity`, `review-workflow-management` — audit an existing project.

## Prerequisites

- [Claude Code](https://claude.com/product/claude-code)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)

### For .NET skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### For Python skills

- [Python 3.12+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

## How to use this

1. Clone this repo
2. Open a terminal and navigate to the cloned repo
3. Start Claude Code
4. OPTIONAL: Run the `check-prereq-xxx` skill to verify your environment (e.g., "check prerequisites for .NET", "check prerequisites for Aspire", or "check prerequisites for Python"). Follow the instructions if the prerequisites are not met.
5. Run the `create-workflow-xxx` skill to scaffold the project (see the prompt examples below)
6. Depending on your access permissions, you need to approve the usage of some tools during the generation of the project.
7. Inspect the README.md file in the new folder after creation of the project.

## Prompt examples

### Example 1: .NET Aspire Onboarding process

Create a Dapr workflow app in .NET with Aspire named EmployeeOnboarding. The workflow automates the onboarding process of a new employee. The first activity is employee registration, which creates a new employeeId in a data store. Then 4 activities are called in parallel:

  1. AddEmployeeToInternalCommsTool
  2. AddEmployeeToBenefitsProgram
  3. UpdateOrgChart
  4. SendWelcomePackage

The input for the workflow contains the following fields:

- First name
- Last name
- Address
- Department

The input records for the 4 parallel activities include the employeeId. The workflow output should include the employeeId.

### Example 2: .NET StarTrek Enterprise Diagnostics

Create a .NET Workflow application named EnterpriseDiagnostics that performs a diagnostics scan for the spaceship Enterprise from Star Trek. The diagnostics start with parallel activities for analyzing the hull, analyzing the warp core, ship security protocols, and weapon systems. Once all these analyses are done, data is combined and a call is made that returns recommendations and priorities. The final activity should be a notification to the bridge with the results.

The input for the workflow contains the following fields:

- Ship name
- Date of diagnostics request
- Name of the engineer who requested the diagnostic

Use mock inputs and outputs for the activities.

### Example 3: Python Order Processing

Create a Dapr workflow app in Python named order_processing. The workflow processes an order. The first activity validates the order. Then 2 activities run in parallel:

  1. ReserveInventory
  2. ProcessPayment

Once both complete, a final activity sends an order confirmation.

The input for the workflow contains the following fields:

- Order ID
- Customer name
- Items (list)
- Total amount

### Example 4: Python StarTrek Enterprise Diagnostics

Create a Python Workflow application named enterprise_diagnostics that performs a diagnostics scan for the spaceship Enterprise from Star Trek. The diagnostics start with parallel activities for analyzing the hull, analyzing the warp core, ship security protocols, and weapon systems. Once all these analyses are done, data is combined and a call is made that returns recommendations and priorities. The final activity should be a notification to the bridge with the results.

The input for the workflow contains the following fields:

- Ship name
- Date of diagnostics request
- Name of the engineer who requested the diagnostic

### Example 5: Generate a Dapr workflow from a diagram

Drop a workflow diagram or BPMN file into the chat and ask Claude Code to scaffold a Dapr workflow app from it:

> Create a Dapr workflow in Python from this diagram. *(attach `.claude/skills/create-workflow-from-diagram/examples/pizza-order.png`)*

> Scaffold a Go Dapr workflow from this BPMN file. *(attach `.claude/skills/create-workflow-from-diagram/examples/order-process.bpmn`)*

The skill extracts the workflow structure into an intermediate representation, validates it, and writes a runnable project in the chosen language. See `.claude/skills/create-workflow-from-diagram/REFERENCE.md` for the IR format and per-language notes.