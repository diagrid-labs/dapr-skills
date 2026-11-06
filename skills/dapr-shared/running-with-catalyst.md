# Running with Diagrid

Once the workflow app is completely built, run it with [Diagrid](https://catalyst.diagrid.io/) to visually inspect the workflow and perform workflow management operations.

1. Sign up at [catalyst.diagrid.io](https://catalyst.diagrid.io/) and install the [Diagrid CLI](https://docs.diagrid.io/references/catalyst-cli-reference/intro/).
2. Run the application from the project root:

```shell
diagrid dev run --project <ProjectName> -f dapr.yaml --approve
```

**Important:  <ProjectName> must be all lowercase when using the diagrid CLI.**

This uses the same `dapr.yaml` multi-app run file but connects the local workflow application to Diagrid instead of using a local Dapr process, giving access to the Diagrid Console for monitoring and managing workflow executions.
