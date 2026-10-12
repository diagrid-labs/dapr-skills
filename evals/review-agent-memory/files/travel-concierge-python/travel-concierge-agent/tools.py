from dapr_agents import tool
from pydantic import BaseModel, Field


class FlightSearchArgs(BaseModel):
    origin: str = Field(description="IATA code of the departure airport, e.g. 'AMS'.")
    destination: str = Field(description="IATA code of the arrival airport, e.g. 'LIS'.")
    date: str = Field(description="Departure date in ISO format, e.g. '2026-11-03'.")


@tool(args_model=FlightSearchArgs)
def search_flights(origin: str, destination: str, date: str) -> list[dict]:
    """Return up to three direct flights between two airports on a date. Use when the traveller asks for flights."""
    return [
        {"flight": "TP671", "origin": origin, "destination": destination, "date": date, "price_eur": 129},
        {"flight": "KL1693", "origin": origin, "destination": destination, "date": date, "price_eur": 164},
    ]
