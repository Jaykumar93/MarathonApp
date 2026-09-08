/**
 * Populates public.knowledge_base with the coach's self-authored articles -
 * a batch loader, not interactive (contrast scripts/tryPlanEngine.ts's own
 * Q&A pattern, which this otherwise mirrors: a plain tsx-run dev script,
 * not part of the app itself).
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (bypasses RLS - authenticated users can't
 * write this table by design, see the migration) and HF_API_KEY, both from
 * .env - see .env.example for where each comes from.
 *
 * Clears existing rows first, so re-running after editing an article below
 * replaces it cleanly instead of duplicating it.
 *
 * Run with: npm run coach:seed
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// tsx doesn't load .env the way `expo start` does - a minimal inline
// parser is simpler than adding a dotenv dependency just for this one
// script. Comments/blank lines skipped; doesn't handle quoted values or
// multiline values, neither of which this project's .env ever needs.
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvFile(new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.");
}
if (!HF_API_KEY) {
  throw new Error("Missing HF_API_KEY in .env - get a free token from huggingface.co/settings/tokens.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Same endpoint/model the coach-chat Edge Function embeds a live user
// question with (lib parity matters here - a query embedded with a
// different model than the corpus would compare meaninglessly).
const HF_EMBEDDING_URL =
  "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

async function embed(text: string): Promise<number[]> {
  const res = await fetch(HF_EMBEDDING_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  if (!res.ok) throw new Error(`HF embedding request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  // feature-extraction returns a plain number[] for a single string input.
  if (!Array.isArray(data) || typeof data[0] !== "number") {
    throw new Error(`Unexpected HF embedding response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data as number[];
}

interface Article {
  title: string;
  content: string;
}

const ARTICLES: Article[] = [
  {
    title: "Pacing strategy",
    content: `The single biggest pacing mistake in distance running is starting too fast. Adrenaline, a taper-fresh body, and a crowd of runners around you all conspire to make an unsustainable pace feel easy for the first mile or two - by the time it stops feeling easy, the damage to your back half is already done. A slight negative split (running the second half a little faster than the first) consistently outperforms an even split, which in turn outperforms a positive split, across basically every distance from 10K to marathon. If you're not sure whether you're going out too fast, you almost certainly are.

Pace and effort are not the same thing, and distance running asks you to manage the second one, not just the first. The same pace can feel completely different depending on heat, wind, terrain, and how many miles are already in your legs that week - a goal pace held rigidly regardless of how you actually feel is a common way to blow up late. Early in a long run or race, effort should feel almost suspiciously easy. If mile one already feels like real work, something is off.

Goal race pace shouldn't be a guess. It should come from a recent, honest effort at a shorter distance (a calibration race or a hard time trial) run through a standard equivalence conversion, then confirmed - or adjusted - against how tempo and long-run paces have actually felt in training. A pace that only exists on paper, never tested at any real effort beforehand, is a pace you're hoping for, not one you've earned.

Training-run pacing and race-day pacing serve different goals and shouldn't be confused. An easy run run at "race effort" defeats the purpose of an easy day - it's supposed to feel truly easy, conversational, recovery-promoting. A tempo run's pace should be uncomfortable but controlled, not an all-out effort. Race day is the one day the plan asks you to actually spend everything you have, deliberately, at a pace you've already rehearsed. Treating every run like a race is one of the most common ways training goes wrong, well before race day even arrives.

Finally, splits are a tool, not a verdict. A single slow mile - caused by a hill, a water stop, a bathroom break, a moment of doubt - doesn't mean the day is lost. What matters is the trend across the whole effort, not any one data point along the way.`,
  },
  {
    title: "Fueling and hydration",
    content: `The most reliable fueling rule in distance running is also the simplest: nothing new on race day. Whatever gels, chews, sports drink, or real food you plan to use in a race needs to be tested - repeatedly, not once - during training runs long enough to matter. A product that sits fine in a calm training run can still cause real distress under race-day adrenaline and effort, so testing under at least some race-like intensity matters too, not just distance.

For anything lasting much longer than 60-75 minutes, the body's stored carbohydrate alone typically isn't enough to sustain effort late in the run - this is the practical reason long runs and marathon-distance efforts benefit from mid-run carbohydrate intake, roughly in the 30-60g-per-hour range as a starting point, adjusted by what your gut actually tolerates. Going out with zero fueling strategy for a long effort is a common, avoidable cause of the late-race "wall."

Hydration doesn't have one universal number that applies to everyone - sweat rate varies enormously by person, heat, and effort level. Drinking strictly to a fixed schedule regardless of thirst can be just as much of a problem as under-drinking, particularly in cooler conditions. Thirst is a reasonably reliable guide for most runners in most conditions; it becomes less reliable in extreme heat or during very long efforts, where a deliberate plan (tested in training, again) is worth having.

The 30-60 minutes after a hard or long effort is a genuinely useful window for recovery-focused eating - a mix of carbohydrate to refill glycogen and protein to support muscle repair. It's a real, evidence-backed benefit, but it is not a hard deadline where missing it "ruins" the workout - eating well over the following few hours still gets most of the benefit.

Most mid-run gastrointestinal distress traces back to one of a few causes: going out too fast (blood flow gets diverted from digestion under high effort), too much fiber or fat too close to the run, too-concentrated sugar without enough water alongside it, or simply trying something completely new mid-effort. When something upsets your stomach in training, that's useful information, not bad luck - it's telling you something specific to adjust before it happens again on a day that matters more.`,
  },
  {
    title: "Injury prevention",
    content: `Training discomfort and injury pain are different things, and learning to tell them apart is one of the most valuable skills a runner develops. General fatigue, mild overall soreness that fades within a day or two, and muscles that feel "heavy" during a hard effort are normal parts of training adaptation. Sharp pain, pain localized to one specific spot, pain that changes how you're moving, or pain that gets worse as a run goes on (rather than warming up and easing) are different - those are signals worth taking seriously, not signals to push through.

A widely cited rough guideline is increasing weekly mileage by no more than about 10% at a time - it's a reasonable starting heuristic, not a strict law, and plenty of well-designed plans deviate from it in either direction for good reasons (a step-back recovery week, or a controlled bigger jump for a very low starting volume). What actually matters more than the exact percentage is avoiding repeated, large, sudden jumps in load without enough time for tissue to adapt.

Easy days that are genuinely easy are one of the most underrated injury-prevention tools available. A large share of a well-built training week is deliberately low-intensity specifically so the harder, higher-value sessions can be run with enough freshness to do their job, and so cumulative weekly stress on tendons, joints, and connective tissue stays manageable. Runners who turn every easy day into a moderate effort - "just running a bit faster because it felt fine" - are quietly stacking load their plan never accounted for.

Basic strength work focused on the hips, glutes, and core is one of the better-supported interventions for reducing common overuse running injuries (runner's knee, IT band issues, some categories of shin pain), largely by improving control and stability through the stride rather than by building raw strength for its own sake. It doesn't need to be complicated or time-consuming to be worthwhile.

None of this is medical advice, and it isn't a substitute for it. Pain that's sharp, localized, worsening, or that changes your gait - or any pain you're genuinely unsure about - is worth having looked at by a doctor or physical therapist rather than diagnosed from an app. Training through real injury pain in the hope it resolves on its own is one of the most common ways a short setback turns into a much longer one.`,
  },
  {
    title: "Tapering",
    content: `A taper exists to let your body absorb and consolidate months of training stress while race day is still close enough that fitness doesn't meaningfully fade - it's recovery with a deadline, not a reward lap where effort stops mattering. The fitness you have two weeks out from a marathon is very close to the fitness you'll have on race morning; the taper's job is making sure you can actually access it, rather than showing up carrying weeks of accumulated fatigue.

Taper length scales with race distance and the training load that preceded it. A marathon taper commonly runs two to three weeks; shorter races (10K, half marathon) typically need less, sometimes under a week. What actually happens during a taper is usually a significant drop in overall volume alongside relatively preserved intensity and frequency - short, sharp efforts at or near race pace stay in the mix in reduced volume, while the long, grinding sessions that built the fitness in the first place mostly step aside.

Feeling sluggish, restless, or oddly heavy-legged partway through a taper is common enough to have its own informal name ("taper tantrums" is the usual one) and doesn't reliably predict how race day will actually feel. It's a normal, temporary side effect of the body recalibrating to a sudden drop in training load, not a sign that fitness is slipping away. The runners who trust the taper and hold back generally race better than the ones who panic and squeeze in extra hard efforts to "make sure" the fitness is still there.

Sleep and nutrition deserve more attention during a taper than they typically get, not less - this is the window where the actual physiological adaptation from months of training work gets consolidated, and where race-week logistics (travel, unfamiliar food, disrupted sleep) can quietly undermine weeks of good preparation if left unmanaged. A taper isn't just doing less running; it's actively supporting the recovery that less running is supposed to make room for.`,
  },
  {
    title: "Recovery",
    content: `Adaptation - the entire reason training works - happens during recovery, not during the workout itself. A hard session or a long run creates a stimulus; rest and easy days are what let the body actually respond to that stimulus by getting fitter. Skipping recovery in favor of more training doesn't add more fitness, it removes the conditions fitness needs to develop, which is why "easy days" and full rest days are load-bearing parts of a training plan, not optional extras bolted on around the real work.

Sleep is the single highest-leverage recovery tool most runners have, and the one most commonly shortchanged. Growth hormone release, tissue repair, and cognitive recovery all lean heavily on adequate sleep duration and quality - a training block built on consistently short sleep is working against itself in ways that no amount of foam rolling or stretching can fully offset.

Active recovery (an easy walk, light spinning, gentle mobility work) and full rest both have a place, and neither one is universally "better" - very light movement can modestly aid circulation and perceived recovery for some runners, while others simply need a full day off. Either approach is a reasonable default; what matters more is actually taking the lower-stress day seriously rather than turning it into a moderate-effort session in disguise.

A rising resting heart rate over several days, persistent fatigue that doesn't improve with a normal easy day or rest day, unusual irritability or low mood, disrupted sleep despite feeling tired, or performance that keeps declining despite consistent training are all worth paying attention to together - any one alone can have an ordinary explanation, but the pattern is the more useful signal of accumulating fatigue than any single day's feeling. When that pattern shows up, an extra easy day or two - or a genuinely restructured week - is a far cheaper fix than pushing through into a much longer setback.

Among recovery modalities, evidence is genuinely modest for most of what gets marketed heavily - foam rolling and light stretching have some modest support for perceived soreness and mobility, but none of the popular recovery gadgets are essential to training well. Consistent sleep, adequate fueling, and genuinely easy easy-days do more for recovery than any single tool or device claims to.`,
  },
];

async function main() {
  console.log(`Seeding ${ARTICLES.length} knowledge_base articles...\n`);

  const { error: deleteError } = await supabase.from("knowledge_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) throw deleteError;

  for (const article of ARTICLES) {
    process.stdout.write(`  Embedding "${article.title}"... `);
    const embedding = await embed(`${article.title}\n\n${article.content}`);
    const { error } = await supabase.from("knowledge_base").insert({
      title: article.title,
      content: article.content,
      embedding,
    });
    if (error) throw error;
    console.log(`done (${embedding.length}-dim)`);
  }

  console.log(`\nSeeded ${ARTICLES.length} articles.`);
}

main().catch((e) => {
  console.error("Error:", e.message ?? e);
  process.exit(1);
});
