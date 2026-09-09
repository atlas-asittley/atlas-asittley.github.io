-- HOME fallbacks (pull-up bar + bodyweight). Sort spaces: home-upper 300s, home-lower 400s.
INSERT INTO workout_program (exercise, block, sort, sets, target_reps, working_weight, next_target, cue, bodyweight, rest_seconds, rationale) VALUES
('Pull-ups (home)','home-upper',301,4,'AMRAP',NULL,'match gym pull-up numbers (8,6,7)','Full hang at the bottom. Four sets instead of three — this is the whole back today.',true,120,'Lats — the one thing the bar gives us.'),
('Push-ups','home-upper',302,4,'AMRAP',NULL,'when 25+ across → feet elevated','Hands slightly wider than shoulders, body straight, chest to the floor. Elevate feet on a chair once easy.',true,90,'Bench substitute.'),
('Chin-ups (home)','home-upper',303,3,'AMRAP',NULL,NULL,'Palms toward you. Biceps + lats.',true,120,'Curls + extra lat volume.'),
('Pike push-ups','home-upper',304,3,'8-15',NULL,'feet on a chair once 15 is easy','Hips high, head toward the floor between your hands. Exhale on the press. Light-headedness watch.',true,90,'Shoulder-press substitute.'),
('Prone Y-T raises','home-upper',305,3,'12-15',NULL,NULL,'Face down on the floor, arms in a Y then a T, thumbs up, squeeze the shoulder blades. Light — this is the face-pull stand-in.',true,60,'Rear delts / traps. Weak substitute for face pulls; better than nothing.'),
('Chair dips','home-upper',306,3,'10-15',NULL,NULL,'Hands on a sturdy chair behind you. Shoulders down, do not let them shrug up.',true,60,'Triceps.'),
('Hanging knee raises','home-upper',307,3,'8-12',NULL,'straight-leg raises once the groin window closes (~9/21)','Hang from the bar, drive the KNEES up slowly, no swinging. Loaded hip flexion — the anterior-deficit exercise. Knees only for now.',true,90,'Hip-flexor strength under load; anti-extension core.'),

('Goblet-style tempo squat (bodyweight)','home-lower',401,3,'10-15',NULL,'add a loaded backpack once 15 is easy','Arms out front, 3-sec down, toes out, stay ABOVE the hip pinch. Depth capped like the leg press.',true,90,'Quad substitute.'),
('Reverse lunge (LEFT) — home','home-lower',402,3,'10-12/leg',NULL,'backpack once 12 is easy','Stand on the LEFT leg. Same as the gym version, no dumbbells.',true,90,'The exercise that "scratched the itch." Left-side stability.'),
('Step-down (LEFT) — home','home-lower',403,3,'5-8',NULL,'build to 8 before any load','Bottom stair or a sturdy step. Slow eccentric, hips LEVEL.',true,60,'The control-deficit exercise; tracked rep count.'),
('Single-leg RDL (LEFT)','home-lower',404,3,'8-10/leg',NULL,NULL,'Hinge on the LEFT leg, back flat, reach toward the floor. Hold a wall lightly if needed.',true,60,'Hamstring + left-hip control.'),
('Single-leg glute bridge','home-lower',405,3,'10-15/leg',NULL,NULL,'One foot down, drive the hips up, tailbone tucked, no low-back arch.',true,60,'Hip-thrust substitute.'),
('Calf raises on a step','home-lower',406,3,'15-20',NULL,'single-leg once 20 is easy','Full stretch at the bottom, pause at the top.',true,45,NULL),
('Hanging knee raises (lower)','home-lower',407,3,'8-12',NULL,'straight-leg once the groin window closes','Same as the upper version — loaded hip flexion on the bar. Knees only for now.',true,90,'Anterior hip work on leg day.');
