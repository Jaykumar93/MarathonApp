# Coach-chat latency benchmark: fts-baseline-groq-only

Run at 2026-09-15T06:42:03.486Z. 2 runs per question, skipPersistence:true.

| Category | Min (ms) | Avg (ms) | Max (ms) | Runs |
|---|---|---|---|---|
| kb:pacing | 3735 | 4216 | 4696 | 2 |
| kb:fueling | 1689 | 2323 | 2957 | 2 |
| kb:injury | 1873 | 2096 | 2318 | 2 |
| kb:tapering | 2202 | 2609 | 3015 | 2 |
| kb:recovery | 2097 | 2400 | 2703 | 2 |
| personal-data | 1954 | 2034 | 2114 | 2 |
| live-fact | 3839 | 5185 | 6531 | 2 |
| no-match | 2165 | 2227 | 2289 | 2 |

**Overall average: 2886ms** across 16 successful calls (0 failed).

## Raw results

| Category | Run | ms | Status | Reply length | Error |
|---|---|---|---|---|---|
| kb:pacing | 1 | 4696 | 200 | 522 |  |
| kb:pacing | 2 | 3735 | 200 | 385 |  |
| kb:fueling | 1 | 1689 | 200 | 431 |  |
| kb:fueling | 2 | 2957 | 200 | 566 |  |
| kb:injury | 1 | 2318 | 200 | 426 |  |
| kb:injury | 2 | 1873 | 200 | 435 |  |
| kb:tapering | 1 | 3015 | 200 | 977 |  |
| kb:tapering | 2 | 2202 | 200 | 893 |  |
| kb:recovery | 1 | 2703 | 200 | 409 |  |
| kb:recovery | 2 | 2097 | 200 | 359 |  |
| personal-data | 1 | 2114 | 200 | 90 |  |
| personal-data | 2 | 1954 | 200 | 179 |  |
| live-fact | 1 | 6531 | 200 | 459 |  |
| live-fact | 2 | 3839 | 200 | 555 |  |
| no-match | 1 | 2289 | 200 | 1105 |  |
| no-match | 2 | 2165 | 200 | 187 |  |
