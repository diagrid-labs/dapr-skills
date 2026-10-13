# Running Locally

Start the application using the Dapr CLI from the project root:

```shell
dapr run -f .
```

This reads the `dapr.yaml` multi-app run file and launches the app with its Dapr sidecar.

To inspect workflow executions, use the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). It finds apps started with `dapr run` without extra setup. Install it once:

- macOS / Linux:

  ```shell
  curl -sSL https://raw.githubusercontent.com/diagridio/dev-dashboard/main/scripts/install.sh | sh
  ```

- Windows (PowerShell):

  ```powershell
  iwr -useb https://raw.githubusercontent.com/diagridio/dev-dashboard/main/scripts/install.ps1 | iex
  ```

Then start it in a second terminal once the app is running:

```shell
diagrid-dev-dashboard
```

It opens `http://localhost:9090`, where you can view workflow instances, their status and execution history, plus sidecars, components and logs.
