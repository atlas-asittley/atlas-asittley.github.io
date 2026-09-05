-- Seed: the plan as of 2026-09-05, migrated from ~/workouts/TRAINING-PLAN.md
-- Sort spaces: daily 1..99 · upper 100..199 · lower 200..299

INSERT INTO workout_program (exercise, block, sort, sets, target_reps, working_weight, next_target, cue, bodyweight, rest_seconds, rationale) VALUES
-- ---------- DAILY BLOCK ----------
('Cat-cow','daily',1,1,'8-10 slow',NULL,NULL,'Easy spinal warm-up.',true,NULL,'Mobility/reset.'),
('Prone press-up','daily',2,1,'10 slow',NULL,NULL,'Hips stay down, let the low back sag. STOP if you get leg symptoms.',true,NULL,'Safe anti-flexion movement. NOT a proven reliever (tested 8/31). Kept because it is safe, not because it works.'),
('90/90 hip switches','daily-essential',3,1,'8-10/side',NULL,NULL,'Chest tall. Rotation control, staying out of the pinch.',true,NULL,'Hip IR/ER control. The item that historically drifted off the block.'),
('Spider-Man lunge + thoracic rotation','daily',4,1,'5-6/side',NULL,NULL,'Follow your hand with your eyes to get the mid-back rotation.',true,NULL,'T-spine + hip opener.'),
('Half-kneeling hip flexor stretch','daily-essential',5,1,'60 sec/side',NULL,NULL,'Your #1 reliever. Tuck the tailbone, squeeze the rear glute, THEN reach overhead for the side-stretch.',true,NULL,'His most reliable reliever (ledger).'),
('Relax-the-guard breathing','daily-essential',6,1,'8 breaths',NULL,NULL,'4 sec in, 6 sec out. Soften the abs on every exhale.',true,NULL,'Foundation of the exposure work — down-regulates guarding.'),
('Bird-dog','daily',7,1,'8-10/side',NULL,NULL,'Neutral spine, no twisting. Slow.',true,NULL,'McGill Big-3.'),
('McGill curl-up','daily',8,1,'6-8 (8-10s holds)',NULL,NULL,'Hands under the low back. Do NOT flatten or round it.',true,NULL,'McGill Big-3.'),
('Side plank','daily',9,1,'20-40 sec/side',NULL,NULL,'Stack the hips. Anti-QL.',true,NULL,'McGill Big-3.'),
('Standing knee raise','daily-essential',10,1,'10/side',NULL,NULL,'Hip flexor. Slow, no swinging, stand tall. Tested weak on the LEFT (9/3).',true,NULL,'Anterior/medial hypothesis (9/3 assessment).'),
('Adductor squeeze (isometric)','daily-essential',11,1,'5 x 5 sec',NULL,NULL,'Ball or pillow between the knees. Squeeze 5 sec. GENTLE while the groin settles.',true,NULL,'Anterior/medial hypothesis (9/3 assessment).'),
('Single-leg balance (LEFT)','daily',12,1,'20-30 sec',NULL,NULL,'Hips level, no leaning.',true,NULL,'Static control on the weaker side.'),
('Hip airplanes (supported)','daily-essential',13,1,'10/side',NULL,NULL,'LEFT stance leg FIRST. Track how many reps until the left reaches full range.',true,NULL,'Single-leg control — holds under either hip theory. Drew prefers 10.'),
('Sit-back negatives','daily',14,1,'5 slow',NULL,NULL,'Sit tall, lower down over 3-5 sec, arms assist. Exhale, let the spine round, stay relaxed.',true,NULL,'Graded exposure: the lying→upright transition. REST DAYS ONLY — the 8/28 flare came from stacking exposure on a lift day.'),
('Supine floor get-up','daily',15,1,'5',NULL,NULL,'Flat on your back to standing, then slowly back down. Reduce the hand assist over the weeks.',true,NULL,'Graded exposure. REST DAYS ONLY (dosing lesson 8/28).'),

-- ---------- UPPER (Park West) ----------
('Bench warm-up ramp','upper',100,3,'10 / 5 / 3',NULL,NULL,'30 x10 (rest 45s) → 55 x5 (rest 60s) → 70 x3 (rest 2-3 min) → then work sets. Every rep fast and easy; if the 70s grind, use 65.',false,60,'Post-activation potentiation; near-weight triple primes recruitment. Added 9/4 at Drew''s request.'),
('DB bench press','upper',101,3,'6-10',80,'9,8,7 @80 (9/4) → build to 10 across, then 85','Shoulder blades set, exhale up. Never breath-hold.',false,120,NULL),
('One-arm DB row','upper',102,3,'8-12/side',80,'11,11,10 @80 (9/4) → 12 across, then 85','Elbow to hip, big lat stretch at the bottom.',false,90,'Lats — V-taper priority.'),
('DB lateral raise','upper',103,3,'12-20',15,'16,12,10 (9/4) → build set 3, then 20','Strict, lead with the elbow.',false,60,'Side delts — V-taper priority.'),
('Pull-ups','upper',104,3,'AMRAP',NULL,'8,6,7 (9/4) → weighted once ~10 across','Full stretch at the bottom.',true,120,'Lats.'),
('DB shoulder press','upper',105,3,'8-12',50,'11,9,7 (9/4) → 12 across → 55','Use the 90° upright bench. Exhale on the press. Light-headedness watch.',false,90,NULL),
('Face pulls','upper',106,3,'12-20',50,'BUMPED 44→50 after 20,19,17 (9/4). Rebuild to 15+ across','Staggered stance, pull to the face, elbows high.',false,60,'Rear delts / traps — priority.'),
('DB shrugs','upper',107,3,'10-15',110,'15,15,12 (9/4) → 15 across → 115','Pause and squeeze at the top. Straps.',false,60,'Traps — priority. Neck cleared.'),
('Straight-arm cable pulldown','upper',108,3,'12-15',57.5,'15,15,13 (9/4) → 15 across → bump','Split stance, hinge at the hips, feel the LAT not the core.',false,60,'Lats.'),
('DB curls','upper',109,2,'10-15',35,'14,10 (9/4) → 15 across → 40','Trim-first tail — drop this if short on time.',false,60,NULL),
('Rope triceps pushdown','upper',110,2,'12-15',42.5,'13,11 (9/4) → 15 across','Trim-first tail.',false,60,NULL),

-- ---------- LOWER (Park West) ----------
('Trap-bar deadlift','lower',201,3,'8-10',205,'BUMPED 195→205 after 10x3 (8/27). Build to 10 across','HINGE, not squat — hips BACK, neutral spine, BRACE. Exhale up. Light-headedness watch.',false,180,'Main hinge.'),
('Leg press','lower',202,4,'8-12',290,'BUMPED 270→290 after 12x4 (8/27)','Stay ABOVE the hip pinch. Do not chase depth. Groin watch.',false,150,'Depth-capped squat substitute (long femurs + hip pinch).'),
('Hip thrust','lower',203,3,'10-12',175,'BUMPED 165→175 after 12x3 (8/27)','Tailbone TUCK at the top, no low-back arch.',false,120,'Glute max.'),
('Step-down (LEFT)','lower',204,3,'8-10',NULL,'Bodyweight until control is clean, then a light DB','Stand on the LEFT leg, lower slowly, tap the other heel down. HIPS LEVEL.',true,60,'Left-hip single-leg control. In the plan since 8/27 and never queued until the program table existed.'),
('Seated leg curl','lower',205,3,'10-15',150,'15,14,12 (8/27) → 15 across','Use a REAL plate — the +10 dial is broken.',false,60,'Hamstrings.'),
('Leg extension','lower',206,3,'12-15',195,'BUMPED 185→195 after 15x3 (8/27)','Spine neutral.',false,60,'Quads — legs are the weak point.'),
('Hip abduction machine','lower',207,3,'12-15',240,'HOLD 240 — no longer chasing this one','General leg work. Abduction tested SYMMETRIC on 9/3, so this is not the fix any more.',false,60,'De-emphasized 9/3. Kept as general work only.'),
('Reverse lunge (LEFT)','lower',208,3,'10-12/leg',30,'12 across → 35','Stand on the LEFT leg. Groin watch — cut it if the groin talks.',false,90,'Left-side stability under load.'),
('Suitcase carry','lower',209,3,'40 steps/side',110,'40x3 @110 (8/27) → 120','Load the RIGHT hand so the LEFT side stabilizes, then alternate.',false,60,'Anti-lateral-flexion; left-hip stabilizer.'),
('Calf raise machine','lower',210,3,'15-20',200,'20 across → bump','Full stretch at the bottom.',false,60,NULL),
('DB pullover','lower',211,3,'10-15',45,'maxed → bump','Big lat stretch.',false,60,'Lat bonus on leg day — bumps pull frequency for the V.');

-- Retired rows (audit trail — these are what the queue must NOT contain)
INSERT INTO workout_program (exercise, block, sort, sets, target_reps, cue, bodyweight, active, retired_on, retire_reason) VALUES
('Side-lying hip abduction (LEFT)','daily',90,1,'12-15/side','(retired)',true,false,'2026-09-05','9/3 assessment: abduction SYMMETRIC L/R. Its rationale ("glute-med responds to frequency") is refuted.'),
('Glute-med activation (banded)','lower',290,1,'15/side','(retired)',true,false,'2026-09-05','Same — glute-med theory downgraded 9/3.');

-- ---------- SETTINGS ----------
INSERT INTO workout_settings (key, value, note) VALUES
('cal_target','3050','Trimmed from 3400 on 2026-09-05: +1.6 lb/wk and waist +1.5" in 6 wks. Judge by scale rate, not the food log.'),
('protein_target','180','Unchanged. Never trim protein.'),
('rate_target_lb_wk','0.5-0.7','Weekly-average scale rate that says the surplus is right.'),
('waist_cut_trigger_in','39','Cut starts at whichever comes first: this, Nov 15 2026, or abs fading relaxed.'),
('bulk_end_date','2026-11-15','Date cap on the bulk.'),
('phase','lean bulk','Current phase.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note;
