
# Hustler — Train Smart. Hustle Harder.

## What is Hustler?

Hustler is a free mobile app that gives badminton players structured, personalized training and a direct line to a real coach — right where they live. Over 220 million people play badminton worldwide, but most don't have access to professional coaching. Hustler puts a personal coach in every player's pocket: no expensive gym, no private trainer, just your phone and the drive to improve.

## The Problem

Young badminton players who want to get better face three barriers:

- **No structure** — without a coach, there's no training plan, no progression, no one telling you what to work on next
- **No connection** — players train alone in their local parks and community centers, with no way to find other players, share knowledge, or stay connected to a coach between sessions
- **No accountability** — there's no way to track progress, remember what worked against an opponent, or know if you're actually improving

## The Solution

Hustler solves all three by combining personalized training, a direct coach-player connection, match scouting, and community features in one app.

**Personalized Training** — Exercises organized across four categories (Strength, Footwork, Endurance, Recovery), each with video demonstrations and step-by-step instructions. A recommendation engine analyzes training data and suggests what to focus on next. Plyometric exercises track height progression alongside reps and sets, so explosive power builds up safely over time instead of all at once.

**Coach Connection** — Inspired by how Snapchat connects friends directly, a coach and player link one-to-one instead of through a generic "class" roster. Once connected, a coach can assign workouts, review proof-of-completion uploads, message in real time, track a player's progress on a chart, and leave private coaching notes — the relationship actually lives inside the app, not bolted onto a tracker.

**Match Scouting** — Players log matches and build a running "scouting book" on every opponent they've faced — strengths, weaknesses, and notes to pull up before a rematch instead of relying on memory. A deeper game analysis section, surfacing trends across matches over time, is in active development.

**Progress Tracking** — Log every session in seconds. Track streaks, weekly goals, and category balance. See exactly where you're strong and where you need work.

**Journal** — A quick daily check-in for mood and how training felt, with optional voice notes and writing prompts. Entries stay private by default, with an option to share specific entries with a coach.

**Community** — A moderated forum where players share tips, ask questions, and post local tournaments with photos.

## Design

The app uses a warm, editorial visual identity, a cream background, serif headlines, and a restrained color palette where every accent color has a specific job — instead of a generic dark-mode fitness-app look. The goal was for the app to feel like it was made by someone who actually plays the sport, not templated.

## Features

- Recommendation engine with personalized training suggestions
- Video-guided exercises across 4 categories, including plyometrics with height progression
- One-to-one coach-player connection: workout assignment, proof-of-completion uploads, real-time messaging, progress charts, private notes
- Match logging with opponent scouting profiles (strengths, weaknesses, tags)
- Game analysis section (in development)
- Daily journal with mood check-ins, voice notes, and prompts, with optional coach sharing
- Session logging with emoji mood tracking
- Streak tracking and weekly goal progress
- Community forum with moderated topics, image uploads, and reporting
- Calendar with color-coded events (Tournament, Training, Rest Day, Custom)
- Custom workout creation with Cloudinary video upload
- Profile editing and onboarding flow

## Built With

- React Native & Expo SDK 56
- TypeScript
- Supabase (Auth, PostgreSQL, Row-Level Security, Storage, Realtime)
- Cloudinary (video and image hosting)
- Expo Router (file-based navigation)

## Who Is It For?

Badminton players aged 8–20 — casual or competitive — who have big dreams but no professional coach, and the coaches who want a real way to stay connected to them between sessions.

## Why I Built It

I trained completely alone for years, with no coach and no plan. Now I coach badminton part-time myself, and I watch the same thing happen to my players every season — talent with no structure behind it. I built Hustler so no athlete has to train in isolation, and so the coach-player relationship doesn't have to end when practice does.

## Getting Started

1. Clone the repo
```bash
git clone https://github.com/nishthad-maker/badminton_app.git
cd badminton_app
```

2. Install dependencies
```bash
npm install
```

3. Start the app
```bash
npx expo start
```

4. Scan the QR code with Expo Go (Android) or press `w` for web
