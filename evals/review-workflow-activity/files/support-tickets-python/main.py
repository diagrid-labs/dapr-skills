import uvicorn
from fastapi import FastAPI, HTTPException
import dapr.ext.workflow as wf

from runtime import wfr
from workflow import support_ticket_workflow
from models import TicketInput

app = FastAPI()
dapr_client = wf.DaprWorkflowClient()


@app.post("/start")
async def start_workflow(ticket: TicketInput):
    instance_id = dapr_client.schedule_new_workflow(
        workflow=support_ticket_workflow,
        instance_id=ticket.id,
        input=ticket,
    )
    return {"instance_id": instance_id}


@app.get("/status/{instance_id}")
async def get_status(instance_id: str):
    state = dapr_client.get_workflow_state(instance_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Workflow instance '{instance_id}' not found.")
    return {"runtime_status": state.runtime_status.name, "output": state.serialized_output}


if __name__ == "__main__":
    wfr.start()
    uvicorn.run(app, host="0.0.0.0", port=5270)
