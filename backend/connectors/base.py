from abc import ABC, abstractmethod
from datetime import date


class BaseConnector(ABC):
    """
    Abstract base class for all D2C data connectors.
    
    Each connector maps a third-party tool (Shopify, Razorpay, Shiprocket, Meta Ads)
    into a normalized schema with source provenance (source + source_row_ref) on every row.
    
    To add a 5th connector, simply subclass this and implement the 3 methods.
    """

    def __init__(self, merchant_id: str, credentials: dict | None = None):
        self.merchant_id = merchant_id
        self.credentials = credentials or {}

    @abstractmethod
    def fetch_orders(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch orders/transactions for the given date range."""
        pass

    @abstractmethod
    def fetch_returns(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch returns/refunds for the given date range."""
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Return True if the connector can reach its data source."""
        pass
