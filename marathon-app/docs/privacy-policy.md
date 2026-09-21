# Stryde Privacy Policy

**Effective date:** September 21, 2026

Stryde is built and run by a single independent developer, currently in a manually-approved early-access phase. This describes what the app actually collects and where it goes - not a generic template.

This is the canonical copy of this policy, kept in sync with the in-app version at `app/privacy-policy.tsx`. Link to this page (not the in-app screen) anywhere a public, non-authenticated URL is required - the Google Play Data Safety section, for example.

## What we collect

Account info (email, name, username - your password is handled entirely by Supabase Auth, the app never sees it), the training data you enter, every activity you log (manual, GPS-tracked, or auto-synced from Health Connect), up to 3 optional photos per activity, GPS location while a run is actively being tracked, your AI coach conversations, a push notification token and timezone if you enable notifications, gear/shoe mileage if you track it, and crash reports once error tracking is configured.

## Why we collect it

To generate and adjust your training plan, record your training history, power the AI coach's answers about your own training, sync with Health Connect if you choose to, and send the daily reminder if you enable it. Your data is never sold and never used for advertising - there is no advertising in this app.

## Third parties

Running the app means sending some data to a small number of providers, each doing one specific job:

| Provider | Gets | Why |
|---|---|---|
| Supabase | Everything in this policy - it's our database, auth, and file storage provider | Hosts the app's entire backend |
| Google | Your email/name if you sign in with Google; map tiles and location while viewing a live route; Health Connect data if connected | Sign-in, maps, health sync |
| Google Gemini | Your AI coach question, plus the specific training data needed to answer it; also used to turn your question into a search vector for finding relevant help articles | Generates the coach's reply (primary) and its knowledge-base search |
| Groq | The same, only if Gemini is unavailable | Generates the coach's reply (backup) |
| Expo | Your push token | Delivers push notifications |
| Open-Meteo | Race location coordinates only, no account info | Race-day weather forecast |
| Sentry | Device/OS info and crash stack traces, once configured | Crash reporting |

None of them receive your password, and none are permitted to use your data beyond the job listed above.

## Location data

GPS location is collected only while a run is actively being tracked, including while your screen is off or another app is open if you grant background location access - this keeps your route, distance, and pace tracking continuous for the whole run. Background location is never used outside of an active run, and the app asks for your affirmative confirmation, separate from the system permission dialog, before requesting it.

## Health Connect data

If you connect Health Connect, Stryde reads your exercise sessions, distance, and total calories burned for running-type activities only, to import them as logged activities. This is opt-in from Settings and can be disconnected at any time.

## Photos are stored publicly

Activity photos are kept somewhere anyone with the exact URL could open - unlike everything else you store, there's no per-user access check on that link. This is what lets a photo just work everywhere it's shown, and was judged an acceptable tradeoff since a running photo isn't as sensitive as your location history or training plan. If you'd rather not, don't attach a photo to a logged activity.

## Your data is isolated from other users

Every table in the database enforces row-level security - the backend itself refuses to return another user's rows to you, enforced independently of anything the app's own code does or doesn't check.

## Retention & deletion

Kept for as long as your account is active. There's no self-serve delete button yet - email the address below to request deletion of your account and everything tied to it, and we'll confirm once it's done.

## Children's privacy

Stryde is not directed at, and is not knowingly used by, children under 13. Contact us if you believe a child has created an account and we'll remove it.

## Changes & contact

If what the app does changes in a way that affects this policy, this page and its effective date will change too. Built and operated by one person - for any question, or to request deletion, email **jaykumarpokar9@gmail.com**.
