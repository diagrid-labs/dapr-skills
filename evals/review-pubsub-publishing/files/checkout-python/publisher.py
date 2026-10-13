import json

from dapr.aio.clients import DaprClient as AioDaprClient
from dapr.clients import DaprClient
from dapr.clients.exceptions import DaprGrpcError
from pydantic import BaseModel


class OrderPlaced(BaseModel):
    order_id: str
    customer_id: str
    amount: float


async def publish_unawaited(order: OrderPlaced) -> None:
    async with AioDaprClient() as client:
        client.publish_event(  # SEED DPS-PUB-001
            pubsub_name="pubsub",
            topic_name="orders",  # SEED DPS-PUB-009
            data=order.model_dump_json(),
            data_content_type="application/json",
        )


def publish_swallowed(order: OrderPlaced) -> dict:
    try:
        with DaprClient() as client:
            client.publish_event(
                pubsub_name="pubsub",
                topic_name="orders",
                data=order.model_dump_json(),
                data_content_type="application/json",
            )
    except DaprGrpcError:  # SEED DPS-PUB-002
        pass
    return {"order_id": order.order_id}


def publish_to_bus(order: OrderPlaced) -> None:
    with DaprClient() as client:
        client.publish_event(
            pubsub_name="order-bus",  # SEED DPS-PUB-003
            topic_name="orders",
            data=order.model_dump_json(),
            data_content_type="application/json",
        )


def publish_dict_data(order: OrderPlaced) -> None:
    with DaprClient() as client:
        client.publish_event(
            pubsub_name="pubsub",
            topic_name="orders",
            data=order.model_dump(),  # SEED DPS-PUB-004
            data_content_type="application/json",
        )


def publish_with_ttl(order: OrderPlaced) -> None:
    with DaprClient() as client:
        client.publish_event(
            pubsub_name="pubsub",
            topic_name="orders",
            data=order.model_dump_json(),
            data_content_type="application/json",
            publish_metadata={"ttlInSeconds": 60},  # SEED DPS-PUB-004
        )


def publish_without_content_type(order: dict) -> None:
    with DaprClient() as client:
        client.publish_event(
            pubsub_name="pubsub",
            topic_name="orders",
            data=json.dumps(order),  # SEED DPS-PUB-005
        )


def publish_unclosed_client(order: OrderPlaced) -> None:
    client = DaprClient()  # SEED DPS-PUB-006
    client.publish_event(
        pubsub_name="pubsub",
        topic_name="audit",
        data=order.model_dump_json(),
        data_content_type="application/json",
    )


def publish_batch(orders: list[OrderPlaced]) -> None:
    with DaprClient() as client:
        client.publish_events(  # SEED DPS-PUB-007
            pubsub_name="pubsub",
            topic_name="orders",
            data=[o.model_dump_json() for o in orders],
            data_content_type="application/json",
        )


async def publish_blocking_in_async(order: OrderPlaced) -> None:
    DaprClient().publish_event(  # SEED DPS-PUB-011
        pubsub_name="pubsub",
        topic_name="orders",
        data=order.model_dump_json(),
        data_content_type="application/json",
    )


def publish_raw(order: OrderPlaced) -> None:
    with DaprClient() as client:
        client.publish_event(
            pubsub_name="pubsub",
            topic_name="orders",
            data=order.model_dump_json(),
            data_content_type="application/json",
            publish_metadata={"rawPayload": "true"},  # SEED DPS-PUB-012
        )
