# TANZANIA_LIPSYNC_BENCHMARK

Phase 5 acceptance test. A lip-sync model that scores well on English can still
fail on Swahili (`ENGINEERING_BRIEF.md` §4) — Swahili's vowel-heavy syllables,
prenasalised consonants (`mb`, `nd`, `ng'`, `nj`), and the `ny` / `ng'` sounds
stress mouth shapes differently. Every candidate is judged on **Swahili
phonemes specifically**, with the founder's own face.

The one question: *"Would a normal Tanzanian viewer believe he actually said
this on camera?"*

---

## How to run

1. Use a real founder face source (a still + a short neutral driving clip, or
   frames from the ingestion dataset).
2. Feed each candidate the same audio — use the **best Phase 3 voice output** so
   the test reflects the real pipeline, not a stand-in.
3. Generate the clips below. A Tanzanian viewer scores each **blind**.
4. Record scores in `MODEL_EVALUATION.md` (Phase 5 table). Note the *specific*
   failure (which sound? closed mouth on open vowel? lag? jitter?).

---

## Phoneme-targeted test lines

Each line loads a specific mouth-shape challenge. Keep them short so the failure
is easy to localise.

### A. Open vowels a / e / i / o / u (jaw + lip rounding)
1. Aaa, eee, iii, ooo, uuu — mama anaenda sokoni.
2. Baba amekaa kitako, anakula wali na maharage.
3. Kuku wakubwa wanakula pumba uwanjani.

### B. Prenasalised consonants mb / nd / ng / nj (lips close then burst)
4. Mbwa mkubwa amelala mbele ya mlango.
5. Ndege wanaruka juu ya mnazi, wanaimba.
6. Njia ndefu inaenda ndani ya msitu mnene.
7. Ng'ombe na mbuzi wamesimama pamoja gizani.

### C. ny / ng' (nasal, tongue/soft-palate — often under-animated)
8. Nyanya na nyama zimewekwa kwenye nyungu.
9. Ng'ombe wa Mng'ong'o wananya majani.
10. Nyumba yenye paa nyekundu iko kwenye kilima.

### D. Bilabial p / b / m clusters (clear full lip closure)
11. Papa mkubwa amepita pembeni mwa mto.
12. Mama ampishe mtoto papai na parachichi.
13. Bomba la maji limepasuka pale barabarani.

### E. Fricatives f / v / s / sh / th (teeth-lip, sibilants)
14. Fisi anavizia fahali shambani usiku.
15. Samaki safi wanauzwa sokoni asubuhi.
16. Shangazi anashona shuka nyeupe sebuleni.

### F. Fast connected speech (co-articulation, no over-chewing)
17. Kwa hiyo tukienda leo tutafika mapema kabla ya mvua.
18. Nilimwambia asubiri lakini alikwenda zake haraka sana.

### G. Code-switch — English words mid-Swahili (mouth must switch cleanly)
19. Fungua dashboard, weka password, halafu bonyeza login.
20. Ni-post content mpya kwenye TikTok halafu angalia analytics.

### H. Sustained + emphatic (held shapes, stress)
21. HAPANA! Sitakubali jambo hili hata kidogo.
22. Ndiyo… ndiyo… sasa nimeelewa vizuri kabisa.

---

## Scoring grid (per candidate)

Score 1–10. Italic rows are disqualifying if failed.

| # | Criterion | Score | Notes |
|---|---|---|---|
| 1 | *Sync accuracy on Swahili (mouth matches sound, no lag)* | | |
| 2 | *Open vowels (A) — jaw actually opens, not a slit* | | |
| 3 | Prenasalised (B) — lips close fully before `mb`/`nd`/`ng` | | |
| 4 | `ny` / `ng'` (C) — animated, not skipped | | |
| 5 | Bilabials (D) — full closure on `p`/`b`/`m`, no gap | | |
| 6 | Fricatives / sibilants (E) — teeth-lip contact reads | | |
| 7 | Fast speech (F) — no smearing, no robotic over-chew | | |
| 8 | Code-switch (G) — clean shape change EN↔SW | | |
| 9 | *Identity held — no face warp / drift / beautification* | | |
| 10 | Idle realism — blinks, micro head motion, breathing | | |
| 11 | Teeth / tongue artefacts (none = 10) | | |
| — | Seconds to render per second of video (note GPU) | | |
| — | VRAM | | |
| — | Licence OK for private commercial use | | |
| — | Offline / local capable | yes / no | |

**Verdict:** PASS / FAIL vs §4 · component to fix if FAIL: ______

---

## Candidates

See `MODEL_EVALUATION.md` Phase 5 section. Order of testing: Wav2Lip / Wav2Lip-HD
(baseline, cheap, English-tuned — expect Swahili weakness) → LatentSync / MuseTalk
(diffusion, better mouth detail) → LivePortrait-driven or a full audio-to-video
model if those miss §4.
