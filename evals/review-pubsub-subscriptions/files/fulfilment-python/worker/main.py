import logging
from contextlib import asynccontextmanager

import uvicorn
from dapr.clients import DaprClient
from fastapi import Body, FastAPI

from streaming import start_subscription

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = DaprClient()
    close = start_subscription(client)
    try:
        yield
    finally:
        close()
        client.close()


app = FastAPI(lifespan=lifespan)


@app.post("/events/pubsub/invoices")
def handle_invoice_event(event: dict = Body(...)) -> dict:
    return {"status": "SUCCESS"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8012)
