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
