// Curated, hand-written pool for the Mental Prep Talk feature. Each entry
// has a real recorded clip (ElevenLabs, "Bella" voice — picked after
// comparing 5 real voices, see the voice-preview session) hosted on
// Cloudinary under hustler_pep_talks/, uploaded via the same unsigned
// preset lib/cloudinary.ts already uses for chat/voice-note media. This
// replaced live on-device speech synthesis (expo-speech), which only ever
// sounded as good as whatever robotic voice happened to be installed on
// the user's OS — see PepTalkModal for playback.
//
// `id` is stable regardless of text edits — it's the audio filename. If you
// edit a message's text here, its audioUrl now says something else out
// loud than what's printed on screen, so re-generate that one clip (same
// script/voice) and swap in the new audioUrl rather than just editing text.
const pepTalks = [
  { id: 'prep-01', text: "One bad rally doesn't erase everything you've built. Reset your feet, reset your head, next point.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960681/hustler_pep_talks/prep-01.mp3' },
  { id: 'prep-02', text: "You don't have to feel ready to start. Most days you just start, and ready shows up halfway through.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960683/hustler_pep_talks/prep-02.mp3' },
  { id: 'prep-03', text: "The player who beat you today isn't more talented — they've just logged more reps. That's the part you control.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960686/hustler_pep_talks/prep-03.mp3' },
  { id: 'prep-04', text: "Tired legs still know how to move. Trust the footwork you've drilled a hundred times.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960688/hustler_pep_talks/prep-04.mp3' },
  { id: 'prep-05', text: 'A tough loss is just data. Write down one thing you noticed, and let the rest go.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960690/hustler_pep_talks/prep-05.mp3' },
  { id: 'prep-06', text: "You're allowed to be frustrated for five minutes. Then it's time to breathe and reset.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960692/hustler_pep_talks/prep-06.mp3' },
  { id: 'prep-07', text: 'Nobody plays their best every session. Showing up on the flat days is what separates you.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960694/hustler_pep_talks/prep-07.mp3' },
  { id: 'prep-08', text: "Your opponent can't see how hard you've trained — only how you respond to the next point.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960697/hustler_pep_talks/prep-08.mp3' },
  { id: 'prep-09', text: "Slow progress is still progress. You're not the same player you were three months ago.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960699/hustler_pep_talks/prep-09.mp3' },
  { id: 'prep-10', text: "Missed shots don't define you. What you do after the miss does.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960701/hustler_pep_talks/prep-10.mp3' },
  { id: 'prep-11', text: 'Breathe in for four counts, out for four. Let your shoulders drop before the next serve.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960703/hustler_pep_talks/prep-11.mp3' },
  { id: 'prep-12', text: "You've recovered from worse spots than this before. Play the point in front of you.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960705/hustler_pep_talks/prep-12.mp3' },
  { id: 'prep-13', text: "Confidence isn't a feeling you wait for — it's built one solid rally at a time.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960708/hustler_pep_talks/prep-13.mp3' },
  { id: 'prep-14', text: "It's okay to lose to someone better today. It's not okay to stop trying to close the gap.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960710/hustler_pep_talks/prep-14.mp3' },
  { id: 'prep-15', text: "The scoreboard doesn't know your effort. Play for the version of yourself that shows up tomorrow.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960712/hustler_pep_talks/prep-15.mp3' },
  { id: 'prep-16', text: "A rough training day means your body's asking for rest, not that you're falling behind.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960715/hustler_pep_talks/prep-16.mp3' },
  { id: 'prep-17', text: 'Every top player has had a session this bad. The difference is they came back the next day anyway.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960717/hustler_pep_talks/prep-17.mp3' },
  { id: 'prep-18', text: 'Focus on your feet, not the score. The footwork carries the rest.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960719/hustler_pep_talks/prep-18.mp3' },
  { id: 'prep-19', text: "You don't need a perfect match — you need one more good point than your last one.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960722/hustler_pep_talks/prep-19.mp3' },
  { id: 'prep-20', text: "Let the last point go. It already happened. This one hasn't.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960725/hustler_pep_talks/prep-20.mp3' },
  { id: 'prep-21', text: "Champions aren't the ones who never struggle — they're the ones who keep showing up through it.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960727/hustler_pep_talks/prep-21.mp3' },
  { id: 'prep-22', text: 'Your only real opponent today is the version of you that wants to give up early.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960729/hustler_pep_talks/prep-22.mp3' },
  { id: 'prep-23', text: 'Take a lap, get some water, and come back with a clear head. The court will still be there.', audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960731/hustler_pep_talks/prep-23.mp3' },
  { id: 'prep-24', text: "This feeling is temporary. Your work ethic isn't.", audioUrl: 'https://res.cloudinary.com/pyqqwrax/video/upload/v1785960733/hustler_pep_talks/prep-24.mp3' },
];

export default pepTalks;
