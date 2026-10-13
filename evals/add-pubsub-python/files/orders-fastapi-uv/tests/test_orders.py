from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_create_order():
    response = client.post(
        "/orders",
        json={"order_id": "o-1", "customer_id": "c-1", "amount": 25.5},
    )
    assert response.status_code == 201
    assert response.json()["order_id"] == "o-1"


def test_get_order():
    client.post(
        "/orders",
        json={"order_id": "o-2", "customer_id": "c-2", "amount": 10.0},
    )
    response = client.get("/orders/o-2")
    assert response.status_code == 200
    assert response.json()["customer_id"] == "c-2"
