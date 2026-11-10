from ..config import get_settings
from .base import PaymentProvider
from .test_provider import TestModeProvider

_PROVIDERS: dict[str, type[PaymentProvider]] = {"test": TestModeProvider}
# To add a real provider: implement PaymentProvider in its own module, then register it here,
# for example  _PROVIDERS["stitch"] = StitchPayShapProvider


def get_provider(name: str | None = None) -> PaymentProvider:
    name = name or get_settings().payment_provider
    if name not in _PROVIDERS:
        raise RuntimeError(f"Payment provider '{name}' is not configured. Only TEST MODE is implemented.")
    return _PROVIDERS[name]()
