from fastapi import FastAPI

app = FastAPI()


@app.post("/events/pubsub/orders")
async def on_order(event: dict) -> dict:
    return {"status": "SUCCESS"}


@app.post("/events/pubsub/orders-deadletter")
async def on_dead_letter(event: dict) -> dict:
    return {"status": "SUCCESS"}
