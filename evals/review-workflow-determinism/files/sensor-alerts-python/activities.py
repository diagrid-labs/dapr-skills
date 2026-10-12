import logging
import os
from datetime import datetime, timezone

import requests

from runtime import wfr
from models import AlertRecord, NotificationRequest, ReadingInput

logger = logging.getLogger(__name__)

PAGER_URL = os.getenv("PAGER_URL", "https://pager.example.com/api/pages")


@wfr.activity(name="classify_reading_activity")
def classify_reading_activity(ctx, reading: ReadingInput) -> str:
    if reading.value >= reading.threshold * 1.2:
        return "critical"
    if reading.value >= reading.threshold:
        return "warning"
    return "info"


@wfr.activity(name="notify_on_call_activity")
def notify_on_call_activity(ctx, request: NotificationRequest) -> None:
    # Wall-clock time and HTTP calls are expected in activities.
    sent_at = datetime.now(timezone.utc).isoformat()
    response = requests.post(
        PAGER_URL,
        json={"alert_id": request.alert_id, "severity": request.severity, "sent_at": sent_at},
        headers={"Idempotency-Key": f"page-{request.alert_id}"},
        timeout=10,
    )
    response.raise_for_status()
    logger.info("Paged on-call engineer for alert %s", request.alert_id)


@wfr.activity(name="record_alert_activity")
def record_alert_activity(ctx, record: AlertRecord) -> None:
    # TODO: persist the alert to the incident store
    logger.info("Recorded alert %s (%s)", record.alert_id, record.severity)
