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

      videoUrl: null,

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

      videoUrl: null,

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

      videoUrl: null,

      imageUrl: null,

      steps: [

        'Start in a high plank with arms straight.',

        'Lower one forearm down, then the other, into a forearm plank.',

        'Push back up one arm at a time to a high plank.',

        'Keep your hips still and level the whole time.',

        'Alternate which arm leads each rep.',

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

      videoUrl: null,

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

      videoUrl: null,

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

      videoUrl: null,

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

      videoUrl: null,

      imageUrl: null,

      steps: [

        'Start in a lunge position with one foot forward and one back, both knees bent to about 90 degrees.',

        'Swing your arms and drive up explosively through both legs.',

        'While airborne, switch your legs so the back foot comes forward and the front foot goes back.',

        'Land softly back into a lunge with knees bent to absorb the impact.',

        'Immediately jump again, alternating legs each rep with control.',

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

      name: 'Court Shuttle Runs',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Builds match-style stamina with sprint, stop, and go bursts.',

      muscles: ['Legs', 'Calves', 'Glutes', 'Core'],

      videoUrl: null,

      imageUrl: null,

      steps: [

        'Start at the center of the court in a ready stance.',

        'Sprint to one line or corner.',

        'Touch the line with your hand or foot.',

        'Sprint back to the center right away.',

        'Repeat to different lines or corners.',

        'Rest, then do another round.',

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