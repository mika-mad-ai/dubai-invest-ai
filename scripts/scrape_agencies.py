"""
scrape_agencies.py
Trouve les agences immobilières RERA-enregistrées à Dubaï
susceptibles d'acheter des leads qualifiés.

Sources :
  1. PropertyFinder agency directory  (HTML public)
  2. Bayut agency directory           (HTML public)
  3. Dubai REST / RERA broker list    (CSV public DLD)

Usage :
  pip install requests beautifulsoup4 pandas
  python scripts/scrape_agencies.py

Résultats → agencies_dubai.csv
"""

import csv
import json
import time
import random
import re
from dataclasses import dataclass, fields, asdict
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ── Config ───────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

OUTPUT_FILE = "agencies_dubai.csv"
DELAY_MIN   = 1.5   # secondes entre requêtes
DELAY_MAX   = 3.5


# ── Modèle de données ────────────────────────────────────────────────────────

@dataclass
class Agency:
    name:         str
    source:       str
    phone:        Optional[str] = None
    email:        Optional[str] = None
    website:      Optional[str] = None
    rera_number:  Optional[str] = None
    areas:        Optional[str] = None   # zones de spécialisation
    profile_url:  Optional[str] = None
    rating:       Optional[str] = None
    listings_count: Optional[int] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def get(url: str, retries: int = 3) -> Optional[BeautifulSoup]:
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, "html.parser")
        except requests.RequestException as e:
            wait = (attempt + 1) * 4
            print(f"  ⚠  {e} — retry in {wait}s")
            time.sleep(wait)
    return None


def pause():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def clean(text: Optional[str]) -> Optional[str]:
    return re.sub(r"\s+", " ", text).strip() if text else None


# ── Source 1 : PropertyFinder ─────────────────────────────────────────────

def scrape_propertyfinder(max_pages: int = 10) -> list[Agency]:
    agencies: list[Agency] = []
    base = "https://www.propertyfinder.ae/en/find-an-agent"

    print("📡  PropertyFinder agency directory…")
    for page in range(1, max_pages + 1):
        url = f"{base}?page={page}"
        print(f"  → page {page}")
        soup = get(url)
        if not soup:
            break

        cards = soup.select("[data-testid='agent-card'], .agent-card, article[class*='agent']")
        if not cards:
            # Fallback : cherche toutes les cartes contenant un nom d'agence
            cards = soup.select("div[class*='AgencyCard'], div[class*='agency-card']")

        if not cards:
            print("  ✗  Aucune carte trouvée (structure HTML modifiée ?)")
            break

        for card in cards:
            name_el   = card.select_one("[class*='name'], h2, h3")
            phone_el  = card.select_one("a[href^='tel:']")
            link_el   = card.select_one("a[href*='/agency/'], a[href*='/agent/']")
            rating_el = card.select_one("[class*='rating'], [class*='score']")
            count_el  = card.select_one("[class*='listing'], [class*='property-count']")

            name = clean(name_el.get_text()) if name_el else None
            if not name:
                continue

            phone = None
            if phone_el:
                phone = phone_el["href"].replace("tel:", "").strip()

            profile_url = None
            if link_el:
                href = link_el.get("href", "")
                profile_url = href if href.startswith("http") else f"https://www.propertyfinder.ae{href}"

            count = None
            if count_el:
                m = re.search(r"(\d+)", count_el.get_text())
                count = int(m.group(1)) if m else None

            agencies.append(Agency(
                name=name,
                source="propertyfinder",
                phone=phone,
                profile_url=profile_url,
                rating=clean(rating_el.get_text()) if rating_el else None,
                listings_count=count,
            ))

        pause()

    print(f"  ✅  {len(agencies)} agences PropertyFinder")
    return agencies


# ── Source 2 : Bayut ──────────────────────────────────────────────────────

def scrape_bayut(max_pages: int = 10) -> list[Agency]:
    agencies: list[Agency] = []
    base = "https://www.bayut.com/real-estate-agencies/dubai"

    print("📡  Bayut agency directory…")
    for page in range(1, max_pages + 1):
        url = f"{base}/?page={page}" if page > 1 else f"{base}/"
        print(f"  → page {page}")
        soup = get(url)
        if not soup:
            break

        cards = soup.select(
            "li[class*='agency'], article[class*='agency'], "
            "div[class*='AgencyCard'], div[class*='agency-item']"
        )
        if not cards:
            print("  ✗  Aucune carte (Bayut peut bloquer les bots)")
            break

        for card in cards:
            name_el  = card.select_one("h2, h3, [class*='name'], [class*='title']")
            phone_el = card.select_one("a[href^='tel:']")
            link_el  = card.select_one("a[href*='/agency/']")
            area_els = card.select("[class*='area'], [class*='location']")

            name = clean(name_el.get_text()) if name_el else None
            if not name:
                continue

            profile_url = None
            if link_el:
                href = link_el.get("href", "")
                profile_url = href if href.startswith("http") else f"https://www.bayut.com{href}"

            areas = ", ".join(clean(a.get_text()) for a in area_els if clean(a.get_text())) or None

            agencies.append(Agency(
                name=name,
                source="bayut",
                phone=phone_el["href"].replace("tel:", "").strip() if phone_el else None,
                profile_url=profile_url,
                areas=areas,
            ))

        pause()

    print(f"  ✅  {len(agencies)} agences Bayut")
    return agencies


# ── Source 3 : DLD / Dubai REST open data ────────────────────────────────

def scrape_dld_brokers() -> list[Agency]:
    """
    Le portail open data de Dubai (data.dubai.gov.ae) publie parfois
    la liste RERA des courtiers/agences enregistrés.
    On tente d'abord l'endpoint CKAN JSON, puis le CSV direct.
    """
    agencies: list[Agency] = []

    # Endpoint CKAN public (Dubai Pulse / data.dubai.gov.ae)
    ckan_urls = [
        "https://data.dubai.gov.ae/api/3/action/datastore_search?resource_id=real-estate-brokers&limit=500",
        "https://dubaidata.gov.ae/api/3/action/datastore_search?resource_id=brokers&limit=500",
    ]

    print("📡  DLD / Dubai open data brokers…")
    for url in ckan_urls:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            data = resp.json()
            records = data.get("result", {}).get("records", [])
            if records:
                for r in records:
                    name = r.get("BROKER_NAME") or r.get("name") or r.get("COMPANY_NAME")
                    if not name:
                        continue
                    agencies.append(Agency(
                        name=str(name).strip(),
                        source="dld_open_data",
                        phone=str(r.get("PHONE", "") or "").strip() or None,
                        email=str(r.get("EMAIL", "") or "").strip() or None,
                        rera_number=str(r.get("RERA_NO", "") or r.get("BROKER_NO", "") or "").strip() or None,
                        areas=str(r.get("AREA", "") or "").strip() or None,
                    ))
                print(f"  ✅  {len(agencies)} brokers DLD open data")
                return agencies
        except Exception as e:
            print(f"  ⚠  {url}: {e}")

    print("  ℹ  DLD open data indisponible — source ignorée")
    return agencies


# ── Déduplication ─────────────────────────────────────────────────────────

def deduplicate(agencies: list[Agency]) -> list[Agency]:
    seen: set[str] = set()
    result = []
    for a in agencies:
        key = re.sub(r"[^a-z0-9]", "", a.name.lower())
        if key not in seen:
            seen.add(key)
            result.append(a)
    return result


# ── Export CSV ────────────────────────────────────────────────────────────

def export_csv(agencies: list[Agency], path: str):
    cols = [f.name for f in fields(Agency)]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=cols)
        writer.writeheader()
        for a in agencies:
            writer.writerow(asdict(a))
    print(f"\n💾  {len(agencies)} agences exportées → {path}")


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    all_agencies: list[Agency] = []

    all_agencies += scrape_propertyfinder(max_pages=10)
    all_agencies += scrape_bayut(max_pages=10)
    all_agencies += scrape_dld_brokers()

    unique = deduplicate(all_agencies)
    # Trier par nombre d'annonces décroissant (proxy qualité partenaire)
    unique.sort(key=lambda a: a.listings_count or 0, reverse=True)

    export_csv(unique, OUTPUT_FILE)

    # Résumé console
    print("\n─── Top 15 agences par volume d'annonces ───")
    for a in unique[:15]:
        print(f"  {a.name:45s}  {a.listings_count or '?':>6}  annonces  [{a.source}]")


if __name__ == "__main__":
    main()
