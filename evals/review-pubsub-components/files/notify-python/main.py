from fastapi import FastAPI

app = FastAPI()


@app.post("/events/pubsub/notifications")
async def on_notification(event: dict) -> dict:
    return {"status": "SUCCESS"}


@app.post("/events/pubsub/alerts")
async def on_alert(event: dict) -> dict:
    return {"status": "SUCCESS"}
