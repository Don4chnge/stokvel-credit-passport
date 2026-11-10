"""Payment provider interface.

The contribution system talks only to this interface. A real PayShap Request provider
(for example Stitch or Ozow) is added by implementing PaymentProvider and registering it in
registry.py. No contribution, ledger or scoring code changes.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal


@dataclass
class ProviderRequest:
    provider_reference: str
    status: str  # pending | succeeded | failed | reversed
    test_mode: bool


@dataclass
class ProviderEvent:
    provider_event_id: str
    provider_reference: str
    event_type: str  # payment.succeeded | payment.failed | payment.reversed
    payload: dict


class PaymentProvider(ABC):
    name: str = "abstract"
    test_mode: bool = False

    @abstractmethod
    def create_request(self, *, amount: Decimal, currency: str, reference: str, idempotency_key: str) -> ProviderRequest:
        """Ask the payer to approve a payment (PayShap Request). Must be idempotent on idempotency_key."""

    @abstractmethod
    def parse_event(self, headers: dict, body: bytes) -> ProviderEvent:
        """Verify the webhook signature and translate the provider payload. Raise ValueError when invalid."""
