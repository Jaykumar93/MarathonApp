# Coach-chat latency benchmark: fts-baseline

Run at 2026-09-15T06:01:08.156Z. 2 runs per question, skipPersistence:true.

| Category | Min (ms) | Avg (ms) | Max (ms) | Runs |
|---|---|---|---|---|
| kb:pacing | 6276 | 6290 | 6304 | 2 |
| kb:fueling | 3766 | 21603 | 39439 | 2 |
| kb:injury | 9847 | 12817 | 15786 | 2 |
| kb:tapering | 8729 | 9532 | 10334 | 2 |
| kb:recovery | 4075 | 11706 | 19336 | 2 |
| personal-data | 7758 | 9266 | 10774 | 2 |
| live-fact | 14214 | 14214 | 14214 | 1 |
| no-match | 2214 | 2214 | 2214 | 1 |

**Overall average: 11347ms** across 14 successful calls (2 failed).

## Raw results

| Category | Run | ms | Status | Reply length | Error |
|---|---|---|---|---|---|
| kb:pacing | 1 | 6276 | 200 | 488 |  |
| kb:pacing | 2 | 6304 | 200 | 615 |  |
| kb:fueling | 1 | 39439 | 200 | 505 |  |
| kb:fueling | 2 | 3766 | 200 | 586 |  |
| kb:injury | 1 | 15786 | 200 | 299 |  |
| kb:injury | 2 | 9847 | 200 | 883 |  |
| kb:tapering | 1 | 10334 | 200 | 624 |  |
| kb:tapering | 2 | 8729 | 200 | 924 |  |
| kb:recovery | 1 | 4075 | 200 | 512 |  |
| kb:recovery | 2 | 19336 | 200 | 430 |  |
| personal-data | 1 | 7758 | 200 | 148 |  |
| personal-data | 2 | 10774 | 200 | 148 |  |
| live-fact | 1 | 14214 | 200 | 345 |  |
| live-fact | 2 | 1341 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6355, Requested 1810. Please try again in 1.2375s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| no-match | 1 | 2214 | 200 | 194 |  |
| no-match | 2 | 1208 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7211, Requested 1633. Please try again in 6.33s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
