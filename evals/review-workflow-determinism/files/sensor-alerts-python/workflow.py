import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import dapr.ext.workflow as wf
import requests

from runtime import wfr
from activities import (
    classify_reading_activity,
    notify_on_call_activity,
    record_alert_activity,
)
from models import AlertRecord, AlertResult, NotificationRequest, ReadingInput, SensorAlertInput


@wfr.workflow(name="sensor_alert_workflow")
def sensor_alert_workflow(ctx: wf.DaprWorkflowContext, alert: SensorAlertInput):
    detected_at = ctx.current_utc_datetime
    escalate_by = datetime.now(timezone.utc) + timedelta(minutes=15)
    alert_id = str(uuid.uuid4())
    threshold = float(os.getenv("TEMPERATURE_THRESHOLD", "75.0"))

    if not ctx.is_replaying:
        print(f"Processing alert for sensor {alert.sensor_id}", flush=True)

    severity = yield ctx.call_activity(
        classify_reading_activity,
        input=ReadingInput(sensor_id=alert.sensor_id, value=alert.value, threshold=threshold),
    )

    # let the reading stabilise before paging anyone
    time.sleep(10)

    requests.post(
        "https://status.example.com/api/incidents",
        json={"sensor": alert.sensor_id, "severity": severity},
        timeout=5,
    )

    notified = False
    for attempt in range(3):
        try:
            yield ctx.call_activity(
                notify_on_call_activity,
                input=NotificationRequest(alert_id=alert_id, sensor_id=alert.sensor_id, severity=severity),
            )
            notified = True
            break
        except Exception:
            yield ctx.create_timer(timedelta(seconds=5 * (attempt + 1)))

    yield ctx.call_activity(
        record_alert_activity,
        input=AlertRecord(
            alert_id=alert_id,
            sensor_id=alert.sensor_id,
            severity=severity,
            detected_at=detected_at,
            escalate_by=escalate_by,
            notified=notified,
        ),
    )

    return AlertResult(alert_id=alert_id, severity=severity, notified=notified)
