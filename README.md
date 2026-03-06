# Dapr Workflow Skills

This repository contains skill definitions that can be used with Claude Code to build Dapr Workflow applications.

## Prerequisites

- [Claude Code](https://claude.com/product/claude-code)
- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

## How to use this

- Clone this repo
- Open a terminal and navigate to the cloned repo
- Start Claude Code
- Use a prompt to build a Dapr workflow application (see the example below)
- Depending on your access permissions, you need to approve the usage of some tools during the generation of the .NET project.
- Inspect the README.md file in the new folder after creation of the project.

## Prompt examples

### Example 1: Onboarding process

Create a plan to build a Dapr workflow app in .NET. The workflow automates the onboarding process of a new employee. The first activity is employee registration, which creates a new employeeId in a data store. Then 4 activities are called in parallel:

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

### Example 2: StarTrek Enterprise Diagnostics

Create a .NET Workflow application that performs a diagnostics scan for the spaceship Enterprise from  Star Trek. The diagnostics start with parallel activities for analyzing the hull, analyzing the warp core, ship security protocols, and weapon systems. Once all these analyses are done, data is combined and a call is made that returns recommendations and priorities. the final activity should be a notification to the bridge with the results.

The input for the workflow contains the following fields:

- Ship name
- Date of diagnostics request
- Name of the engineer who request the diagnostic