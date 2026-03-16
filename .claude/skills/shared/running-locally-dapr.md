# Running Locally

Start the application using the Dapr CLI from the project root:

```shell
dapr run -f .
```

This reads the `dapr.yaml` multi-app run file and launches the app with its Dapr sidecar.

To inspect workflow executions, run the Diagrid Dev Dashboard:

```shell
docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest
```

Then open `http://localhost:8080` in a browser to view workflow instances, their status, and execution history.
