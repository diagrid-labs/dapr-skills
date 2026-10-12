from datetime import datetime

from pydantic import BaseModel


class SensorAlertInput(BaseModel):
    id: str
    sensor_id: str
    value: float


class ReadingInput(BaseModel):
    sensor_id: str
    value: float
    threshold: float


class NotificationRequest(BaseModel):
    alert_id: str
    sensor_id: str
    severity: str


class AlertRecord(BaseModel):
    alert_id: str
    sensor_id: str
    severity: str
    detected_at: datetime
    escalate_by: datetime
    notified: bool


class AlertResult(BaseModel):
    alert_id: str
    severity: str
    notified: bool
