const SUPABASE_URL = 'https://iuozlbphhheogfxjtpes.supabase.co';
const VIDEOS = `${SUPABASE_URL}/storage/v1/object/public/excersies-videos`;

const workouts = {

  strength: [

    {

      name: 'Bulgarian Squat',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Builds single-leg balance and power for lunges and quick court movement.',

      muscles: ['Quads', 'Glutes', 'Hamstrings'],

      videoUrl: `${VIDEOS}/Strength/bulgarian-squat.mov`,

      imageUrl: null,

      steps: [

        'Stand a step in front of a bench.',

        'Put one foot behind you on the bench.',

        'Bend your front knee and lower your body down.',

        'Push through your front foot to stand back up.',

        'Repeat, then switch legs.',

      ],

    },

    {

      name: 'Deadlift',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Strengthens back, glutes, and legs for hip power and stability.',

      muscles: ['Glutes', 'Hamstrings', 'Lower Back'],

      videoUrl: `${VIDEOS}/Strength/deadlift.mov`,

      imageUrl: null,

      steps: [

        'Stand with a weight in front of you.',

        'Keep your back straight and knees slightly bent.',

        'Push your hips back and lower the weight down.',

        'Stand back up by squeezing your glutes.',

        'Keep the weight close to your body.',

      ],

    },

    {

      name: 'Leg Extension',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Builds quad strength for pushing off, jumping, and absorbing force.',

      muscles: ['Quads'],

      videoUrl: `${VIDEOS}/Strength/leg-extension.mov`,

      imageUrl: null,

      steps: [

        'Sit on the machine and place your lower legs behind the pad.',

        'Hold the seat handles and keep your back against the pad.',

        'Slowly lift your legs up until they are straight.',

        'Pause for a second at the top.',

        'Lower your legs back down slowly.',

        'Repeat with control.',

      ],

    },

    {

      name: 'Calf Raise',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Strengthens calves for quick steps and staying light on your feet.',

      muscles: ['Calves', 'Ankles', 'Feet'],

      videoUrl: `${VIDEOS}/Strength/calf-raise.mov`,

      imageUrl: null,

      steps: [

        'Stand tall with your feet flat.',

        'Lift your heels off the floor.',

        'Balance on the balls of your feet.',

        'Lower your heels slowly.',

        'Repeat in a smooth rhythm.',

      ],

    },

    {

      name: 'Goblet Squat',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Builds leg and core strength while keeping your body upright.',

      muscles: ['Quads', 'Glutes', 'Core'],

      videoUrl: `${VIDEOS}/Strength/goblet-squat.mp4`,

      imageUrl: null,

      steps: [

        'Hold one weight close to your chest.',

        'Stand with your feet a little apart.',

        'Bend your knees and lower into a squat.',

        'Keep your chest up.',

        'Push through your feet to stand back up.',

      ],

    },

    {

      name: 'Jump Squat',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Builds explosive leg power for jumping and quick bursts on court.',

      muscles: ['Quads', 'Glutes', 'Calves'],

      videoUrl: `${VIDEOS}/Strength/squat-jump.mp4`,

      imageUrl: null,

      steps: [

        'Stand with your feet shoulder-width apart.',

        'Bend your knees and lower into a squat.',

        'Explode up and jump as high as you can.',

        'Land softly with bent knees to absorb the impact.',

        'Go straight into the next squat and repeat.',

      ],

    },

    {

      name: 'Lateral Lunge',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Trains the side-to-side push used for wide lunges and net returns.',

      muscles: ['Quads', 'Glutes', 'Adductors'],

      videoUrl: `${VIDEOS}/Strength/lateral-lunge.mov`,

      imageUrl: null,

      steps: [

        'Stand tall with feet together.',

        'Take a big step to one side and bend that knee.',

        'Keep the other leg straight.',

        'Push through your bent leg to return to standing.',

        'Repeat, then switch sides.',

      ],

    },

    {

      name: 'Single-Leg Romanian Deadlift',

      subcategory: 'lower',

      logType: 'strength',

      description: 'Builds one-leg balance and hamstring strength for reaching wide shots.',

      muscles: ['Hamstrings', 'Glutes', 'Core'],

      videoUrl: `${VIDEOS}/Strength/single-leg-romanian-deadlift.mov`,

      imageUrl: null,

      steps: [

        'Stand on one leg, holding a weight in the opposite hand.',

        'Hinge forward at the hips, letting your free leg lift behind you.',

        'Keep your back flat and reach the weight toward the floor.',

        'Squeeze your glute to return to standing.',

        'Finish all reps, then switch legs.',

      ],

    },

    {

      name: 'Wall Sit',

      subcategory: 'lower',

      logType: 'sets-duration',

      description: 'Builds quad endurance for staying low and ready between rallies.',

      muscles: ['Quads', 'Glutes'],

      videoUrl: null,

      imageUrl: 'wallsit',

      steps: [

        'Lean your back flat against a wall.',

        'Slide down until your knees are bent at 90 degrees.',

        'Keep your feet flat and knees over your ankles.',

        'Hold the position, keeping your back pressed to the wall.',

        'Slide back up to stand and rest.',

      ],

    },

    {

      name: 'Shoulder Press',

      subcategory: 'upper',

      logType: 'strength',

      description: 'Strengthens shoulders for powerful smashes and clears.',

      muscles: ['Shoulders', 'Triceps'],

      videoUrl: `${VIDEOS}/Strength/shoulder-press.mov`,

      imageUrl: null,

      steps: [

        'Sit or stand with a weight in each hand.',

        'Hold the weights at shoulder level.',

        'Push them straight up over your head.',

        'Lower them back down slowly.',

        'Repeat with control.',

      ],

    },

    {

      name: 'Push Ups',

      subcategory: 'upper',

      logType: 'reps-sets',

      description: 'Strengthens chest, shoulders, and arms for controlling the racket.',

      muscles: ['Chest', 'Shoulders', 'Triceps', 'Core'],

      videoUrl: `${VIDEOS}/Strength/push-ups.mov`,

      imageUrl: null,

      steps: [

        'Start on your hands and toes.',

        'Keep your body in a straight line.',

        'Bend your elbows and lower your chest.',

        'Push yourself back up.',

        'Keep going at a steady pace.',

      ],

    },

    {

      name: 'Overhead Triceps',

      subcategory: 'upper',

      logType: 'strength',

      description: 'Strengthens the back of your arms for faster racket swings.',

      muscles: ['Triceps', 'Shoulders'],

      videoUrl: `${VIDEOS}/Strength/overhead-triceps.mov`,

      imageUrl: null,

      steps: [

        'Hold one weight over your head with both hands.',

        'Keep your elbows close to your head.',

        'Lower the weight behind your head.',

        'Push it back up.',

        'Move slowly and do not swing.',

      ],

    },

    {

      name: 'Overhead Medicine Ball Slams',

      subcategory: 'upper',

      logType: 'strength',

      description: 'Trains explosive power for hitting hard shots.',

      muscles: ['Shoulders', 'Arms'],

      videoUrl: `${VIDEOS}/Strength/ball-slam.mov`,

      imageUrl: null,

      steps: [

        'Stand with your feet apart and hold a medicine ball.',

        'Raise the ball above your head.',

        'Tighten your core.',

        'Slam the ball hard down to the floor.',

        'Pick it up and repeat.',

        'Make each slam fast and powerful.',

      ],

    },

    {

      name: 'Plank',

      subcategory: 'core',

      logType: 'plank',

      description: 'Keeps your core tight for balance and stability on court.',

      muscles: ['Core', 'Shoulders', 'Glutes'],

      videoUrl: null,

      imageUrl: 'local',

      steps: [

        'Put your forearms on the floor.',

        'Stretch your legs behind you.',

        'Keep your body in a straight line.',

        'Hold your stomach tight.',

        'Stay still and breathe.',

      ],

    },

    {

      name: 'Russian Twist',

      subcategory: 'core',

      logType: 'strength',

      description: 'Builds twisting strength for smashes, clears, and drives.',

      muscles: ['Core', 'Obliques'],

      videoUrl: `${VIDEOS}/Strength/russian-twist.mov`,

      imageUrl: null,

      steps: [

        'Sit on the floor and bend your knees.',

        'Lean back a little and keep your chest up.',

        'Hold your hands together in front of you.',

        'Turn your hands and upper body to one side.',

        'Then turn to the other side.',

        'Move slowly and stay in control.',

      ],

    },

    {

      name: 'Leg Raise',

      subcategory: 'core',

      logType: 'reps-sets',

      description: 'Strengthens lower abs for control when you move and jump.',

      muscles: ['Lower Abs', 'Core', 'Hip Flexors'],

      videoUrl: `${VIDEOS}/Strength/leg-raise.mov`,

      imageUrl: null,

      steps: [

        'Lie on your back.',

        'Put your legs straight out.',

        'Lift both legs up slowly.',

        'Lower them back down without touching the floor.',

        'Keep your stomach tight the whole time.',

      ],

    },

    {

      name: 'Tuck In',

      subcategory: 'core',

      logType: 'reps-sets',

      description: 'Trains lower abs to stay engaged during lunges and recovery steps.',

      muscles: ['Lower Abs', 'Core', 'Hip Flexors'],

      videoUrl: `${VIDEOS}/Strength/tuck-in.mov`,

      imageUrl: null,

      steps: [

        'Sit on the floor with your knees bent and feet lifted off the ground.',

        'Balance on your glutes, leaning back slightly.',

        'Extend your legs out straight while leaning back a little more.',

        'Pull your knees back in toward your chest.',

        'Repeat the extend-and-tuck motion with control.',

      ],

    },

    {

      name: 'Bicycle Crunch',

      subcategory: 'core',

      logType: 'reps-sets',

      description: 'Builds rotating core strength for smashes and cross-court drives.',

      muscles: ['Core', 'Obliques'],

      videoUrl: `${VIDEOS}/Strength/bicycle-crunch.mp4`,

      imageUrl: null,

      steps: [

        'Lie on your back with your hands behind your head.',

        'Lift your shoulders off the floor and bring your knees up.',

        'Bring one elbow toward the opposite knee while extending the other leg out.',

        'Switch sides in a smooth pedaling motion.',

        'Keep your lower back pressed into the floor the whole time.',

      ],

    },

    {

      name: 'Army Crawl Plank',

      subcategory: 'core',

      logType: 'reps-sets',

      description: 'Builds core and shoulder stability while moving, not just holding still.',

      muscles: ['Core', 'Shoulders', 'Triceps'],

      videoUrl: `${VIDEOS}/Strength/army-crawl.MP4`,

      imageUrl: null,

      steps: [

        'Start in a high plank with arms straight.',

        'Lower one forearm down, then the other, into a forearm plank.',

        'Push back up one arm at a time to a high plank.',

        'Keep your hips still and level the whole time.',

        'Alternate which arm leads each rep.',

      ],

    },

    {

      name: 'Mountain Climber',

      subcategory: 'core',

      logType: 'reps-sets',

      description: 'Builds core control and quick-feet conditioning at the same time.',

      muscles: ['Core', 'Shoulders', 'Hip Flexors'],

      videoUrl: `${VIDEOS}/Strength/mountain-climber.mp4`,

      imageUrl: null,

      steps: [

        'Start in a high plank with your hands under your shoulders.',

        'Keep your core tight and your back flat.',

        'Drive one knee toward your chest, then quickly switch legs.',

        'Keep alternating legs in a running motion.',

        'Move as fast as you can while staying controlled.',

      ],

    },

    {

      name: 'Battle Ropes',

      subcategory: 'upper',

      logType: 'strength-time',

      description: 'Builds explosive shoulder and arm endurance for repeated fast swings.',

      muscles: ['Shoulders', 'Arms', 'Core'],

      videoUrl: `${VIDEOS}/Strength/battle-rope.mov`,

      imageUrl: null,

      steps: [

        'Hold one rope end in each hand, feet shoulder-width apart.',

        'Bend your knees slightly and brace your core.',

        'Whip the ropes up and down as fast as you can.',

        'Keep a steady rhythm for the set time.',

        'Rest, then repeat for more sets.',

      ],

    },

    {

      name: 'Wrist Curl',

      subcategory: 'upper',

      logType: 'strength',

      description: 'Builds forearm and wrist strength for racket control and a faster wrist snap. Start with a very light weight — this one is harder than it looks.',

      muscles: ['Forearms', 'Wrists'],

      videoUrl: `${VIDEOS}/Strength/wrist-curl.mp4`,

      imageUrl: null,

      steps: [

        'Sit and rest your forearm on your thigh or a bench, palm facing up.',

        'Hold a light weight and let your wrist drop down.',

        'Curl your wrist up as far as it comfortably goes.',

        'Lower back down slowly.',

        'Start light — this one fatigues fast.',

      ],

    },

  ],

  footwork: [

    {

      name: 'Agility Ladder',

      subcategory: 'agility',

      logType: 'footwork',

      description: 'Trains fast, light footwork for quicker steps on court.',

      muscles: ['Feet', 'Calves', 'Ankles'],

      videoUrl: `${VIDEOS}/Footwork/agility-ladder-session.mov`,

      imageUrl: null,

      steps: [

        'Put the ladder on the floor.',

        'Step through each box quickly.',

        'Stay light on your feet.',

        'Keep your knees bent a little.',

        'Move fast, but stay in control.',

      ],

    },

    {

      name: 'Split-Step Reaction',

      subcategory: 'agility',

      logType: 'footwork',

      description: 'Trains quick reaction and explosive first-step movement.',

      muscles: ['Feet', 'Ankles', 'Calves', 'Hips', 'Core'],

      videoUrl: `${VIDEOS}/Footwork/recation.mov`,

      imageUrl: null,

      steps: [

        'Start in the middle in a ready stance.',

        'Stay on your toes and keep your body low.',

        'Do a small split step as the signal comes.',

        'Push off hard with the leg closest to the direction you need to go.',

        'Move fast to the target corner or side.',

        'Recover quickly back to the middle and repeat.',

      ],

    },

    {

      name: 'Corner Shuttle Defence',

      subcategory: 'drills',

      logType: 'footwork',

      description: 'Builds the habit of moving out, defending, and recovering to base.',

      muscles: ['Feet', 'Ankles', 'Calves', 'Thighs'],

      videoUrl: `${VIDEOS}/footwork/defence.mov`,

      imageUrl: null,

      steps: [

        'Start in the middle in a ready stance.',

        'Do a small split step when you imagine the smash is coming.',

        'Move quickly to the corner you need to defend.',

        'Use a low lunge or step to reach the shuttle.',

        'Pretend to lift or block the shuttle back.',

        'Push off and get back to the middle right away.',

      ],

    },

    {

      name: 'Box Jumps',

      subcategory: 'plyometrics',

      logType: 'plyometric',

      description: 'Trains explosive leg drive for your jump smash.',

      muscles: ['Quads', 'Glutes', 'Calves'],

      videoUrl: `${VIDEOS}/footwork/box-jump.mov`,

      imageUrl: null,

      steps: [

        'Stand in front of a sturdy box or step.',

        'Bend your knees and swing your arms back.',

        'Jump up and land softly on top of the box with both feet.',

        'Stand up fully at the top.',

        'Step back down carefully and repeat.',

      ],

    },

    {

      name: 'Jump Lunges',

      subcategory: 'plyometrics',

      logType: 'reps-sets',

      description: 'Builds single-leg power and fast recovery for lunging in and out.',

      muscles: ['Quads', 'Glutes', 'Hamstrings', 'Calves'],

      videoUrl: `${VIDEOS}/Footwork/lunges-jump.mov`,

      imageUrl: null,

      steps: [

        'Start in a lunge position with one foot forward and one back, both knees bent to about 90 degrees.',

        'Swing your arms and drive up explosively through both legs.',

        'While airborne, switch your legs so the back foot comes forward and the front foot goes back.',

        'Land softly back into a lunge with knees bent to absorb the impact.',

        'Immediately jump again, alternating legs each rep with control.',

      ],

    },

    {

      name: 'Single-Leg Hop',

      subcategory: 'plyometrics',

      logType: 'reps-sets',

      description: 'Builds single-leg balance and spring for lunging and recovering on one foot.',

      muscles: ['Calves', 'Ankles', 'Quads', 'Glutes'],

      videoUrl: `${VIDEOS}/Footwork/single-leg-hop.mp4`,

      imageUrl: null,

      steps: [

        'Stand tall balanced on one leg.',

        'Bend your knee slightly and swing your arms back.',

        'Hop forward off that same leg, landing softly on it.',

        'Stick the landing and stay balanced before the next hop.',

        'Finish all reps, then switch legs.',

      ],

    },

    {

      name: 'Burpees',

      subcategory: 'plyometrics',

      logType: 'reps-sets',

      description: 'Builds full-body conditioning and explosive power for scrambling and recovering fast.',

      muscles: ['Legs', 'Chest', 'Shoulders', 'Core'],

      videoUrl: `${VIDEOS}/Footwork/burpees.mp4`,

      imageUrl: null,

      steps: [

        'Start standing with your feet shoulder-width apart.',

        'Squat down and place your hands on the floor.',

        'Kick your feet back into a plank position.',

        'Do a push-up, then jump your feet back up to your hands.',

        'Explode up into a jump, then land softly and go straight into the next rep.',

      ],

    },

    {

      name: 'Fast Feet',

      subcategory: 'agility',

      logType: 'footwork',

      description: 'Trains quick, light steps for faster court movement. Beginner: 30 sec x 5 sets.',

      muscles: ['Feet', 'Calves', 'Ankles'],

      videoUrl: `${VIDEOS}/footwork/fast-feet.mp4`,

      imageUrl: null,

      steps: [

        'Stand tall with your feet hip-width apart.',

        'Quickly tap your feet up and down in place.',

        'Stay light on the balls of your feet.',

        'Keep your steps small and fast.',

        'Keep your core braced and arms driving.',

      ],

    },

    {

      name: 'Lateral Hops',

      subcategory: 'plyometrics',

      logType: 'reps-sets',

      description: 'Builds side-to-side spring and ankle strength for quick lateral movement on court.',

      muscles: ['Calves', 'Ankles', 'Quads'],

      videoUrl: `${VIDEOS}/footwork/lateral-hops.mp4`,

      imageUrl: null,

      steps: [

        'Stand on one or both feet next to a line on the floor.',

        'Hop sideways over the line.',

        'Land softly with bent knees.',

        'Hop back the other way.',

        'Keep a quick, controlled rhythm.',

      ],

    },

    {

      name: 'Karaoke',

      subcategory: 'agility',

      logType: 'reps-sets',

      description: 'Trains hip rotation and quick lateral steps used for sidestepping around the court.',

      muscles: ['Hips', 'Calves', 'Ankles'],

      videoUrl: `${VIDEOS}/footwork/karaoke.mp4`,

      imageUrl: null,

      steps: [

        'Stand sideways to the direction you will move.',

        'Cross one foot over the other, then step the trail foot out.',

        'Cross the other foot behind, then step out again.',

        'Move continuously in one direction, then switch sides.',

        'Keep your hips loose and steps quick.',

      ],

    },

  ],

  endurance: [

    {

      name: 'Interval Running',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Trains fast recovery after tough rallies with hard-easy bursts.',

      muscles: ['Heart', 'Lungs', 'Legs'],

      videoUrl: `${VIDEOS}/Endurance/cycling.mov`,

      imageUrl: null,

      steps: [

        'Pick one cardio move like running or cycling.',

        'Go hard for a short time, like 20 to 30 seconds.',

        'Then go easy or rest for a short time, like 30 to 60 seconds.',

        'Repeat the hard and easy parts many times.',

        'Finish with a slow cool down.',

      ],

    },

    {

      name: 'Skipping Rope',

      subcategory: 'endurance',

      logType: 'skipping',

      description: 'Builds stamina and keeps your feet light and quick.',

      muscles: ['Calves', 'Ankles', 'Core', 'Shoulders'],

      videoUrl: `${VIDEOS}/Endurance/skipping-rope.mov`,

      imageUrl: null,

      steps: [

        'Hold the rope handles in both hands.',

        'Swing the rope over your head.',

        'Jump lightly when the rope comes down.',

        'Stay on the balls of your feet.',

        'Keep going in a smooth rhythm.',

      ],

    },

    {

      name: 'Long Steady Cardio',

      subcategory: 'endurance',

      logType: 'duration-distance',

      description: 'Builds base stamina to help you last longer in matches.',

      muscles: ['Heart', 'Lungs', 'Legs'],

      videoUrl: `${VIDEOS}/Endurance/running.mov`,

      imageUrl: null,

      steps: [

        'Pick one: running, cycling, or rowing.',

        'Start slow and keep a steady pace.',

        'Breathe normally and do not go too hard.',

        'Keep going for 20 to 40 minutes.',

        'Stop, cool down, and rest.',

      ],

    },

    {

      name: 'Sprint',

      subcategory: 'endurance',

      logType: 'reps-sets',

      description: 'Builds top-end speed and explosive acceleration for chasing down shots.',

      muscles: ['Legs', 'Calves', 'Glutes', 'Core'],

      videoUrl: `${VIDEOS}/Endurance/sprint.mov`,

      imageUrl: null,

      steps: [

        'Find a straight stretch of space, like a track or open field.',

        'Start from a standing or slight crouch position.',

        'Drive hard off your first few steps to accelerate.',

        'Sprint at full speed for the set distance or time.',

        'Slow down gradually, then walk back to recover.',

        'Rest, then repeat for more reps.',

      ],

    },

    {

      name: 'Rowing Intervals',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Builds full-body conditioning and stamina with low-impact cardio bursts.',

      muscles: ['Legs', 'Back', 'Arms', 'Core'],

      videoUrl: `${VIDEOS}/Endurance/rowing.mov`,

      imageUrl: null,

      steps: [

        'Sit on the rowing machine with feet strapped in.',

        'Push hard with your legs first, then pull the handle to your chest.',

        'Extend your arms, then your legs, to return to the start.',

        'Go hard for a short burst, then row easy to recover.',

        'Repeat the hard and easy rowing for several rounds.',

      ],

    },

    {

      name: 'Stair Sprints',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Builds explosive leg power and match-fitness stamina.',

      muscles: ['Legs', 'Glutes', 'Calves', 'Heart'],

      videoUrl: `${VIDEOS}/Endurance/stair-sprint.mov`,

      imageUrl: null,

      steps: [

        'Find a set of stairs or a steep incline.',

        'Sprint up as fast as you can with quick steps.',

        'Walk back down to recover.',

        'Repeat for the set number of rounds.',

        'Push your pace on every sprint.',

      ],

    },

    {

      name: 'Air Bike',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Builds full-body conditioning and explosive pace for repeated hard rallies.',

      muscles: ['Legs', 'Arms', 'Heart', 'Lungs'],

      videoUrl: `${VIDEOS}/Endurance/air-bike.mp4`,

      imageUrl: null,

      steps: [

        'Sit on the bike and grab both handles.',

        'Push and pull the handles while pedaling at the same time.',

        'Go hard for a short burst, like 20 to 30 seconds.',

        'Ease off and pedal easy to recover.',

        'Repeat the hard and easy bursts for several rounds.',

      ],

    },

    {

      name: 'Treadmill Run',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Builds steady-state stamina to help you last longer in matches.',

      muscles: ['Heart', 'Lungs', 'Legs'],

      videoUrl: `${VIDEOS}/Endurance/treadmill-run.mp4`,

      imageUrl: null,

      steps: [

        'Set the treadmill to a comfortable running pace.',

        'Start with a short walk to warm up.',

        'Increase the speed to a steady running pace.',

        'Keep your breathing steady and your posture tall.',

        'Run for the set time or distance, then cool down with an easy walk.',

      ],

    },

  ],

  recovery: [

    {

      name: 'Ice Bath',

      subcategory: 'recovery',

      logType: 'recovery',

      description: 'Reduces muscle soreness and helps tired legs recover faster.',

      muscles: ['Legs', 'Full Body'],

      videoUrl: null,

      imageUrl: 'icebath',

      steps: [

        'Fill a tub with cold water and ice.',

        'Sit in it for about 5 to 10 minutes after a hard workout.',

        'Keep your breathing slow and steady.',

        'Get out if you feel too uncomfortable.',

      ],

    },

    {

      name: 'Foam Rolling',

      subcategory: 'recovery',

      logType: 'recovery',

      description: 'Loosens tight muscles and improves blood flow after training.',

      muscles: ['Legs', 'Back', 'Shoulders'],

      videoUrl: null,

      imageUrl: 'foam',

      steps: [

        'Place the foam roller under one tight muscle.',

        'Slowly roll back and forth over it.',

        'Pause on sore spots for a few seconds.',

        'Do each area for about 20 to 30 seconds.',

      ],

    },

    {

      name: 'Breathing and Relaxation',

      subcategory: 'recovery',

      logType: 'recovery',

      description: 'Calms your body, slows heart rate, and relaxes muscles.',

      muscles: ['Lungs', 'Core'],

      videoUrl: null,

      imageUrl: 'breath',

      steps: [

        'Sit or lie down in a quiet place.',

        'Breathe in slowly through your nose.',

        'Breathe out slowly through your mouth.',

        'Keep doing this for a few minutes to help your body calm down.',

      ],

    },

    {

      name: 'Upper Body Stretching',

      subcategory: 'recovery',

      logType: 'recovery',

      description: 'Releases tightness in shoulders, arms, and back after training.',

      muscles: ['Shoulders', 'Arms', 'Back'],

      videoUrl: null,

      imageUrl: 'upperstretch',

      steps: [

        'After training, find a comfortable spot to stand or sit.',

        'Hold each upper body stretch gently without bouncing.',

        'Hold each stretch for about 20 to 30 seconds.',

        'Focus on shoulders, arms, chest, and upper back.',

        'Stretch both sides of your body evenly.',

      ],

    },

    {

      name: 'Lower Body Stretching',

      subcategory: 'recovery',

      logType: 'recovery',

      description: 'Releases tightness in legs and hips after training.',

      muscles: ['Quads', 'Hamstrings', 'Calves', 'Hips'],

      videoUrl: null,

      imageUrl: 'lowerstretch',

      steps: [

        'After training, find a comfortable spot to sit or lie down.',

        'Hold each lower body stretch gently without bouncing.',

        'Hold each stretch for about 20 to 30 seconds.',

        'Focus on quads, hamstrings, calves, and hips.',

        'Stretch both sides of your body evenly.',

      ],

    },

  ],

};

export default workouts;