-- 2026-11-04 — stop the check-in page asking for a morning weight.
--
-- The old scale was retired 2026-11-03. From then on Drew steps on the Hume and the number reaches
-- workout_bodyweight by itself on the NEXT morning's import, so today's row is always empty when he
-- opens the page: the field showed as outstanding all day, every day, and then filled itself in
-- overnight. His words: "I think I'm done doing weight on the check-in page, but it was still on
-- there so I weighed myself anyways."
--
-- Done as a SETTING rather than by deleting the markup, so bringing it back is one word. checkin.html
-- shows the field only when this reads exactly 'yes'; anything else — including a failed read — hides
-- it, so a dead connection can never resurrect a prompt he has switched off.

insert into public.workout_settings (key, value, note)
values ('checkin_weight_prompt', 'no',
        'Should the check-in page ask Drew for a morning weight? ''no'' since 2026-11-04, the day '
        'after the old scale was retired - the Hume number arrives by itself. Set to ''yes'' to '
        'bring the field back; no code change needed.')
on conflict (key) do update set value = excluded.value, note = excluded.note;
