/**
 * Marker-level copy for the public guides (/guides/<marker>) and, later, for
 * in-app marker notes. Plain words, written the way an experienced TRT user
 * explains a result to a friend. Not medical advice; the pages say so.
 *
 * Zero imports on purpose: scripts/build-guides.mjs loads this file in Node.
 */

export type MarkerCopy = {
  /** What the marker is, in two sentences. */
  what: string
  /** The TRT-aware read of the range versus the lab's range. */
  range: string
  /** Why it moves on a protocol. */
  whyMoves: string[]
  /** What people usually do about it. Common practice, not a recommendation. */
  practices: string[]
  faq: Array<{ q: string; a: string }>
}

export const MARKER_COPY: Record<string, MarkerCopy> = {
  total_testosterone: {
    what: 'Total testosterone is everything in the blood, bound and free. On TRT it is the number the dose is set by, and the one that swings most with when you draw the blood.',
    range: 'Labs quote a range for men who make their own, roughly 300 to 1000 ng/dL (10 to 35 nmol/L). On TRT people aim for the mid to upper part of that at trough, the morning of the next injection. A peak draw two days after a shot can sit above the lab range and mean nothing.',
    whyMoves: ['Dose and ester: more milligrams and shorter esters push peaks higher.', 'Draw timing: trough and peak can differ by half.', 'Injection frequency: once a week swings more than twice.', 'SHBG: high SHBG holds more of the total as bound.'],
    practices: ['Draw at trough every time so tests compare like for like.', 'Judge symptoms and free testosterone, not the total alone.', 'Split the weekly dose in two or three if the peaks feel rough.'],
    faq: [
      { q: 'Is a total testosterone above the lab range dangerous on TRT?', a: 'Not by itself. A peak draw can read above range on a normal dose. What matters is hematocrit, estradiol, blood pressure and how you feel, all read together.' },
      { q: 'What total testosterone do people aim for on TRT?', a: 'Most aim for the mid to upper part of the reference range at trough, around 600 to 1000 ng/dL (20 to 35 nmol/L), and adjust from symptoms.' },
    ],
  },
  free_testosterone: {
    what: 'Free testosterone is the small fraction, about two percent, not bound to SHBG or albumin. It is the part that acts on tissue, so it tracks how you feel better than the total does.',
    range: 'Lab ranges vary by method. Above the lab range is expected on TRT and is not a flag on its own. Low free testosterone with a normal total points at high SHBG.',
    whyMoves: ['SHBG up or down changes the free share without the total changing.', 'Dose and draw timing, same as total testosterone.', 'Assay: calculated free testosterone and direct assays disagree; compare within one lab.'],
    practices: ['Use the same lab and the same draw timing so the trend means something.', 'If free is low and SHBG is high, people look at SHBG rather than pushing the dose.'],
    faq: [
      { q: 'Why is my free testosterone high when my total is normal?', a: 'Low SHBG. Less binding protein means a bigger free share of the same total. It is common with higher body fat and on some protocols.' },
      { q: 'Should I chase a free testosterone number?', a: 'People use it to explain symptoms, not as a target. A high free testosterone with side effects is a reason to lower the dose, not celebrate.' },
    ],
  },
  estradiol: {
    what: 'Estradiol (E2) is the estrogen men make from testosterone through aromatase. On TRT it rises with the dose, and it is what keeps bones, joints, libido and HDL healthy.',
    range: 'The lab range is for men making their own testosterone. On TRT people read the ratio of testosterone to estradiol, aiming for about 15 to 30 (testosterone in ng/dL divided by E2 in pg/mL), and the sensitive LC-MS/MS assay, not the standard one.',
    whyMoves: ['Bigger, less frequent injections aromatize more at the peak.', 'Body fat carries aromatase, so leaner men run lower E2 on the same dose.', 'Aromatase inhibitors push it down fast, often too far.', 'Alcohol in the days before the draw raises it.'],
    practices: ['Treat the symptoms, not the number: water retention, sore nipples and moodiness are the high signs; joint ache, flat mood and low libido the low signs.', 'Split the weekly dose before reaching for an AI.', 'DIM and calcium-D-glucarate are the soft options people try; an AI at a low dose is the hard one, and crashed E2 feels worse than high E2.'],
    faq: [
      { q: 'What is a good estradiol on TRT?', a: 'Roughly 20 to 40 pg/mL (75 to 150 pmol/L) with a testosterone to estradiol ratio near 15 to 30, and no symptoms. The ratio matters more than the number.' },
      { q: 'Do I need an aromatase inhibitor on TRT?', a: 'Most people on a split dose do not. An AI is for clear high-estradiol symptoms that a dose change did not fix, and it is easy to overdo.' },
    ],
  },
  shbg: {
    what: 'Sex hormone binding globulin is the protein that carries testosterone in the blood. High SHBG means less free hormone from the same total; low SHBG means more.',
    range: 'Lab ranges are wide, roughly 18 to 55 nmol/L. On TRT people call 20 to 50 comfortable. Above that, free testosterone runs low for the total; below it, estradiol swings hit harder.',
    whyMoves: ['Low carbohydrate intake, low insulin and thyroid running high push SHBG up.', 'Insulin resistance, higher body fat, oral steroids and higher doses push it down.', 'Age raises it slowly.'],
    practices: ['For high SHBG, people inject more often, eat more carbohydrate and some use boron at 10 mg a day.', 'For low SHBG, people work on insulin sensitivity and keep the dose modest, since the free fraction is already high.'],
    faq: [
      { q: 'Does testosterone lower SHBG?', a: 'Yes, modestly, and oral steroids lower it a lot. That is one reason free testosterone climbs faster than total on a protocol.' },
      { q: 'Is high SHBG bad?', a: 'Not bad, but it means the total testosterone overstates what is available. People with high SHBG feel better at the upper end of the total range.' },
    ],
  },
  prolactin: {
    what: 'Prolactin is a pituitary hormone. In men it should stay low; when it climbs it blunts libido, erections and mood.',
    range: 'Labs quote roughly 4 to 15 ng/mL (85 to 320 mIU/L). Mildly above that is common after stress, poor sleep or sex before the draw; clearly above deserves a repeat and a doctor.',
    whyMoves: ['19-nor compounds (nandrolone, trenbolone) push it up.', 'Stress, poor sleep, and an orgasm in the hours before the draw.', 'Some medications, and rarely a pituitary adenoma.'],
    practices: ['Retest fasted, rested, no sex the night before.', 'On 19-nors people use P5P (vitamin B6) as the soft fix and cabergoline through a doctor as the hard one.', 'A persistent rise off any compound goes to a doctor for imaging.'],
    faq: [
      { q: 'Why is my prolactin high on nandrolone?', a: '19-nor compounds act on the same receptors that keep prolactin in check. It usually settles when the compound stops.' },
      { q: 'Does TRT raise prolactin?', a: 'Testosterone alone does not, or barely. A rise on plain TRT usually has another cause.' },
    ],
  },
  lh: {
    what: 'Luteinizing hormone is the brain telling the testes to make testosterone. On TRT it drops to near zero because the brain sees plenty of androgen and stops asking.',
    range: 'Lab range roughly 1.7 to 8.6 IU/L. On TRT it reads under 1, which is expected, not a problem. Very high LH with low testosterone means the testes are not answering the signal.',
    whyMoves: ['Any exogenous testosterone or anabolic steroid suppresses it within weeks.', 'HCG does not raise LH; it stands in for it.', 'Recovery after a cycle brings it back over weeks to months.'],
    practices: ['Nothing to fix while on TRT; suppression is how the axis works.', 'People who care about fertility or testicle size add HCG at 250 to 500 IU two or three times a week.', 'Coming off, a PCT with HCG then clomiphene or tamoxifen is the common route, with a doctor.'],
    faq: [
      { q: 'Is LH near zero on TRT bad?', a: 'No. It is expected and reverses when testosterone stops, usually. HCG keeps the testes working in the meantime if that matters to you.' },
      { q: 'Can LH tell if I am recovered after a cycle?', a: 'Yes. LH and FSH back in range with a normal testosterone means the axis is running again.' },
    ],
  },
  fsh: {
    what: 'Follicle stimulating hormone drives sperm production. Like LH it falls to near zero on testosterone, which is why fertility drops on TRT.',
    range: 'Lab range roughly 1.5 to 12 IU/L. Near zero on TRT is expected. High FSH with a normal testosterone points at the sperm-making cells, not the hormone side.',
    whyMoves: ['Suppressed by any exogenous androgen.', 'HCG keeps intratesticular testosterone up but does not replace FSH; some add it separately for fertility.'],
    practices: ['If children are on the horizon, people plan HCG from the start and talk to a fertility clinic before, not after.', 'A sperm analysis tells more than FSH does.'],
    faq: [
      { q: 'Will FSH recover after TRT?', a: 'Usually, over months. The longer the suppression the slower the return, and some men need help from a clinic.' },
      { q: 'Does HCG bring FSH back?', a: 'No. It mimics LH. FSH stays low; fertility protocols sometimes add FSH itself.' },
    ],
  },
  psa: {
    what: 'Prostate specific antigen is a protein the prostate leaks into the blood. It is the screening number for prostate trouble and it rises a little on testosterone.',
    range: 'Under 2.5 ng/mL is comfortable, under 4 is the usual cut-off. On TRT the rule of thumb is a rise of more than 1.4 within a year, or above 4, means a urology check.',
    whyMoves: ['TRT lifts PSA a little in the first year, then it settles.', 'Cycling, sex or a prostate infection in the two days before the draw.', 'Age and a benignly enlarged prostate.'],
    practices: ['Retest after 48 hours with no cycling and no ejaculation before believing a jump.', 'This is one people do not self-manage: a confirmed rise goes to a urologist.'],
    faq: [
      { q: 'Does TRT cause prostate cancer?', a: 'The evidence says no for men screened before starting. It can make an existing cancer grow, which is why PSA is checked before and during.' },
      { q: 'How often should PSA be checked on TRT?', a: 'Before starting, at three to six months, then yearly, more often over 50 or with a family history.' },
    ],
  },
  igf1: {
    what: 'IGF-1 is the growth-hormone messenger the liver makes. It is the number people watch on growth hormone or secretagogues, and it tracks recovery and blood sugar effects.',
    range: 'Lab ranges are age-based, roughly 100 to 300 ng/mL for adults. People on GH aim for the upper part of their age range, not above it.',
    whyMoves: ['Growth hormone, MK-677, ipamorelin and CJC raise it.', 'Under-eating and poor sleep lower it.', 'Liver health sets how much the liver can make.'],
    practices: ['On GH, people titrate to the upper age range and watch fasting glucose and HbA1c alongside.', 'Above range with high blood sugar, the dose comes down.'],
    faq: [
      { q: 'What does high IGF-1 mean on peptides?', a: 'The dose is doing what it says. Very high IGF-1 for years is linked to worse outcomes, so people keep it in the upper normal range.' },
      { q: 'Does testosterone change IGF-1?', a: 'A little, upward. Not enough to explain a big rise; look at GH or secretagogues for that.' },
    ],
  },
  dht: {
    what: 'Dihydrotestosterone is testosterone converted by 5-alpha reductase. It drives body hair, prostate growth, hair loss in those prone to it, and a good share of libido.',
    range: 'Lab ranges vary widely by assay. On TRT it rises with the dose and often sits above the lab range without any problem.',
    whyMoves: ['Higher doses and transdermal testosterone raise it most.', 'Finasteride and dutasteride lower it.'],
    practices: ['People losing hair use a 5-alpha reductase inhibitor with eyes open about libido effects.', 'Nobody chases DHT down without a reason.'],
    faq: [
      { q: 'Is high DHT on TRT dangerous?', a: 'Not by itself. Watch PSA and prostate symptoms. High DHT with a receding hairline is a genetics conversation, not a lab emergency.' },
      { q: 'Why is my libido flat with normal testosterone?', a: 'DHT and estradiol matter as much as testosterone here. Low DHT from a blocker or crashed estradiol from an AI are the usual culprits.' },
    ],
  },
  hematocrit: {
    what: 'Hematocrit is the share of the blood that is red cells. Testosterone drives red-cell production, so it is the number that climbs on TRT and the one that stops a lot of protocols.',
    range: 'Lab range about 40 to 50 percent. On TRT, 52 percent is the line where blood gets thick enough that clot risk rises and doctors order a phlebotomy. Under 50 is comfortable.',
    whyMoves: ['Dose and ester: bigger peaks push more red cells.', 'Dehydration on the draw day reads as a higher hematocrit.', 'Sleep apnea, smoking and altitude add to it.', 'Draws near the injection peak read higher than trough.'],
    practices: ['Donate blood, or ask for a therapeutic phlebotomy; most people drop three to four points from one donation.', 'Drink more the day before the draw and test at trough.', 'Smaller, more frequent injections lower the peaks that drive it.', 'Keep ferritin up if donating regularly; iron with vitamin C between donations.'],
    faq: [
      { q: 'What hematocrit is too high on TRT?', a: 'Most guidelines say act at 52 to 54 percent. People on TRT aim to stay under 52.' },
      { q: 'How fast does hematocrit drop after donating?', a: 'Three to four points within days. It climbs back over one to three months on the same dose, which is why the dose and injection frequency matter too.' },
    ],
  },
  hemoglobin: {
    what: 'Hemoglobin is the oxygen-carrying protein in red cells. It moves with hematocrit, and together they show whether the count is rising or the blood is just concentrated.',
    range: 'Lab range about 13.5 to 17.5 g/dL (135 to 175 g/L). On TRT, above 17.5 with a hematocrit over 52 confirms real erythrocytosis rather than a dry draw day.',
    whyMoves: ['Same drivers as hematocrit: testosterone dose, peaks, hydration, sleep apnea, smoking.', 'Iron status caps how high it can go.'],
    practices: ['Read it with hematocrit; the fix is the same (donation, hydration, dose frequency).', 'A hemoglobin that stays high while ferritin drops after donations means the dose is driving it.'],
    faq: [
      { q: 'Hemoglobin high but hematocrit normal, what gives?', a: 'Usually a concentration effect or lab noise. Retest hydrated at trough before doing anything.' },
      { q: 'Is a high hemoglobin good for training?', a: 'Up to a point. Past the safe range the blood is thicker and the heart works harder; the extra oxygen carrying does not outweigh clot risk.' },
    ],
  },
  rbc: {
    what: 'Red blood cell count is the number of red cells per volume. It rises with testosterone alongside hematocrit and hemoglobin.',
    range: 'Lab range about 4.5 to 5.9 million per microliter. On TRT it often sits at the top of the range; above 6 with a high hematocrit is the full erythrocytosis picture.',
    whyMoves: ['Testosterone dose and peaks.', 'Dehydration.', 'Low oxygen: apnea, smoking, altitude.'],
    practices: ['Read with hematocrit and hemoglobin. If all three climb, donate and look at dose frequency.'],
    faq: [{ q: 'Why does RBC matter if hematocrit is checked?', a: 'It separates a real increase in cells from a change in cell size or water. Three markers moving together is a clearer signal than one.' }],
  },
  ferritin: {
    what: 'Ferritin is stored iron. It is the number that quietly runs down on TRT when people donate blood to hold hematocrit, and low ferritin feels like flat energy and poor recovery.',
    range: 'Lab ranges start as low as 20 to 30 ng/mL. People who donate aim to stay above 50 to 60, and under 250 to 300. Very high ferritin points at inflammation or iron overload, not at diet.',
    whyMoves: ['Repeated blood donations, the number one cause on TRT.', 'Low dietary iron, heavy training, endurance work.', 'Inflammation and fatty liver raise it without more iron.'],
    practices: ['Space donations at least eight weeks apart and do not donate on a low ferritin.', 'Iron with vitamin C between donations; red meat and liver help.', 'A high ferritin with normal transferrin saturation is inflammation; look at CRP and the liver.'],
    faq: [
      { q: 'Can I donate blood with low ferritin?', a: 'Blood services check hemoglobin, not ferritin, so they may let you. People on TRT hold off under about 50 ng/mL because the fatigue that follows is worse than a slightly high hematocrit.' },
      { q: 'Does low ferritin cause hair loss and fatigue?', a: 'Yes, both, well before anemia shows on hemoglobin.' },
    ],
  },
  hdl: {
    what: 'HDL is the cholesterol carried away from the arteries. It is the lipid androgens hit hardest, and the one that drags the total to HDL ratio up on its own.',
    range: 'Labs call above 40 mg/dL (1.0 mmol/L) acceptable. People aim for 50 or more (1.3 mmol/L). Orals can halve it within weeks.',
    whyMoves: ['Oral steroids (Anavar, Winstrol, Dianabol) crush it; injectable testosterone lowers it modestly.', 'Low estradiol from an AI lowers it further.', 'Little cardio and smoking keep it low.'],
    practices: ['Drop or shorten the oral; HDL usually returns within six to eight weeks.', 'Zone-2 cardio three or four times a week.', 'Omega-3 fish oil and, if an AI crashed estradiol, easing the AI.'],
    faq: [
      { q: 'Why is my HDL low on testosterone?', a: 'Androgens raise hepatic lipase, which clears HDL faster. The effect is dose-dependent and much larger with orals.' },
      { q: 'Does niacin raise HDL?', a: 'It does, but it did not improve outcomes in trials and it flushes. Cardio and stopping the oral do more.' },
    ],
  },
  ldl: {
    what: 'LDL is the cholesterol that builds plaque. On a protocol it drifts up while HDL drifts down, which is why the ratio between them is the number to watch.',
    range: 'Labs quote under 100 mg/dL (2.6 mmol/L) as optimal and up to 130 (3.4) as near optimal. People on a protocol try to keep it under 100 because the rest of the lipid picture is already loaded against them.',
    whyMoves: ['A higher testosterone dose or a recent increase; lipids follow the dose within weeks.', 'Orals and 19-nors.', 'A bulk with more saturated fat, alcohol, and not much cardio.'],
    practices: ['Soluble fiber (psyllium, oats), plant sterols and omega-3.', 'Citrus bergamot extract is the go-to supplement in TRT circles; some use red yeast rice, which works like a mild statin.', 'If it stays high, a doctor can prescribe the real thing; a statin is cheap and well studied.'],
    faq: [
      { q: 'Is LDL of 130 bad on TRT?', a: 'Borderline for anyone, and worse when HDL is low and hematocrit is high. Look at the ratio and ApoB, then at what changed since the last test.' },
      { q: 'How fast do lipids recover after a cycle?', a: 'Six to twelve weeks after the last oral, sooner for HDL than for LDL.' },
    ],
  },
  triglycerides: {
    what: 'Triglycerides are fat in transit, mostly from carbohydrate and alcohol. They swing with the last meal, which is why fasting matters for this one.',
    range: 'Under 150 mg/dL (1.7 mmol/L) is normal; under 100 (1.1) is where people aim. Above 200 (2.3) with a low HDL is the metabolic pattern.',
    whyMoves: ['Not fasting before the draw.', 'Alcohol, refined carbohydrate, a big bulk.', 'Insulin resistance; growth hormone and MK-677 push it the wrong way.'],
    practices: ['Fast 10 to 12 hours before the draw.', 'Cut alcohol and refined carbohydrate first; omega-3 at 2 to 4 g a day helps a stubborn one.'],
    faq: [{ q: 'Do I need to fast for triglycerides?', a: 'Yes. A non-fasting result can be double the fasting one. Most other markers do not care.' }],
  },
  total_cholesterol: {
    what: 'Total cholesterol is HDL, LDL and the rest added up. On its own it says little; divided by HDL it becomes one of the better risk numbers.',
    range: 'Labs quote under 200 mg/dL (5.0 mmol/L). A high total with a high HDL is fine; a normal total with a low HDL is not.',
    whyMoves: ['Follows LDL and HDL: dose, orals, diet, cardio.'],
    practices: ['Read the ratio (total divided by HDL) rather than the total. Under 3.5 is where people aim; over 5 is the risk zone.'],
    faq: [{ q: 'My total cholesterol is high but my doctor is not worried, why?', a: 'Because the split matters. A high HDL lifts the total without adding risk. Check the ratio and LDL.' }],
  },
  non_hdl: {
    what: 'Non-HDL cholesterol is everything except HDL: all the particles that can build plaque, in one number. Many clinicians prefer it to LDL.',
    range: 'Under 130 mg/dL (3.4 mmol/L) is the usual target; people on a protocol aim under 100 to 120.',
    whyMoves: ['Same drivers as LDL and triglycerides.'],
    practices: ['Treat it like LDL: fiber, cardio, omega-3, fewer orals, a statin if it stays high.'],
    faq: [{ q: 'Non-HDL or LDL, which should I watch?', a: 'Non-HDL includes the remnants LDL misses, so it is the better single number. ApoB is better still if the lab offers it.' }],
  },
  tc_hdl_ratio: {
    what: 'The total cholesterol to HDL ratio is total divided by HDL. It captures the pattern androgens create, LDL up and HDL down, in one number.',
    range: 'Under 3.5 is where people aim, under 4 is acceptable, over 5 is the risk zone.',
    whyMoves: ['Anything that lowers HDL (orals, AIs, dose) or raises LDL (dose, diet).'],
    practices: ['Fix HDL first; it moves the ratio fastest.', 'Cardio and dropping the oral do more than any supplement.'],
    faq: [{ q: 'Why does the ratio matter more than LDL?', a: 'It weighs the protective side too. On a protocol HDL often falls while LDL rises, and the ratio catches both.' }],
  },
  apob: {
    what: 'Apolipoprotein B counts the particles that build plaque, one ApoB per particle. It is the number lipid specialists trust most, and it can be high even when LDL looks fine.',
    range: 'Under 90 mg/dL is good, under 80 for people with other risk factors, above 130 is treated like high LDL.',
    whyMoves: ['Same drivers as LDL, plus insulin resistance, which makes many small particles.'],
    practices: ['Ask for ApoB on the next panel if the lab offers it.', 'High ApoB with a normal LDL means many small particles: insulin sensitivity, cardio, fiber, a statin if it stays up.'],
    faq: [{ q: 'LDL is fine but ApoB is high, which is right?', a: 'ApoB. It counts particles; LDL measures cholesterol mass. Many small particles carry less cholesterol each but do more damage.' }],
  },
  glucose: {
    what: 'Fasting glucose is blood sugar after a night without food. It is the quick check on insulin sensitivity, and it is the first number to move on growth hormone or MK-677.',
    range: 'Under 100 mg/dL (5.6 mmol/L) is normal; 100 to 125 is prediabetes; 126 and up on two tests is diabetes.',
    whyMoves: ['Growth hormone and secretagogues raise it directly.', 'A long bulk at higher body fat.', 'Trenbolone and some orals worsen insulin sensitivity.', 'Cortisol from poor sleep or stress.'],
    practices: ['Walk after meals, keep lifting, sleep.', 'Cut the MK-677 or GH dose, or move it to before bed with no carbohydrate.', 'Berberine is the supplement people reach for; a doctor can prescribe metformin.'],
    faq: [{ q: 'Why is my fasting glucose high on MK-677?', a: 'It raises growth hormone, which raises blood sugar and blunts insulin. It is the most common cause in peptide users and it reverses when the dose drops.' }],
  },
  hba1c: {
    what: 'HbA1c is the share of hemoglobin with sugar stuck to it. It averages blood sugar over about three months, so it does not swing with one meal.',
    range: 'Under 5.7 percent (39 mmol/mol) is normal; 5.7 to 6.4 is prediabetes; 6.5 and up is diabetes. On TRT it can read a little low, because red cells turn over faster and donations replace old cells with new.',
    whyMoves: ['Growth hormone and secretagogues.', 'Body fat, refined carbohydrate, poor sleep.', 'Faster red-cell turnover on testosterone, and recent donations, lower it without blood sugar changing.'],
    practices: ['Pair it with fasting glucose and insulin so the TRT effect does not hide a problem.', 'Walking after meals, fiber, less refined carbohydrate.', 'Berberine or metformin through a doctor if it keeps climbing.'],
    faq: [
      { q: 'Can HbA1c be wrong on TRT?', a: 'It can read low. Anything that shortens red-cell life, including donations, lowers it. Fasting glucose and insulin fill the gap.' },
      { q: 'How fast does HbA1c change?', a: 'It reflects three months, so a change in diet shows fully after about that long.' },
    ],
  },
  insulin: {
    what: 'Fasting insulin shows how hard the pancreas is working to keep glucose normal. It rises years before glucose does, which makes it the early warning.',
    range: 'Under 8 µIU/mL is where people aim; labs accept up to about 25. With glucose it gives HOMA-IR, the insulin resistance index.',
    whyMoves: ['Body fat, especially around the middle.', 'Growth hormone and MK-677.', 'Poor sleep, inactivity, refined carbohydrate.'],
    practices: ['Resistance training and walking, the two things that move insulin most.', 'Fiber 25 g or more a day; berberine as the common supplement.'],
    faq: [{ q: 'Normal glucose but high insulin, what does that mean?', a: 'Early insulin resistance. The pancreas is compensating. It is the best time to act, because it reverses with training and diet.' }],
  },
  creatine_kinase: {
    what: 'Creatine kinase leaks from muscle when it is worked or damaged. Lifters run high CK all the time; it is what makes ALT and AST look like a liver problem when they are not.',
    range: 'Lab ranges top out around 200 to 300 U/L. Two days after a hard session it can read in the thousands with no harm.',
    whyMoves: ['Training in the two or three days before the draw.', 'Muscle mass; bigger people run higher.', 'Statins and dehydration add to it.'],
    practices: ['No training for 48 hours before a draw so the liver panel means something.', 'Above 5000 with dark urine is rhabdomyolysis; that goes to a doctor.'],
    faq: [{ q: 'High ALT and high CK, is my liver damaged?', a: 'Probably not. ALT and AST leak from muscle too. A normal GGT with a high CK says muscle, not liver.' }],
  },
  creatinine: {
    what: 'Creatinine is a waste product of muscle metabolism cleared by the kidneys. It tracks muscle mass and creatine intake as much as kidney function.',
    range: 'Lab range roughly 0.7 to 1.3 mg/dL (60 to 110 µmol/L). A big lifter on creatine sits at the top or just over with normal kidneys.',
    whyMoves: ['Creatine supplements raise it without touching the kidney.', 'Muscle mass; the formula assumes an average build.', 'Dehydration, a high-protein diet, NSAIDs.', 'Blood pressure running high for months; the real kidney risk.'],
    practices: ['Retest hydrated and off creatine for five to seven days.', 'Ask for cystatin C; it ignores muscle.', 'Keep blood pressure in check and go easy on NSAIDs.'],
    faq: [{ q: 'Creatinine high on creatine, should I stop?', a: 'Not for the kidney. Stop for a week before the next draw so the number is honest, or ask for cystatin C.' }],
  },
  egfr: {
    what: 'eGFR estimates how well the kidneys filter, calculated from creatinine, age and sex. It is only as good as the creatinine that feeds it.',
    range: 'Above 90 is normal; 60 to 89 is mildly decreased on paper and normal for most adults; under 60 on two tests is kidney disease.',
    whyMoves: ['Anything that raises creatinine (creatine, muscle, dehydration) lowers eGFR without the kidney changing.', 'Blood pressure and diabetes lower it for real over years.'],
    practices: ['A low eGFR in a big supplemented lifter is checked with cystatin C before anyone worries.', 'Blood pressure control is the real protector.'],
    faq: [{ q: 'eGFR 75 on TRT, is that a problem?', a: 'Usually not. Creatine and muscle mass explain most of it. Cystatin C settles the question.' }],
  },
  cystatin_c: {
    what: 'Cystatin C is a protein every cell makes at a steady rate, cleared by the kidneys. Unlike creatinine it does not care about muscle or creatine, so it is the honest kidney test for lifters.',
    range: 'Under 1.0 mg/L is normal; 1.0 to 1.2 is worth a repeat; above that is a real reduction in filtration.',
    whyMoves: ['Actual kidney function.', 'Thyroid disease and steroids (corticosteroids) shift it a little.'],
    practices: ['Ask for it whenever creatinine reads high on a protocol.'],
    faq: [{ q: 'Creatinine high, cystatin C normal, which is right?', a: 'Cystatin C. The creatinine is muscle and creatine, not the kidney.' }],
  },
  alt: {
    what: 'ALT is the liver enzyme most specific to the liver, and it also leaks from muscle after training. On a protocol it is the marker orals push up.',
    range: 'Labs quote up to about 40 to 50 U/L. Under 1.5 times the upper limit after training is noise; above three times, or rising with GGT, is the liver.',
    whyMoves: ['Oral 17-alpha-alkylated steroids (Anavar, Winstrol, Dianabol, Superdrol), the number one cause.', 'Heavy training within two days of the draw.', 'Alcohol, high-dose paracetamol, some fat burners.', 'Fatty liver after a long bulk.'],
    practices: ['Stop or shorten the oral and retest in two to three weeks.', 'TUDCA (500 to 1000 mg) and NAC (600 to 1200 mg) are the standard liver supports in AAS circles.', 'No training for 48 hours before the next draw.'],
    faq: [
      { q: 'ALT 60 after leg day, is that the liver?', a: 'Most likely muscle. Check GGT and CK: a normal GGT with a high CK says training. Retest after two easy days.' },
      { q: 'How high is too high on an oral?', a: 'Above three times the upper limit people stop the oral; with yellowing, dark urine or pain, they see a doctor, not a forum.' },
    ],
  },
  ast: {
    what: 'AST is a liver enzyme that also lives in muscle and heart. It rises with ALT on liver stress and on its own after training.',
    range: 'Labs quote up to about 40 U/L. AST higher than ALT after training points at muscle; ALT higher than AST points at the liver.',
    whyMoves: ['Training, especially eccentric work.', 'Orals and alcohol, with ALT.', 'Hemolysis in the sample can raise it falsely.'],
    practices: ['Read with ALT, GGT and CK. Rest before the draw.'],
    faq: [{ q: 'AST high but ALT normal?', a: 'Almost always muscle. A high CK confirms it.' }],
  },
  ggt: {
    what: 'GGT is the liver enzyme that does not live in muscle. That makes it the tie-breaker: a high ALT with a normal GGT is training, a high ALT with a rising GGT is the liver.',
    range: 'Labs quote up to about 50 to 70 U/L. Alcohol raises it before anything else does.',
    whyMoves: ['Alcohol, fatty liver, orals, some medications.', 'Bile duct problems raise it with ALP.'],
    practices: ['Cut alcohol first; GGT falls within weeks.', 'On orals, TUDCA and NAC as above.'],
    faq: [{ q: 'Why does GGT matter if ALT is already checked?', a: 'ALT leaks from muscle. GGT does not, so it tells whether a high ALT is training or the liver.' }],
  },
  tsh: {
    what: 'Thyroid stimulating hormone is the brain asking the thyroid for more. High TSH means the thyroid is falling behind; low TSH means it is being pushed, or hormone is coming from a pill.',
    range: 'Labs quote about 0.4 to 4.5 mIU/L. People feel best under 2.5. Suppressed TSH on T3 or a fat burner is expected.',
    whyMoves: ['Hard dieting and low calories push T3 down and TSH up.', 'Clenbuterol and T3 suppress it.', 'Iodine or selenium running short.', 'Plain hypothyroidism, unrelated to the protocol.'],
    practices: ['Retest after two or three weeks eating at maintenance.', 'Selenium (200 mcg) and iodine from food are the usual soft supports.', 'On T3 or a fat burner, that is the cause; people talk to a doctor before touching it.'],
    faq: [{ q: 'TSH high on a cut, is my thyroid broken?', a: 'Usually not. A big deficit lowers active thyroid hormone and TSH rises to compensate. It settles when calories come back.' }],
  },
  free_t4: {
    what: 'Free T4 is the storage form of thyroid hormone, made by the gland and converted to T3 in tissue. It moves slowly and shows what the thyroid itself is producing.',
    range: 'Lab range roughly 0.8 to 1.8 ng/dL (12 to 22 pmol/L). Low with a high TSH is hypothyroidism; low with a low TSH is a pituitary or medication story.',
    whyMoves: ['Thyroid disease.', 'T3 supplementation lowers it because the gland stops making its own.'],
    practices: ['Read with TSH and free T3 together, never alone.'],
    faq: [{ q: 'Free T4 low on T3, is that a problem?', a: 'Expected. Taking T3 turns the gland down. It returns after stopping.' }],
  },
  free_t3: {
    what: 'Free T3 is the active thyroid hormone, the one that sets metabolic rate. It is the first thyroid number to fall in a hard diet.',
    range: 'Lab range roughly 2.3 to 4.2 pg/mL (3.5 to 6.5 pmol/L). People feel best in the upper half.',
    whyMoves: ['Calorie deficit lowers it fast; a refeed brings it back.', 'Selenium and zinc shortfalls slow the conversion from T4.', 'Growth hormone raises conversion a little.'],
    practices: ['Diet breaks every few weeks on a long cut.', 'Selenium, zinc, and enough carbohydrate.'],
    faq: [{ q: 'Low free T3 with normal TSH?', a: 'Diet or stress lowering conversion. It is not thyroid disease and it fixes itself with food and sleep.' }],
  },
  vitamin_d: {
    what: 'Vitamin D (25-OH) is the storage form measured in blood. It matters for testosterone production in men not on TRT, bone, mood and immune function.',
    range: 'Labs call 20 to 30 ng/mL (50 to 75 nmol/L) sufficient. People aim for 40 to 60 ng/mL (100 to 150 nmol/L). Above 100 ng/mL is more than anyone needs.',
    whyMoves: ['Indoor life, winter, darker skin.', 'Body fat stores it away.', 'Very low fat diets cut absorption.'],
    practices: ['D3 at 2000 to 4000 IU a day with K2 and a meal usually gets there in two to three months.', 'Retest after three months, then yearly.'],
    faq: [{ q: 'Does vitamin D raise testosterone?', a: 'Correcting a deficiency helps in men making their own. On TRT it does nothing for the number and everything for bone and mood.' }],
  },
  vitamin_b12: {
    what: 'Vitamin B12 is needed to make red cells and to keep nerves working. Low B12 feels like tiredness, brain fog and pins and needles.',
    range: 'Labs accept above 200 pg/mL; people feel better above 400 to 500. Injections push it far above range harmlessly.',
    whyMoves: ['A vegetarian diet.', 'Metformin and acid blockers cut absorption.'],
    practices: ['Methylcobalamin under the tongue, or injections through a doctor.'],
    faq: [{ q: 'B12 is way above range, is that dangerous?', a: 'No. It is water-soluble and the excess leaves. Very high B12 without supplements is worth a doctor visit, though.' }],
  },
  crp: {
    what: 'High-sensitivity CRP is the general inflammation marker. It rises with infection, injury, body fat, poor sleep and hard training, and it adds to cardiovascular risk when it stays up.',
    range: 'Under 1 mg/L is low risk, 1 to 3 average, above 3 high. Above 10 is usually an infection or injury, not a lifestyle number.',
    whyMoves: ['Hard training in the days before the draw.', 'An infection, an injury, poor sleep, extra body fat.', 'Gum disease and smoking.'],
    practices: ['Retest after a few easy days.', 'Omega-3, curcumin and better sleep are the usual levers for a stubborn one.'],
    faq: [{ q: 'CRP 4 after a hard week of training?', a: 'Expected. Rest three days and retest; a lifestyle CRP is a trough number, not a post-workout one.' }],
  },
  homocysteine: {
    what: 'Homocysteine is an amino acid that builds up when the B vitamins that recycle it run short. High levels roughen artery walls and add to clot risk.',
    range: 'Under 10 µmol/L is where people aim; labs accept up to 15.',
    whyMoves: ['Low folate, B12 or B6.', 'MTHFR variants that slow folate use.', 'Kidney function and coffee push it up a little.'],
    practices: ['Methylated B vitamins (folate, B12, B6) bring it down within weeks.'],
    faq: [{ q: 'Does homocysteine matter on TRT?', a: 'More than usual: a high hematocrit and a high homocysteine both add to clot risk, so people bring it down.' }],
  },
  cortisol: {
    what: 'Morning cortisol is the stress hormone at its daily peak. It is the number that tells whether recovery is happening or the body is running on fumes.',
    range: 'Morning range roughly 6 to 23 µg/dL (170 to 630 nmol/L); it is only meaningful drawn before 9 am. Low in the morning with fatigue deserves a proper test.',
    whyMoves: ['Sleep debt, overtraining, hard dieting.', 'Corticosteroid medication suppresses it.', 'Time of draw, which changes it more than anything.'],
    practices: ['Draw before 9 am, rested, fasted.', 'Sleep, a deload and calories fix most high or low readings.'],
    faq: [{ q: 'Does testosterone lower cortisol?', a: 'A little, and it improves recovery. A high morning cortisol on TRT is usually sleep or training load, not the protocol.' }],
  },
}

// Extra notes per panel, used on the guides index and to cross-link markers.
export const PANEL_INTRO: Record<string, string> = {
  'Sex Hormones': 'The numbers the protocol is set by. Testosterone, its free fraction, estradiol, the binding protein and the pituitary signals.',
  'Lipids': 'Cholesterol and its carriers. This is the panel androgens push the wrong way, and the one worth reading as ratios.',
  'Blood Count': 'Red cells and iron stores. Hematocrit is the number that stops more protocols than any other.',
  'Metabolic': 'Blood sugar, insulin and the muscle enzyme that makes liver panels look worse than they are.',
  'Kidney & Electrolytes': 'Filtration and salts. Creatinine lies to lifters; cystatin C does not.',
  'Liver': 'The enzymes that orals push up, and the one that separates a liver problem from a hard training week.',
  'Thyroid': 'Metabolic rate. The first system a long diet suppresses.',
  'Vitamins & Minerals': 'The cheap fixes that show up in energy and recovery.',
  'Inflammation': 'Background inflammation and clot risk, the quiet numbers next to hematocrit.',
}
