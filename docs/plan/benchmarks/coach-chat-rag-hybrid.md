# Coach-chat latency benchmark: rag-hybrid

Run at 2026-09-15T06:16:27.043Z. 2 runs per question, skipPersistence:true.

| Category | Min (ms) | Avg (ms) | Max (ms) | Runs |
|---|---|---|---|---|
| kb:pacing | 2665 | 2729 | 2793 | 2 |
| kb:fueling | 2375 | 2375 | 2375 | 1 |
| kb:tapering | 2542 | 2542 | 2542 | 1 |
| kb:recovery | 2738 | 2738 | 2738 | 1 |
| personal-data | 2458 | 2458 | 2458 | 1 |
| no-match | 2054 | 2054 | 2054 | 1 |

**Overall average: 2518ms** across 7 successful calls (9 failed).

## Raw results

| Category | Run | ms | Status | Reply length | Error |
|---|---|---|---|---|---|
| kb:pacing | 1 | 2793 | 200 | 397 |  |
| kb:pacing | 2 | 2665 | 200 | 865 |  |
| kb:fueling | 1 | 2375 | 200 | 588 |  |
| kb:fueling | 2 | 1700 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6644, Requested 2931. Please try again in 11.8125s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| kb:injury | 1 | 1768 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 5874, Requested 2904. Please try again in 5.835s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| kb:injury | 2 | 1509 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 5137, Requested 2904. Please try again in 307.5ms. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| kb:tapering | 1 | 2542 | 200 | 829 |  |
| kb:tapering | 2 | 1361 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6419, Requested 2863. Please try again in 9.615s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| kb:recovery | 1 | 1576 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 5666, Requested 2822. Please try again in 3.66s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| kb:recovery | 2 | 2738 | 200 | 433 |  |
| personal-data | 1 | 1214 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 5675, Requested 2852. Please try again in 3.9525s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| personal-data | 2 | 2458 | 200 | 283 |  |
| live-fact | 1 | 1270 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6963, Requested 2935. Please try again in 14.235s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| live-fact | 2 | 1467 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6232, Requested 3026. Please try again in 9.435s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| no-match | 1 | 1319 | 500 | 0 | Groq request failed (429): {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m2044cnhe1wtr4zdqjaqprc0` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 5522, Requested 2938. Please try again in 3.45s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}
 |
| no-match | 2 | 2054 | 200 | 174 |  |
