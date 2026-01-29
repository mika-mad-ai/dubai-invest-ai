"""
FastAPI mock service for Dubai Invest recommendations.
Replace mock data/fetchers with real DLD stats and Property Finder API calls later.
"""
from typing import List, Dict
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="Dubai Invest - Recommendations", version="0.1.0")


# ---- Mock data layer ------------------------------------------------------- #
def get_market_average_price(location: str, property_type: str = "apartment") -> float:
    """
    Mock DLD market averages (AED/sqft) by location.
    TODO: replace with real DLD historical data.
    """
    averages = {
        "dubai marina": 1600.0,
        "downtown": 2200.0,
        "downtown dubai": 2200.0,
        "business bay": 1500.0,
        "jlt": 1200.0,
    }
    return averages.get(location.strip().lower(), 1400.0)


def fetch_live_listings(location: str) -> List[Dict]:
    """
    Simulate a RapidAPI Property Finder scraper call.
    TODO: plug real RapidAPI client here; inject API key via env var.
    """
    base_url = "https://www.propertyfinder.ae/en/search"
    image_stub = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85"
    # Generate mock data with varied pricing
    mock = []
    for i in range(10):
        price = 900_000 + (i * 150_000) if i % 2 == 0 else 650_000 + (i * 90_000)
        area = 650 + (i * 35)
        mock.append(
            {
                "title": f"{location} | Unit #{i+1}",
                "price": price,
                "area_sqft": area,
                "url": f"{base_url}?l={location.replace(' ', '+')}&listing={i+1}",
                "image_url": f"{image_stub}?q=80&w=1200&auto=format&fit=crop&sig={i}",
            }
        )
    return mock


# ---- Schemas --------------------------------------------------------------- #
class Listing(BaseModel):
    title: str
    price: float
    area_sqft: float
    url: HttpUrl
    image_url: HttpUrl
    price_per_sqft: float
    discount_percentage: float
    potential_gain: float


class RecommendationsResponse(BaseModel):
    market_stats: Dict[str, float]
    top_investments: List[Listing]


# ---- Core logic ------------------------------------------------------------ #
def select_best_listings(location: str) -> RecommendationsResponse:
    market_avg = get_market_average_price(location)
    if market_avg <= 0:
        # Avoid division by zero and bad configs
        raise ValueError("Market average price must be greater than zero.")

    raw_listings = fetch_live_listings(location)
    processed: List[Listing] = []

    for item in raw_listings:
        area = item.get("area_sqft") or 0
        if area <= 0:
            continue  # skip invalid areas
        price = item.get("price") or 0
        price_per_sqft = price / area
        discount_pct = ((market_avg - price_per_sqft) / market_avg) * 100
        if discount_pct <= 0:
            continue  # overpriced or equal to market
        potential_gain = (market_avg - price_per_sqft) * area
        processed.append(
            Listing(
                title=item["title"],
                price=price,
                area_sqft=area,
                url=item["url"],
                image_url=item["image_url"],
                price_per_sqft=round(price_per_sqft, 2),
                discount_percentage=round(discount_pct, 2),
                potential_gain=round(potential_gain, 2),
            )
        )

    top = sorted(processed, key=lambda x: x.discount_percentage, reverse=True)[:4]
    return RecommendationsResponse(
        market_stats={"average_price_sqft": market_avg},
        top_investments=top,
    )


# ---- API ------------------------------------------------------------------- #
@app.get("/recommendations", response_model=RecommendationsResponse)
def get_recommendations(location: str = Query(..., min_length=2, description="Ex: Dubai Marina")):
    """
    Returns the best 4 live listings versus DLD market average.

    Notes to plug real data:
    - Replace get_market_average_price with DLD feed/DB lookup.
    - Replace fetch_live_listings with RapidAPI Property Finder client (use env var API key).
    """
    try:
        return select_best_listings(location)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
