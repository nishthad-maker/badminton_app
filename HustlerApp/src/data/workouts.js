const SUPABASE_URL = 'https://iuozlbphhheogfxjtpes.supabase.co';
const VIDEOS = `${SUPABASE_URL}/storage/v1/object/public/excersies-videos`;

const workouts = {

  strength: [

    {

      name: 'Bulgarian Squat',

      subcategory: 'lower',

      logType: 'strength',

      description: 'One leg gets stronger for lunges, jumps, and fast movement on court. Do it on leg day so you can build balance and power one side at a time.',

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

      description: 'Back, glutes, and legs get stronger for better power and stability. Do it on a lower-body day when you want to build strong hips and legs.',

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

      description: 'This mainly strengthens your quadriceps, which help you push off, jump, and absorb force. Do it when you want to build front-thigh strength, usually near the start or middle of your leg workout.',

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

      description: 'Calves are stronger for quick steps, jumping, and staying light on your feet. Do it after leg workouts or on badminton training days to help with court speed.',

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

      description: 'Legs and core get stronger while keeping your body upright. Do it in lower-body workouts to build strength for better movement and balance.',

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

      description: 'Builds explosive leg power for jumping, smashing, and quick bursts on court. Do it early in your leg workout when your legs are fresh.',

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

      description: 'Trains the side-to-side push you use for wide lunges and net returns. Do it on leg day to build the specific strength badminton needs beyond straight-ahead squats.',

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

      description: 'Builds one-leg balance and hamstring strength for reaching wide shots without falling over. Do it on leg day when you want better stability under pressure.',

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

      description: 'Shoulders get stronger for powerful smashes and clears. Do it onupper-body days so your shoulder can handle racket work better.',

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

      logType: 'strength',

      description: 'Makes your chest, shoulders, and arms stronger for hitting and controlling the racket. Do it in upper-body workouts or as a warm-up when you want to build pushing strength.',

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

      description: 'The back of your arms get stronger for faster and more stable racket swings. Do it on the upper-body day after your main lifts to support strong overhead shots.',

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

      description: 'This trains the fast power you use when hitting hard shots. Do it early in a workout or before training when you want to feel explosive.',

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

      description: 'Core stays tight so you can stay strong and balanced on court. Do it in core training or warm-ups to build stability.',

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

      description: 'This helps your body turn fast for smashes, clears, and drives. Do it on core day to build twisting strength for badminton movement.',

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

      description: 'Lower abs get stronger for better control when you move, jump, and recover. Do it in core workouts when you want to build stomach strength.',

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

      description: 'Trains your lower abs to stay switched on while your legs move, which is exactly what happens during lunges and recovery steps. Do it on core day as a controlled, non-weighted finisher.',

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

      description: 'Trains the rotating core strength behind smashes and cross-court drives. Do it on core day to build twisting power alongside straight-ahead ab work.',

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

      description: 'Builds shoulder and core stability under movement, not just a static hold, closer to what your core actually does mid-rally. Do it on core day after your static plank work.',

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

      name: 'Agility Ladder Session',

      subcategory: 'agility',

      logType: 'footwork',

      description: 'This helps your feet move fast and stay light. Do it in warm-upsor footwork practice to get quicker steps on court.',

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

      description: 'You bounce or tap lightly in the center, then as soon as a direction is called or shown, you do a quick split step and explode to that side.',

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

      description: 'Builds the habit of moving out, defending, and returning to baseagain and again.',

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

      description: 'Trains the explosive leg drive behind your jump smash. Do it early in a plyometric session when your legs are fully fresh.',

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

      name: 'Side Lunge Jump',

      subcategory: 'plyometrics',

      logType: 'reps-sets',

      description: 'The explosive version of a lateral lunge, training the quick push-off and landing control you need cutting side to side on court. Do it after Box Jumps while you are still fresh.',

      muscles: ['Quads', 'Glutes', 'Adductors', 'Calves'],

      videoUrl: null,

      imageUrl: null,

      steps: [

        'Start standing with feet together.',

        'Push off one foot and jump sideways.',

        'Land softly on the opposite foot, bending your knee to absorb it.',

        'Immediately push off that foot and jump back the other way.',

        'Keep alternating sides with control.',

      ],

    },

  ],

  endurance: [

    {

      name: 'Interval Running',

      subcategory: 'endurance',

      logType: 'sets-duration',

      description: 'Go hard for a short time, then rest or go easy, and repeat. Do this when you want to train your body to recover fast after tough rallies.',

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

      description: 'Hold the rope, stay on your toes, and bounce lightly as the ropespins. Do this before training or on cardio days to improve stamina and keep your feet light.',

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

      description: 'Run, bike, or row at a pace where you can still talk. Do this onendurance days to build your base stamina and help you last longer in matches.',

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

      description: 'Builds badminton-style stamina because you sprint, stop, and go again like in a real match.',

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

      description: 'After hard training or matches to help reduce muscle soreness and calm tired legs. It can help your body recover faster when you have been jumping, lunging, and hitting a lot.',

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

      description: 'After practice or on rest days to loosen tight muscles and improve blood flow. It helps your legs, back, and shoulders feel less stiff after repeatedbadminton movement.',

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

      description: 'After training to help your body cool down and recover. Reduces stress, slows your heart rate, and helps your muscles relax.',

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

      description: 'After training to release tightness in your shoulders, arms, andback from racket swings and overhead shots. Keeps your upper body loose for the nextsession.',

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

      description: 'After training to release tightness in your legs and hips from lunging, jumping, and fast court movement. Keeps your lower body flexible for the nextsession.',

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