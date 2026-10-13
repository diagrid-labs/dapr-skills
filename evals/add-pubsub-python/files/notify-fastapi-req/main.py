from dapr.ext.fastapi import DaprApp
from fastapi import FastAPI

app = FastAPI()
dapr_app = DaprApp(app)


@dapr_app.subscribe(pubsub="pubsub", topic="emails", route="/events/pubsub/emails")
def handle_email(event_data: dict):
    print(f"Sending email: {event_data}", flush=True)
    return {"status": "SUCCESS"}


@app.get("/health")
def health():
    return {"status": "ok"}
