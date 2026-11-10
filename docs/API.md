# API

Base path `/api/v1`. Interactive OpenAPI documentation: `/api/docs`. Schema: `/api/openapi.json`.

Authentication: `POST /auth/login` sets an httpOnly session cookie and also returns a bearer token for API
clients. Send `Authorization: Bearer <token>`.

Errors use `{"detail": "..."}` with these statuses: 401 not signed in, 403 not allowed, 404 not found,
409 conflict with current state, 410 access revoked or expired, 422 invalid input, 429 too many requests.

## Endpoints

| Method and path | Who | Purpose |
| --- | --- | --- |
| POST /auth/register, /auth/login, /auth/logout; GET /auth/me | anyone | Accounts and sessions |
| GET /members/me | member | Overview: index, totals, series, recent activity |
| GET /members/me/contributions, /members/me/memberships | member | Own records and payable periods |
| GET, POST /members/me/passport; GET /members/me/passport/pdf | member | Passport snapshot and PDF |
| GET /members/me/export; POST /members/me/deletion-request | member | Data access and deletion |
| POST /contributions | member | Start or record a contribution. Needs `Idempotency-Key` |
| POST /contributions/{id}/verify, /reject, /reverse | treasurer, owner | Review decisions |
| POST /contributions/{id}/dispute | owning member | Report an incorrect record |
| GET /contributions/{id}/receipt | owner of record, managers | Receipt with payment status |
| POST /payments/{contribution_id}/simulate | owning member | TEST MODE outcome |
| POST /payments/webhook/{provider} | provider | Signed payment events |
| GET, POST /stokvels; POST /stokvels/join | member | Groups |
| GET /stokvels/{id}, /members, /contributions, /calendar | members, managers | Group views |
| POST /stokvels/{id}/members/invite, .../{membership}/approve; DELETE .../{membership}; PATCH .../{membership}/role | administrator, owner | Member management |
| GET /ledger/verify | signed in | Recompute the chain |
| GET /ledger/events | member (own), manager (own group), admin | Ledger events |
| POST /ledger/tamper-simulation | managers, admin | In-memory tampering demo |
| GET /ledger/status; POST /ledger/checkpoints | admin | Ledger administration |
| POST /passport/share; GET /passport/shares; DELETE /passport/share/{id} | member | Consent |
| GET /passport/shared/{token}, /passport/shared/{token}/pdf | lender | Scoped Passport view |
| GET /lender/verifications, /lender/verifications/{id} | lender | Own verification records |
| GET /passport/verify/{code} | public | Authenticity check, no financial detail |
| GET /analytics/fairness | admin | Fairness report |
| GET /admin/audit-logs | admin | Audit log |
| POST /pilot-interest | public | Pilot registration |

## Examples

```bash
API=http://localhost:8000/api/v1

# sign in as the demo member
TOKEN=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"member@demo.stokvelpassport.example","password":"Passport-Demo-2026"}' | jq -r .access_token)
AUTH="Authorization: Bearer $TOKEN"

# index and overview
curl -s $API/members/me -H "$AUTH" | jq '.score | {score, counts, explanation}'

# start a PayShap Request contribution (TEST MODE), then simulate approval
M=$(curl -s $API/members/me/memberships -H "$AUTH" | jq '.[0]')
C=$(curl -s $API/contributions -H "$AUTH" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"stokvel_id\": $(echo $M | jq .stokvel_id), \"schedule_id\": $(echo $M | jq '.payable[0].schedule_id'), \"channel\": \"payshap_request\"}")
curl -s $API/payments/$(echo $C | jq -r .id)/simulate -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"outcome":"success"}' | jq '.contribution | {status, verification_method, ledger_hash}'

# verify the whole ledger
curl -s $API/ledger/verify -H "$AUTH" | jq '{valid, event_count, head_hash}'

# generate a Passport and share the index and totals for 7 days
curl -s -X POST $API/members/me/passport -H "$AUTH" | jq '{passport_id, verification_code}'
curl -s $API/passport/share -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"scopes":["index","totals"],"expires_in_days":7,"recipient_label":"Example Lender"}' | jq '{id, token, expires_at}'

# lender opens it
LT=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"lender@demo.stokvelpassport.example","password":"Passport-Demo-2026"}' | jq -r .access_token)
curl -s $API/passport/shared/<token> -H "Authorization: Bearer $LT" | jq '{authentic, scopes, index, totals}'

# member revokes; the lender then receives 410
curl -s -X DELETE $API/passport/share/<id> -H "$AUTH"
```
