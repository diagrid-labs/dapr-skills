# Check Docker or Podman

Run `docker info` (on Windows, retry with `powershell -Command "docker info"` if needed). If Docker is unavailable, try `podman info` (on Windows, retry with `powershell -Command "podman info"` if needed). At least one container runtime must be available and running. If neither is available, inform the user they need to install [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation).
