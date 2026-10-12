import uvicorn
from fastapi import FastAPI
import dapr.ext.workflow as wf

from runtime import wfr
from workflow import loan_application_workflow
from models import EventPayload, LoanApplication

app = FastAPI()
dapr_client = wf.DaprWorkflowClient()


@app.post("/start")
async def start_workflow(application: LoanApplication):
    instance_id = dapr_client.schedule_new_workflow(
        workflow=loan_application_workflow,
        instance_id=application.id,
        input=application,
    )
    return {"instance_id": instance_id}


@app.get("/status/{instance_id}")
async def get_status(instance_id: str):
    state = dapr_client.get_workflow_state(instance_id)
    return state.__dict__


@app.get("/decision/{instance_id}")
async def get_decision(instance_id: str):
    state = dapr_client.wait_for_workflow_completion(instance_id)
    return {"status": state.runtime_status.name, "output": state.serialized_output}


@app.post("/pause/{instance_id}")
async def pause_workflow(instance_id: str):
    dapr_client.pause_workflow(instance_id)
    return {"status": "paused"}


@app.post("/resume/{instance_id}")
async def resume_workflow(instance_id: str):
    dapr_client.resume_workflow(instance_id)
    return {"status": "resumed"}


@app.post("/raise-event/{instance_id}")
async def raise_event(instance_id: str, payload: EventPayload):
    dapr_client.raise_workflow_event(
        instance_id,
        event_name=payload.event_name,
        data=payload.data,
    )
    return {"status": "event_raised"}


@app.delete("/purge/{instance_id}")
async def purge_workflow(instance_id: str):
    dapr_client.purge_workflow(instance_id)
    return {"status": "purged"}


if __name__ == "__main__":
    wfr.start()
    uvicorn.run(app, host="0.0.0.0", port=5280)
