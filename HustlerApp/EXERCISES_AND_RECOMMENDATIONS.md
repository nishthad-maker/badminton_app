# Exercise Library & Recommendation Logic

Source: `src/data/workouts.js` (45 exercises) and `src/app/exercise.tsx` (recommendation engine).

**How to use this file:** edit anything below that's wrong — rename an exercise, fix a description, change its log type or category, add a new one, delete one — and send it back. Just keep each exercise on its own line in the `Name — logType — description` shape so it's easy for me to diff against the real data file.

---

## Strength (22)

### Lower body (9)
1. Bulgarian Squat — `strength` — Builds single-leg balance and power for lunges and quick court movement.
2. Deadlift — `strength` — Strengthens back, glutes, and legs for hip power and stability.
3. Leg Extension — `strength` — Builds quad strength for pushing off, jumping, and absorbing force.
4. Calf Raise — `strength` — Strengthens calves for quick steps and staying light on your feet.
5. Goblet Squat — `strength` — Builds leg and core strength while keeping your body upright.
6. Jump Squat — `strength` — Builds explosive leg power for jumping and quick bursts on court.
7. Lateral Lunge — `strength` — Trains the side-to-side push used for wide lunges and net returns.
8. Single-Leg Romanian Deadlift — `strength` — Builds one-leg balance and hamstring strength for reaching wide shots.
9. Wall Sit — `sets-duration` — Builds quad endurance for staying low and ready between rallies.

### Upper body (6)
10. Shoulder Press — `strength` — Strengthens shoulders for powerful smashes and clears.
11. Push Ups — `reps-sets` — Strengthens chest, shoulders, and arms for controlling the racket.
12. Overhead Triceps — `strength` — Strengthens the back of your arms for faster racket swings.
13. Overhead Medicine Ball Slams — `strength` — Trains explosive power for hitting hard shots.
14. Battle Ropes — `strength-time` — Builds explosive shoulder and arm endurance for repeated fast swings.
15. Wrist Curl — `strength` — Builds forearm and wrist strength for racket control and a faster wrist snap. Start with a very light weight — this one is harder than it looks. *(⚠ the em dash in this description is a corrupted `�` character in the actual data file — worth a real fix, flagged below)*

### Core (7)
16. Plank — `plank` — Keeps your core tight for balance and stability on court.
17. Russian Twist — `strength` — Builds twisting strength for smashes, clears, and drives.
18. Leg Raise — `reps-sets` — Strengthens lower abs for control when you move and jump.
19. Tuck In — `reps-sets` — Trains lower abs to stay engaged during lunges and recovery steps.
20. Bicycle Crunch — `reps-sets` — Builds rotating core strength for smashes and cross-court drives.
21. Army Crawl Plank — `reps-sets` — Builds core and shoulder stability while moving, not just holding still.
22. Mountain Climber — `reps-sets` — Builds core control and quick-feet conditioning at the same time.

## Footwork (10)

### Agility (4)
23. Agility Ladder — `footwork` — Trains fast, light footwork for quicker steps on court.
24. Split-Step Reaction — `footwork` — Trains quick reaction and explosive first-step movement.
25. Fast Feet — `footwork` — Trains quick, light steps for faster court movement. Beginner: 30 sec × 5 sets.
26. Karaoke — `reps-sets` — Trains hip rotation and quick lateral steps used for sidestepping around the court.

### Drills (1)
27. Corner Shuttle Defence — `footwork` — Builds the habit of moving out, defending, and recovering to base.

### Plyometrics (5)
28. Box Jumps — `plyometric` — Trains explosive leg drive for your jump smash.
29. Jump Lunges — `reps-sets` — Builds single-leg power and fast recovery for lunging in and out.
30. Single-Leg Hop — `reps-sets` — Builds single-leg balance and spring for lunging and recovering on one foot.
31. Burpees — `reps-sets` — Builds full-body conditioning and explosive power for scrambling and recovering fast.
32. Lateral Hops — `reps-sets` — Builds side-to-side spring and ankle strength for quick lateral movement on court.

## Endurance (8)
33. Interval Running — `sets-duration` — Trains fast recovery after tough rallies with hard-easy bursts.
34. Skipping Rope — `skipping` — Builds stamina and keeps your feet light and quick.
35. Long Steady Cardio — `duration-distance` — Builds base stamina to help you last longer in matches.
36. Sprint — `reps-sets` — Builds top-end speed and explosive acceleration for chasing down shots.
37. Rowing Intervals — `sets-duration` — Builds full-body conditioning and stamina with low-impact cardio bursts.
38. Stair Sprints — `sets-duration` — Builds explosive leg power and match-fitness stamina.
39. Air Bike — `sets-duration` — Builds full-body conditioning and explosive pace for repeated hard rallies. *(gets special HIIT interval numbers in the recommendation engine — see below)*
40. Treadmill Run — `sets-duration` — Builds steady-state stamina to help you last longer in matches.

## Recovery (5)
41. Ice Bath — `recovery` — Reduces muscle soreness and helps tired legs recover faster.
42. Foam Rolling — `recovery` — Loosens tight muscles and improves blood flow after training.
43. Breathing and Relaxation — `recovery` — Calms your body, slows heart rate, and relaxes muscles.
44. Upper Body Stretching — `recovery` — Releases tightness in shoulders, arms, and back after training.
45. Lower Body Stretching — `recovery` — Releases tightness in legs and hips after training.

---

## ⚠ One real bug spotted while pulling this data
**Wrist Curl**'s description has a corrupted character in `src/data/workouts.js` — it reads `...faster wrist snap. Start with a very light weight � this one is harder than it looks.` (a mangled em dash, `�`, not the encoding issue of this file). Say the word and I'll fix it directly in the data file.

---

## How the on-page recommendation works (quick reference)

Per-exercise, not a global recommender. Two inputs only: the player's own `skill_level` (Beginner/Intermediate/Advanced) and their own past logged sessions **for that exercise**.

- **No sessions yet:** Advanced → "log your first session, no target given." Beginner/Intermediate → a starting target keyed by log type (e.g. `reps-sets` → 2×8 Beginner / 3×12 Intermediate). Weight-based (`strength`) uses the player's own one-time starting weight instead. Air Bike is the one exception — it gets real HIIT interval numbers instead of the generic `sets-duration` default.
- **3+ sessions logged:** flat-or-improving trend → progress the number up (+2.5kg / +10s / +1-2 reps or sets / +5min depending on type); declining/inconsistent → recommend repeating last session's numbers instead of pushing further.
- **Box Jumps (plyometric) is the one exercise with extra guardrails:** any shaky/missed landing blocks a height increase outright; height only goes up after 3 clean sessions in a row, +2in per bump, max once a week, capped at 30in. Reps/sets still progress independently in between height bumps.
- **Battle Ropes is the other exception:** won't suggest adding weight until sets/time hit a real working volume (4×45s) first.

All rules-based, all client-side in `exercise.tsx` — no model, no server call.
