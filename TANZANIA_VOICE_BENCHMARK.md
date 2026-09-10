# TANZANIA_VOICE_BENCHMARK

The fixed test set for judging any candidate voice engine against the Tanzania
bar (`ENGINEERING_BRIEF.md` §4). A leaderboard number is **not** a pass — every
candidate reads these exact sentences, cloned from the founder's reference
sample, and a native Tanzanian listener scores the audio **blind** (not knowing
which model produced it).

The single question behind every score: *"Would a normal Tanzanian viewer
believe a real Tanzanian creator recorded this?"*

---

## How to run

1. Take one clean ~10–20s reference clip of the founder (or the L1 voice profile
   once it exists).
2. Generate all sentences below with each candidate model, same reference, same
   text, no post-processing (no compression / de-noise / pitch normalisation —
   brief §4).
3. Shuffle the outputs. A Tanzanian listener scores each on the grid below
   without seeing the model name.
4. Record scores in the table in `MODEL_EVALUATION.md`. Note *which specific
   thing* failed when a score is low (pronunciation? pacing? accent drift?).

---

Machine-readable copy for the tooling: `worker/colab/benchmark_sentences.json`
(keep the two in sync).

## Test sentences

### A. Normal / conversational
1. Habari za leo? Mimi niko poa tu, nashukuru Mungu.
2. Leo tutaangalia jinsi ya kutumia hii app kwa haraka na bila usumbufu.
3. Karibu tena kwenye channel yangu, nafurahi umerudi.

### B. Excited
4. Jamani, hii habari ni kubwa sana — lazima muione video hii mpaka mwisho!
5. Nimefurahi kweli kuwaonyesha kitu kilichobadilisha biashara yangu kabisa!
6. Hii ndio siku tuliyokuwa tunaisubiri, na sasa imefika!

### C. Professional / announcement
7. Katika taarifa ya leo, tutajadili matokeo ya robo mwaka na mpango wa mbele.
8. Tunawashukuru wateja wetu wote kwa kutuamini kwa mwaka mzima huu.
9. Timu yetu imefanya kazi kwa bidii kuhakikisha huduma inaboreka.

### D. Mixed Swahili / English (code-switching)
10. Ukishafungua dashboard, bonyeza kitufe cha login halafu weka password yako.
11. Content yako lazima iwe na thumbnail nzuri ili watu waweze ku-click.
12. Nili-post reel moja TikTok jana, ika-hit views elfu hamsini ndani ya masaa manne.
13. Tumia hashtag sahihi, halafu uangalie analytics baada ya siku mbili.

### E. Storytelling
14. Siku moja, nikiwa bado nauza nyanya sokoni, sikujua kama maisha yangu yangebadilika.
15. Nakumbuka usiku ule, mvua ikinyesha, nikiandika mpango wangu wa kwanza wa biashara.
16. Nilianza na mtaji wa shilingi elfu kumi tu, na watu wengi walinicheka.

### F. Sales / call to action
17. Usikose nafasi hii — bonyeza link iliyoko chini na ujiunge leo kabla haijaisha.
18. Bei ya kawaida ni laki mbili, lakini leo tu utapata kwa laki moja na nusu.
19. Wateja wa kwanza hamsini watapata bonus ya ziada, kwa hiyo usichelewe.

### G. Educational
20. Riba rahisi hukokotolewa kwa kuzidisha kiasi cha msingi, kiwango cha riba, na muda.
21. Kuna aina tatu za bajeti: ya kila siku, ya kila mwezi, na ya mwaka mzima.
22. Akiba ni pesa unayoweka pembeni kabla hujaanza kutumia mapato yako.

### H. Pronunciation stress test (Swahili-specific sounds)
23. Ng'ombe wangu wamekwenda kunywa maji mtoni asubuhi na mapema.
24. Mzee Mng'ong'o alinunua ng'ombe wawili na mbuzi wenye nguvu.
25. Nyanya, mchicha, na mboga za majani ni muhimu kwa afya ya mwili.
26. Ndugu zangu, mnaokaa mbali, karibuni nyumbani kwa sherehe.
27. Mwalimu alimwambia mwanafunzi aandike insha kuhusu mvua na ukame.

---

## Scoring grid (per candidate model)

Score 1–10 unless noted. Average is informational; a hard fail on the italic
rows is disqualifying regardless of the average.

| # | Criterion | Score | Notes |
|---|---|---|---|
| 1 | *Tanzanian pronunciation of Swahili words* (H especially) | | |
| 2 | *Tanzanian accent — no drift to Kenyan / generic African / American / British* | | |
| 3 | Naturalness / low "robotic" quality | | |
| 4 | Rhythm and pacing (not rushed, not sing-song) | | |
| 5 | Pauses — natural, in the right places (D, E, G) | | |
| 6 | Emphasis / stress on the right words (B, F) | | |
| 7 | Breathing — present but not exaggerated | | |
| 8 | *Swahili↔English code-switching sounds natural* (D) | | |
| 9 | Emotion range across categories A–G | | |
| 10 | Overall realism — believable as a real recording | | |
| — | Inference speed (sec per sentence, note GPU) | | |
| — | VRAM required | | |
| — | Licence (must permit private commercial use) | | |
| — | Offline / local compatibility | yes / no | |

**Verdict:** PASS / FAIL against §4 · which component to fix if FAIL: ______
