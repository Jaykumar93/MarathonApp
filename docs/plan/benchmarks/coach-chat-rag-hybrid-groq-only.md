# Coach-chat latency benchmark: rag-hybrid-groq-only

Run at 2026-09-15T06:32:45.873Z. 2 runs per question, skipPersistence:true.

| Category | Min (ms) | Avg (ms) | Max (ms) | Runs |
|---|---|---|---|---|
| kb:pacing | 2426 | 3457 | 4487 | 2 |
| kb:fueling | 1862 | 2221 | 2580 | 2 |
| kb:injury | 2800 | 2809 | 2817 | 2 |
| kb:tapering | 3523 | 4634 | 5745 | 2 |
| kb:recovery | 2303 | 2493 | 2683 | 2 |
| personal-data | 2642 | 2649 | 2656 | 2 |
| live-fact | 6179 | 6179 | 6179 | 1 |
| no-match | 2538 | 2693 | 2847 | 2 |

**Overall average: 3206ms** across 15 successful calls (1 failed).

## Raw results

| Category | Run | ms | Status | Reply length | Error |
|---|---|---|---|---|---|
| kb:pacing | 1 | 2426 | 200 | 678 |  |
| kb:pacing | 2 | 4487 | 200 | 831 |  |
| kb:fueling | 1 | 2580 | 200 | 418 |  |
| kb:fueling | 2 | 1862 | 200 | 422 |  |
| kb:injury | 1 | 2817 | 200 | 637 |  |
| kb:injury | 2 | 2800 | 200 | 541 |  |
| kb:tapering | 1 | 3523 | 200 | 888 |  |
| kb:tapering | 2 | 5745 | 200 | 931 |  |
| kb:recovery | 1 | 2303 | 200 | 419 |  |
| kb:recovery | 2 | 2683 | 200 | 384 |  |
| personal-data | 1 | 2656 | 200 | 206 |  |
| personal-data | 2 | 2642 | 200 | 153 |  |
| live-fact | 1 | 6179 | 200 | 421 |  |
| live-fact | 2 | 4200 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 5297, Requested 4702. Please try again in 14.9925s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| no-match | 1 | 2847 | 200 | 169 |  |
| no-match | 2 | 2538 | 200 | 148 |  |
