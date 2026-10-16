// Βιβλιοθήκη ασκήσεων για το Workout (ενότητα Fitness).
// Κάθε άσκηση: id (σταθερό, ΜΗΝ το αλλάζεις: το χρησιμοποιεί το ιστορικό),
// όνομα, μυϊκή ομάδα και εξοπλισμός. Δικές σου ασκήσεις προστίθενται από το app.

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core'];

export const EXERCISES = [
  // Chest
  { id: 'bench-bb', name: 'Bench Press', equipment: 'Barbell', muscle: 'Chest' },
  { id: 'incline-bench-bb', name: 'Incline Bench Press', equipment: 'Barbell', muscle: 'Chest' },
  { id: 'bench-db', name: 'Bench Press', equipment: 'Dumbbell', muscle: 'Chest' },
  { id: 'incline-bench-db', name: 'Incline Bench Press', equipment: 'Dumbbell', muscle: 'Chest' },
  { id: 'chest-fly-db', name: 'Chest Fly', equipment: 'Dumbbell', muscle: 'Chest' },
  { id: 'cable-fly', name: 'Cable Fly Crossover', equipment: 'Cable', muscle: 'Chest' },
  { id: 'chest-press-machine', name: 'Chest Press', equipment: 'Machine', muscle: 'Chest' },
  { id: 'chest-dip', name: 'Chest Dip', equipment: 'Bodyweight', muscle: 'Chest' },
  { id: 'push-up', name: 'Push Up', equipment: 'Bodyweight', muscle: 'Chest' },

  // Back
  { id: 'deadlift-bb', name: 'Deadlift', equipment: 'Barbell', muscle: 'Back' },
  { id: 'row-bb', name: 'Bent Over Row', equipment: 'Barbell', muscle: 'Back' },
  { id: 'row-db', name: 'Single Arm Row', equipment: 'Dumbbell', muscle: 'Back' },
  { id: 't-bar-row', name: 'T-Bar Row', equipment: 'Machine', muscle: 'Back' },
  { id: 'seated-row-cable', name: 'Seated Row', equipment: 'Cable', muscle: 'Back' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', equipment: 'Cable', muscle: 'Back' },
  { id: 'pull-up', name: 'Pull Up', equipment: 'Bodyweight', muscle: 'Back' },
  { id: 'chin-up', name: 'Chin Up', equipment: 'Bodyweight', muscle: 'Back' },
  { id: 'face-pull', name: 'Face Pull', equipment: 'Cable', muscle: 'Back' },

  // Shoulders
  { id: 'ohp-bb', name: 'Overhead Press', equipment: 'Barbell', muscle: 'Shoulders' },
  { id: 'shoulder-press-db', name: 'Shoulder Press', equipment: 'Dumbbell', muscle: 'Shoulders' },
  { id: 'arnold-press', name: 'Arnold Press', equipment: 'Dumbbell', muscle: 'Shoulders' },
  { id: 'lateral-raise-db', name: 'Lateral Raise', equipment: 'Dumbbell', muscle: 'Shoulders' },
  { id: 'lateral-raise-cable', name: 'Lateral Raise', equipment: 'Cable', muscle: 'Shoulders' },
  { id: 'front-raise-db', name: 'Front Raise', equipment: 'Dumbbell', muscle: 'Shoulders' },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', equipment: 'Dumbbell', muscle: 'Shoulders' },
  { id: 'shrug-db', name: 'Shrug', equipment: 'Dumbbell', muscle: 'Shoulders' },

  // Biceps
  { id: 'curl-bb', name: 'Bicep Curl', equipment: 'Barbell', muscle: 'Biceps' },
  { id: 'curl-db', name: 'Bicep Curl', equipment: 'Dumbbell', muscle: 'Biceps' },
  { id: 'hammer-curl', name: 'Hammer Curl', equipment: 'Dumbbell', muscle: 'Biceps' },
  { id: 'preacher-curl', name: 'Preacher Curl', equipment: 'Machine', muscle: 'Biceps' },
  { id: 'cable-curl', name: 'Bicep Curl', equipment: 'Cable', muscle: 'Biceps' },

  // Triceps
  { id: 'pushdown', name: 'Triceps Pushdown', equipment: 'Cable', muscle: 'Triceps' },
  { id: 'skullcrusher', name: 'Skullcrusher', equipment: 'Barbell', muscle: 'Triceps' },
  { id: 'overhead-ext', name: 'Overhead Triceps Extension', equipment: 'Cable', muscle: 'Triceps' },
  { id: 'close-grip-bench', name: 'Close Grip Bench Press', equipment: 'Barbell', muscle: 'Triceps' },
  { id: 'triceps-dip', name: 'Triceps Dip', equipment: 'Bodyweight', muscle: 'Triceps' },

  // Legs
  { id: 'squat-bb', name: 'Squat', equipment: 'Barbell', muscle: 'Legs' },
  { id: 'front-squat', name: 'Front Squat', equipment: 'Barbell', muscle: 'Legs' },
  { id: 'goblet-squat', name: 'Goblet Squat', equipment: 'Dumbbell', muscle: 'Legs' },
  { id: 'leg-press', name: 'Leg Press', equipment: 'Machine', muscle: 'Legs' },
  { id: 'hack-squat', name: 'Hack Squat', equipment: 'Machine', muscle: 'Legs' },
  { id: 'split-squat', name: 'Bulgarian Split Squat', equipment: 'Dumbbell', muscle: 'Legs' },
  { id: 'lunge-db', name: 'Lunge', equipment: 'Dumbbell', muscle: 'Legs' },
  { id: 'leg-extension', name: 'Leg Extension', equipment: 'Machine', muscle: 'Legs' },
  { id: 'leg-curl-lying', name: 'Lying Leg Curl', equipment: 'Machine', muscle: 'Legs' },
  { id: 'leg-curl-seated', name: 'Seated Leg Curl', equipment: 'Machine', muscle: 'Legs' },
  { id: 'calf-raise', name: 'Standing Calf Raise', equipment: 'Machine', muscle: 'Legs' },
  { id: 'calf-raise-seated', name: 'Seated Calf Raise', equipment: 'Machine', muscle: 'Legs' },

  // Glutes
  { id: 'rdl-bb', name: 'Romanian Deadlift', equipment: 'Barbell', muscle: 'Glutes' },
  { id: 'hip-thrust', name: 'Hip Thrust', equipment: 'Barbell', muscle: 'Glutes' },
  { id: 'glute-kickback', name: 'Glute Kickback', equipment: 'Cable', muscle: 'Glutes' },
  { id: 'hip-abduction', name: 'Hip Abduction', equipment: 'Machine', muscle: 'Glutes' },

  // Core
  { id: 'crunch', name: 'Crunch', equipment: 'Bodyweight', muscle: 'Core' },
  { id: 'cable-crunch', name: 'Cable Crunch', equipment: 'Cable', muscle: 'Core' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', equipment: 'Bodyweight', muscle: 'Core' },
  { id: 'russian-twist', name: 'Russian Twist', equipment: 'Bodyweight', muscle: 'Core' },
  { id: 'ab-wheel', name: 'Ab Wheel Rollout', equipment: 'Bodyweight', muscle: 'Core' },
];
