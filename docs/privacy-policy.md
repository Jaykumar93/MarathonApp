# Stryde Privacy Policy

**Effective date:** September 9, 2026

Stryde is a marathon training app built and run by a single independent developer, currently in a manually-approved early-access phase (Android only, distributed by direct link rather than the Play Store). This policy describes what data the app collects, why, and where it goes. It's written to match what the app actually does today, not a generic template - if a section changes in a way that matters, this document changes with it.

## What we collect

**Account information.** Email address, full name, and username, collected at signup and stored in your profile. Password is handled entirely by Supabase Auth (our backend provider) - the app never sees or stores your password itself.

**Training data you provide.** Your race goal, target time, training-day preferences, and any prior-race or calibration-run times you enter. This is what the plan-generation engine uses to build and adjust your training plan.

**Activity data.** Every run you log, however you log it:
- **Manually entered** activities (distance, duration, notes).
- **GPS-tracked** activities recorded by the app - route coordinates, pace splits, elevation.
- **Auto-synced from Android Health Connect**, if you connect it: exercise sessions, distance, and total calories burned. This requires you to explicitly grant Health Connect permission on your device, separately from anything in the app itself, and you can disconnect it at any time from Settings.

**Photos.** Up to 3 photos you optionally attach to a logged activity. These are stored in a public-read location (see "Photos are stored publicly" below) - anyone with the exact file URL could view one, though URLs aren't listed or searchable anywhere.

**Location.** While a run is actively being tracked, the app collects GPS location - including in the background, if you grant that permission - to record your route, distance, and pace. Location is not collected at any other time.

**AI Coach conversations.** Any question you ask Stryde's AI coach, plus the specific pieces of your own training data needed to answer it (e.g. the run you're asking about, or your recent weekly mileage). See "Third parties" below for where this is sent.

**Push notification data.** If you enable notifications: an Expo push token identifying your device, and your device's timezone (used only to send the daily reminder at your own chosen local hour, not the server's).

**Gear.** Shoe names/brands and the mileage logged against them, if you choose to track gear.

**Crash reports**, once a Sentry error-tracking DSN is configured for this app (not yet enabled as of this writing) - device/OS info and a stack trace when something breaks, deliberately configured to exclude the default personal-data fields Sentry would otherwise attach.

We do not collect advertising identifiers, and we do not use any analytics or tracking SDK beyond the crash reporting above.

## Why we collect it

To generate and adjust your training plan; to record and display your training history; to power the AI coach's answers about your own training; to sync automatically with Health Connect if you choose to; to send the daily reminder notification if you enable it; and to keep the app from crashing silently, once crash reporting is turned on.

Your data is never sold, and never used for advertising - there is no advertising in this app.

## Third parties

Running the app requires sending some data to a small number of service providers, each doing one specific job:

| Provider | What it gets | Why |
|---|---|---|
| **Supabase** | Everything above - it's our database, authentication, and file storage provider | Hosts the app's entire backend |
| **Google** | Your email/name if you sign in with Google; map tiles and your location while viewing a live route; Health Connect data if you connect it | Sign-in, maps, health sync |
| **Google Gemini** | Your AI coach question, plus the specific training data needed to answer it | Generates the coach's reply (primary provider) |
| **Groq** | The same, only if Gemini is unavailable | Generates the coach's reply (backup provider) |
| **Hugging Face** | The text of your coach question (not your training data) | Converts your question into a vector to search our knowledge base |
| **Expo** | Your push token | Delivers push notifications to your device |
| **Open-Meteo** | The latitude/longitude of your race location, with no account information attached | Race-day weather forecast |
| **Sentry** | Device/OS info and crash stack traces, once configured | Crash reporting |

None of these providers receive your password. None of them are permitted to use your data for anything beyond the specific job listed above.

## Photos are stored publicly

Activity photos are kept in a storage location that anyone with the exact URL could open - there's no per-user access check on that URL the way there is on every other piece of your data. This was a deliberate tradeoff (it's what lets a photo just work everywhere it's shown, with no extra steps), made because a running photo isn't the kind of sensitive data your training plan or location history is. Nothing else described in this policy is stored this way. If you'd rather not have a photo be technically reachable by anyone who somehow obtained its exact URL, don't attach it to a logged activity.

## Your data is isolated from other users

Every table in the database enforces row-level security: the backend itself refuses to return another user's rows to you, no matter what the app's client code does or doesn't check. This isn't just an app-level promise - it's enforced by the database independent of the app.

## How long we keep it, and how to delete it

Your data is kept for as long as your account is active. There is currently no self-serve "delete my account" button in the app. To request deletion of your account and all associated data, email the address below - we'll confirm once it's done.

## Children's privacy

Stryde is not directed at, and is not knowingly used by, children under 13. If you believe a child has created an account, contact us and we'll remove it.

## Changes to this policy

If what the app actually does changes in a way that affects this policy, this document will be updated and the effective date above will change. Continuing to use the app after a change means you accept the update.

## Contact

This app is built and operated by one person. For any question about this policy, or to request your data be deleted: **www.jaykumarpokar@gmail.com**
