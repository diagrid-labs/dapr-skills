# Python structured logging — logging_config.py

Native `dapr-agents` scaffolds include a `logging_config.py` that sets up JSON structured logging with the W3C trace context attached, so log lines can be correlated with Zipkin/OTLP traces.

```python
import json
import logging
import os
import sys

from opentelemetry import trace


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": format(ctx.trace_id, "032x") if ctx.trace_id else None,
            "span_id": format(ctx.span_id, "016x") if ctx.span_id else None,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    root = logging.getLogger()
    root.setLevel(os.getenv("LOG_LEVEL", "INFO"))
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
```

### Usage in `main.py`

```python
from logging_config import configure_logging

configure_logging()
```

Call `configure_logging()` before importing anything from `dapr_agents`, so the library picks up the handlers.

### Key points

- JSON log output is readable by Grafana Loki, Datadog, Elastic, and the Diagrid Catalyst log UI without extra parsing.
- `trace_id` / `span_id` are the standard W3C Trace Context identifiers — the same IDs Dapr writes into traces — so a log line can be jumped to its Zipkin trace by ID.
- Tools should log via `logger = logging.getLogger(__name__)`, never bare `print(`. `print` bypasses the handler and loses trace correlation.
- Set `LOG_LEVEL=debug` in the environment when diagnosing; the default is `INFO`.
