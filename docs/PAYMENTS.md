# Payments

## Current state

**TEST MODE only.** `TestModeProvider` simulates PayShap Request. It calls no bank and moves no money.
The interface, pending, failed, successful and reversed states, receipts, idempotency and duplicate
webhook protection are all implemented and tested.

## How it is built

`backend/app/payments/base.py` defines the interface:

```python
class PaymentProvider(ABC):
    def create_request(self, *, amount, currency, reference, idempotency_key) -> ProviderRequest: ...
    def parse_event(self, headers, body) -> ProviderEvent: ...   # verify signature, translate payload
```

The contribution system uses only this interface. `POST /api/v1/payments/webhook/{provider}` receives
provider events and passes them to `services.handle_provider_event`, which is idempotent on the
provider's event id. The TEST MODE "simulate" button builds a signed event and sends it through that same
code path.

## What is needed to activate a real provider

1. A registered business and a merchant account with a provider that offers PayShap Request, for example
   Stitch or Ozow. Check each provider's current product, pricing and onboarding rules.
2. API credentials and a webhook signing secret from that provider.
3. A new class, for example `StitchPayShapProvider(PaymentProvider)`, that:
   - creates a payment request with the provider and returns its reference,
   - verifies the webhook signature in `parse_event`,
   - maps the provider's statuses to `payment.succeeded`, `payment.failed`, `payment.reversed`.
4. Register it in `payments/registry.py` and set `PAYMENT_PROVIDER=stitch`, `PAYMENT_TEST_MODE=false`.
5. Add the provider's credentials as environment variables. Never commit them.
6. Test in the provider's sandbox, then run the contribution test suite.

No contribution, ledger or scoring code changes. Money flows from the member to the stokvel's own bank
account. The platform never holds funds.
