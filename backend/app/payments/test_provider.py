"""TEST MODE provider. Simulates PayShap Request. It moves no money and calls no bank."""
import hashlib
import hmac
import json
import uuid
from decimal import Decimal

from ..config import get_settings
from .base import PaymentProvider, ProviderEvent, ProviderRequest


class TestModeProvider(PaymentProvider):
    __test__ = False  # not a pytest class
    name = "test"
    test_mode = True

    def create_request(self, *, amount: Decimal, currency: str, reference: str, idempotency_key: str) -> ProviderRequest:
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()[:16].upper()
        return ProviderRequest(provider_reference=f"TEST-PSR-{digest}", status="pending", test_mode=True)

    # Signed with the app secret so the webhook path is exercised the way a real provider would use it.
    def sign(self, body: bytes) -> str:
        return hmac.new(get_settings().secret_key.encode(), body, hashlib.sha256).hexdigest()

    def build_event(self, provider_reference: str, outcome: str, event_id: str | None = None) -> tuple[dict, bytes]:
        payload = {
            "id": event_id or f"evt_test_{uuid.uuid4().hex}",
            "type": {"success": "payment.succeeded", "fail": "payment.failed", "reverse": "payment.reversed"}[outcome],
            "reference": provider_reference, "test_mode": True,
        }
        body = json.dumps(payload, sort_keys=True).encode()
        return {"x-scp-signature": self.sign(body)}, body

    def parse_event(self, headers: dict, body: bytes) -> ProviderEvent:
        sig = headers.get("x-scp-signature", "")
        if not hmac.compare_digest(sig, self.sign(body)):
            raise ValueError("Invalid webhook signature")
        data = json.loads(body)
        return ProviderEvent(provider_event_id=data["id"], provider_reference=data["reference"],
                             event_type=data["type"], payload=data)
