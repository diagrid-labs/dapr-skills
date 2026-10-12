import uuid

import uvicorn
from fastapi import FastAPI, HTTPException
import dapr.ext.workflow as wf

from runtime import wfr
from workflow import sensor_alert_workflow
from models import SensorAlertInput

app = FastAPI()
dapr_client = wf.DaprWorkflowClient()


@app.post("/start")
async def start_workflow(alert: SensorAlertInput):
    # Generating ids here is fine: this is not workflow code.
    instance_id = alert.id or f"alert-{uuid.uuid4()}"
    dapr_client.schedule_new_workflow(
        workflow=sensor_alert_workflow,
        instance_id=instance_id,
        input=alert,
    )
    return {"instance_id": instance_id}


@app.get("/status/{instance_id}")
async def get_status(instance_id: str):
    state = dapr_client.get_workflow_state(instance_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found.")
    return {"runtime_status": state.runtime_status.name, "output": state.serialized_output}


@app.post("/terminate/{instance_id}")
async def terminate_workflow(instance_id: str):
    dapr_client.terminate_workflow(instance_id)
    return {"status": "terminated"}


if __name__ == "__main__":
    wfr.start()
    uvicorn.run(app, host="0.0.0.0", port=5260)
