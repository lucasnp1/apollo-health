/**
 * Marker-level copy for the public guides (/guides/<marker>) and, later, for
 * in-app marker notes. Plain words: what the number is, why it moves and how
 * related markers sit together. No doses, no next steps. Not medical advice.
 *
 * Zero imports on purpose: scripts/build-guides.mjs loads this file in Node.
 */

export type MarkerCopy = {
  /** What the marker is, in two sentences. */
  what: string
  /** How to read the lab's range, and how the number behaves on a protocol. */
  range: string
  /** Why it moves on a protocol. */
  whyMoves: string[]
  /** Retired 19 Oct 2026 with the app's next-step lines; kept optional for older callers. */
  practices?: string[]
  faq: Array<{ q: string; a: string }>
}

export const MARKER_COPY: Record<string, MarkerCopy> = {
  total_testosterone: {
    what: 'Total testosterone is everything in the blood, bound and free. On TRT it is the number most clinicians look at first, and the one that swings most with when you draw the blood.',
    range: 'Labs quote a range for men who make their own, roughly 300 to 1000 ng/dL (10 to 35 nmol/L). On a protocol the number depends a lot on timing: a trough draw, the morning of the next injection, reads lower than a peak draw. A peak draw two days after a shot can sit above the lab range.',
    whyMoves: ['Dose and ester: more milligrams and shorter esters push peaks higher.', 'Draw timing: trough and peak can differ by half.', 'Injection frequency: once a week swings more than twice.', 'SHBG: high SHBG holds more of the total as bound.'],
    faq: [
      { q: 'Is a total testosterone above the lab range dangerous on TRT?', a: 'Not by itself. A peak draw can read above range on a normal dose. Clinicians usually read it together with hematocrit, estradiol, blood pressure and how you feel.' },
      { q: 'Why does my total testosterone change so much between tests?', a: 'Mostly timing. A draw near the injection reads higher than one at trough, so tests drawn at different points between injections are hard to compare. Worth raising with your doctor if the numbers jump around.' },
    ],
  },
  free_testosterone: {
    what: 'Free testosterone is the small fraction, about two percent, not bound to SHBG or albumin. It is the part that acts on tissue, so it often tracks how you feel better than the total does.',
    range: 'Lab ranges vary by method. Above the lab range is common on TRT and is not a flag on its own. Low free testosterone with a normal total often goes with high SHBG.',
    whyMoves: ['SHBG up or down changes the free share without the total changing.', 'Dose and draw timing, same as total testosterone.', 'Assay: calculated free testosterone and direct assays disagree; results compare best within one lab.'],
    faq: [
      { q: 'Why is my free testosterone high when my total is normal?', a: 'Usually low SHBG. Less binding protein means a bigger free share of the same total. It is common with higher body fat and on some protocols.' },
      { q: 'Is free testosterone a target?', a: 'It is mostly used to help explain symptoms next to the total and SHBG. What it means for your protocol is a question for your doctor.' },
    ],
  },
  estradiol: {
    what: 'Estradiol (E2) is the estrogen men make from testosterone through aromatase. On TRT it rises with the dose, and it matters for bones, joints, libido and HDL.',
    range: 'The lab range is for men making their own testosterone. On TRT some people also look at the ratio of testosterone to estradiol (testosterone in ng/dL divided by E2 in pg/mL). The sensitive LC-MS/MS assay reads more accurately in men than the standard one.',
    whyMoves: ['Bigger, less frequent injections aromatize more at the peak.', 'Body fat carries aromatase, so leaner men run lower E2 on the same dose.', 'Aromatase inhibitors push it down fast, often a long way.', 'Alcohol in the days before the draw raises it.'],
    faq: [
      { q: 'What estradiol is normal on TRT?', a: 'Figures of roughly 20 to 40 pg/mL (75 to 150 pmol/L) are commonly quoted, and some people read the testosterone to estradiol ratio too. Symptoms matter as much as the number; your doctor reads them together.' },
      { q: 'What are the signs of high or low estradiol?', a: 'Water retention, sore nipples and moodiness are the signs people link to high E2; joint ache, flat mood and low libido to low E2. They overlap with other causes, so they are worth raising with your doctor next to the number.' },
    ],
  },
  shbg: {
    what: 'Sex hormone binding globulin is the protein that carries testosterone in the blood. High SHBG means less free hormone from the same total; low SHBG means more.',
    range: 'Lab ranges are wide, roughly 18 to 55 nmol/L. Toward the top, free testosterone runs low for the total; toward the bottom, more of the total is free and estradiol swings hit harder.',
    whyMoves: ['Low carbohydrate intake, low insulin and thyroid running high push SHBG up.', 'Insulin resistance, higher body fat and higher testosterone doses push it down.', 'Age raises it slowly.'],
    faq: [
      { q: 'Does testosterone lower SHBG?', a: 'Yes, modestly. That is one reason free testosterone can climb faster than total on a protocol.' },
      { q: 'Is high SHBG bad?', a: 'Not bad, but it means the total testosterone overstates what is available. That is why SHBG and free testosterone are read together.' },
    ],
  },
  prolactin: {
    what: 'Prolactin is a pituitary hormone. In men it normally stays low; when it climbs it can blunt libido, erections and mood.',
    range: 'Labs quote roughly 4 to 15 ng/mL (85 to 320 mIU/L). Mildly above that is common after stress, poor sleep or sex before the draw. A clearly high result is one to raise with your doctor.',
    whyMoves: ['Stress, poor sleep, and an orgasm in the hours before the draw.', 'Some medications.', 'Rarely, a pituitary adenoma.'],
    faq: [
      { q: 'Why can one prolactin result read high?', a: 'It reacts to stress, poor sleep and sex in the hours before the draw, so a single mild rise often has a simple cause. Your doctor will know whether it needs a repeat.' },
      { q: 'Does TRT raise prolactin?', a: 'Testosterone alone does not, or barely. A rise on plain TRT usually has another cause.' },
    ],
  },
  lh: {
    what: 'Luteinizing hormone is the brain telling the testes to make testosterone. On TRT it drops to near zero because the brain sees plenty of androgen and stops asking.',
    range: 'Lab range roughly 1.7 to 8.6 IU/L. On TRT it reads under 1, which is expected. Very high LH with low testosterone means the testes are not answering the signal.',
    whyMoves: ['Testosterone from outside the body suppresses it within weeks.', 'HCG does not raise LH; it stands in for it.', 'After testosterone stops, it comes back over weeks to months.'],
    faq: [
      { q: 'Is LH near zero on TRT bad?', a: 'No. It is expected and usually reverses when testosterone stops. If fertility or testicle size matters to you, that is a conversation to have with your doctor.' },
      { q: 'Can LH show recovery after stopping testosterone?', a: 'Yes. LH and FSH back in range with a normal testosterone means the axis is running again.' },
    ],
  },
  fsh: {
    what: 'Follicle stimulating hormone drives sperm production. Like LH it falls to near zero on testosterone, which is why fertility drops on TRT.',
    range: 'Lab range roughly 1.5 to 12 IU/L. Near zero on TRT is expected. High FSH with a normal testosterone points at the sperm-making cells, not the hormone side.',
    whyMoves: ['Suppressed by testosterone from outside the body.', 'HCG keeps testosterone inside the testes up but does not replace FSH.'],
    faq: [
      { q: 'Will FSH recover after TRT?', a: 'Usually, over months. The longer the suppression the slower the return. If children are on the horizon, raise it with your doctor or a fertility clinic early.' },
      { q: 'Does HCG bring FSH back?', a: 'No. It mimics LH. FSH stays low.' },
    ],
  },
  psa: {
    what: 'Prostate specific antigen is a protein the prostate leaks into the blood. It is the screening number for prostate trouble and it rises a little on testosterone.',
    range: 'Under 4 ng/mL is the cut-off most labs use, and under 2.5 is often quoted as comfortable. On testosterone, a rise of more than 1.4 within a year is a change commonly flagged to a urologist.',
    whyMoves: ['TRT lifts PSA a little in the first year, then it usually settles.', 'Cycling, sex or a prostate infection in the two days before the draw.', 'Age and a benignly enlarged prostate.'],
    faq: [
      { q: 'Does TRT cause prostate cancer?', a: 'Current evidence says no for men screened before starting. It can make an existing cancer grow, which is why PSA is checked before and during.' },
      { q: 'Why did my PSA jump?', a: 'Cycling, sex or an infection in the two days before the draw can lift it. Any confirmed rise is one for your doctor, not something to read alone.' },
    ],
  },
  igf1: {
    what: 'IGF-1 is the growth-hormone messenger the liver makes. It is the number people watch on growth hormone or secretagogues, and it moves with blood sugar effects.',
    range: 'Lab ranges are age-based, roughly 100 to 300 ng/mL for adults. Results are read against your own age band.',
    whyMoves: ['Growth hormone, MK-677, ipamorelin and CJC raise it.', 'Under-eating and poor sleep lower it.', 'Liver health sets how much the liver can make.'],
    faq: [
      { q: 'What does high IGF-1 mean on peptides?', a: 'That growth hormone is up. Very high IGF-1 for years is linked to worse outcomes, so it is read next to fasting glucose and HbA1c. Worth raising with your doctor if it sits above your age range.' },
      { q: 'Does testosterone change IGF-1?', a: 'A little, upward. Not enough to explain a big rise on its own.' },
    ],
  },
  dht: {
    what: 'Dihydrotestosterone is testosterone converted by 5-alpha reductase. It drives body hair, prostate growth, hair loss in those prone to it, and a good share of libido.',
    range: 'Lab ranges vary widely by assay. On TRT it rises with the dose and often sits above the lab range.',
    whyMoves: ['Higher doses and transdermal testosterone raise it most.', 'Finasteride and dutasteride lower it.'],
    faq: [
      { q: 'Is high DHT on TRT dangerous?', a: 'Not by itself. It is read next to PSA and prostate symptoms. Hair loss with a high DHT is mostly genetics.' },
      { q: 'Why can libido be flat with normal testosterone?', a: 'DHT and estradiol matter as much as testosterone here. Low DHT from a 5-alpha reductase blocker or very low estradiol are common explanations to raise with your doctor.' },
    ],
  },
  hematocrit: {
    what: 'Hematocrit is the share of the blood that is red cells. Testosterone drives red-cell production, so it is the number that climbs on TRT and the one doctors watch most closely.',
    range: 'Lab range about 40 to 50 percent. The Endocrine Society 2018 testosterone guideline treats a hematocrit above 54 percent as a reason to stop or adjust therapy; lower lines, such as 52 percent, are also commonly quoted.',
    whyMoves: ['Dose and ester: bigger peaks push more red cells.', 'Dehydration on the draw day reads as a higher hematocrit.', 'Sleep apnea, smoking and altitude add to it.', 'Draws near the injection peak read higher than trough.'],
    faq: [
      { q: 'What hematocrit is too high on TRT?', a: 'The Endocrine Society 2018 guideline uses above 54 percent as a reason to stop or adjust therapy. Some clinicians act lower. Where your line sits is a decision for you and your doctor.' },
      { q: 'Why does hematocrit come back after a donation?', a: 'A donation removes red cells, but the dose that drove them up is still there, so it usually climbs back over one to three months.' },
    ],
  },
  hemoglobin: {
    what: 'Hemoglobin is the oxygen-carrying protein in red cells. It moves with hematocrit, and together they show whether the count is rising or the blood is just concentrated.',
    range: 'Lab range about 13.5 to 17.5 g/dL (135 to 175 g/L). Above 17.5 with a high hematocrit points at more red cells rather than a dry draw day.',
    whyMoves: ['Same drivers as hematocrit: testosterone dose, peaks, hydration, sleep apnea, smoking.', 'Iron status caps how high it can go.'],
    faq: [
      { q: 'Hemoglobin high but hematocrit normal, what gives?', a: 'Often a concentration effect or lab noise. Your doctor will read it next to hematocrit and RBC.' },
      { q: 'Is a high hemoglobin good for training?', a: 'Up to a point. Past the lab range the blood is thicker and the heart works harder.' },
    ],
  },
  rbc: {
    what: 'Red blood cell count is the number of red cells per volume. It rises with testosterone alongside hematocrit and hemoglobin.',
    range: 'Lab range about 4.5 to 5.9 million per microliter. On TRT it often sits near the top of the range; above it with a high hematocrit is the full erythrocytosis picture.',
    whyMoves: ['Testosterone dose and peaks.', 'Dehydration.', 'Low oxygen: apnea, smoking, altitude.'],
    faq: [{ q: 'Why does RBC matter if hematocrit is checked?', a: 'It separates a real increase in cells from a change in cell size or water. Three markers moving together is a clearer signal than one.' }],
  },
  ferritin: {
    what: 'Ferritin is stored iron. It can quietly run down on TRT when people give blood to hold hematocrit, and low ferritin can feel like flat energy and poor recovery.',
    range: 'Lab ranges start as low as 20 to 30 ng/mL. Very high ferritin points at inflammation or iron overload, not at diet.',
    whyMoves: ['Repeated blood donations, the most common cause on TRT.', 'Low dietary iron, heavy training, endurance work.', 'Inflammation and fatty liver raise it without more iron.'],
    faq: [
      { q: 'Do blood services check ferritin?', a: 'Most check hemoglobin, not ferritin, so stores can run low without anyone flagging it. Worth raising with your doctor if you give blood regularly.' },
      { q: 'Does low ferritin cause hair loss and fatigue?', a: 'It can cause both, sometimes before anemia shows on hemoglobin.' },
    ],
  },
  hdl: {
    what: 'HDL is the cholesterol carried away from the arteries. It is the lipid androgens lower most, and the one that drags the total to HDL ratio up on its own.',
    range: 'Labs call above 40 mg/dL (1.0 mmol/L) acceptable, and 50 or more (1.3 mmol/L) is commonly quoted as better.',
    whyMoves: ['Injectable testosterone lowers it modestly, more at higher doses.', 'Low estradiol from an aromatase inhibitor lowers it further.', 'Little cardio and smoking keep it low.'],
    faq: [
      { q: 'Why is my HDL low on testosterone?', a: 'Androgens raise hepatic lipase, which clears HDL faster. The effect grows with the dose.' },
      { q: 'Does HDL matter on its own?', a: 'It matters most in the ratio with total cholesterol, and next to LDL and ApoB. Your doctor reads the lipid panel as a whole.' },
    ],
  },
  ldl: {
    what: 'LDL is the cholesterol that builds plaque. On a protocol it can drift up while HDL drifts down, which is why the ratio between them is worth reading.',
    range: 'Labs quote under 100 mg/dL (2.6 mmol/L) as optimal and up to 130 (3.4) as near optimal. Targets depend on your other risk factors, which is a conversation for your doctor.',
    whyMoves: ['A higher testosterone dose or a recent increase; lipids follow the dose within weeks.', 'A bulk with more saturated fat, alcohol, and not much cardio.', 'Genetics, which set a lot of it.'],
    faq: [
      { q: 'Is LDL of 130 bad on TRT?', a: 'It is borderline for anyone, and it reads worse next to a low HDL and a high hematocrit. The ratio, ApoB and the change since the last test add context.' },
      { q: 'How fast do lipids move after a dose change?', a: 'Within a few weeks, HDL usually faster than LDL.' },
    ],
  },
  triglycerides: {
    what: 'Triglycerides are fat in transit, mostly from carbohydrate and alcohol. They swing with the last meal, which is why fasting matters for this one.',
    range: 'Under 150 mg/dL (1.7 mmol/L) is normal. Above 200 (2.3) with a low HDL is the metabolic pattern.',
    whyMoves: ['Not fasting before the draw.', 'Alcohol, refined carbohydrate, a big bulk.', 'Insulin resistance; growth hormone and MK-677 push it the wrong way.'],
    faq: [{ q: 'Does fasting matter for triglycerides?', a: 'Yes. A non-fasting result can be double the fasting one. Most other markers do not care.' }],
  },
  total_cholesterol: {
    what: 'Total cholesterol is HDL, LDL and the rest added up. On its own it says little; divided by HDL it becomes one of the better risk numbers.',
    range: 'Labs quote under 200 mg/dL (5.0 mmol/L). A high total with a high HDL reads differently from a normal total with a low HDL.',
    whyMoves: ['Follows LDL and HDL: dose, diet, cardio.'],
    faq: [{ q: 'My total cholesterol is high but my doctor is not worried, why?', a: 'Because the split matters. A high HDL lifts the total without adding risk. The ratio and LDL tell more.' }],
  },
  non_hdl: {
    what: 'Non-HDL cholesterol is everything except HDL: all the particles that can build plaque, in one number. Many clinicians prefer it to LDL.',
    range: 'Under 130 mg/dL (3.4 mmol/L) is the figure most often quoted.',
    whyMoves: ['Same drivers as LDL and triglycerides.'],
    faq: [{ q: 'Non-HDL or LDL, which tells more?', a: 'Non-HDL includes the remnants LDL misses, so many clinicians prefer it as a single number. ApoB, if the lab offers it, counts particles directly.' }],
  },
  tc_hdl_ratio: {
    what: 'The total cholesterol to HDL ratio is total divided by HDL. It captures the pattern androgens create, LDL up and HDL down, in one number.',
    range: 'Under 3.5 is commonly quoted as a target, under 5 as acceptable; over 5 is commonly quoted as higher risk.',
    whyMoves: ['Anything that lowers HDL (an aromatase inhibitor, a higher dose) or raises LDL (dose, diet).'],
    faq: [{ q: 'Why does the ratio matter more than LDL?', a: 'It weighs the protective side too. On a protocol HDL often falls while LDL rises, and the ratio catches both.' }],
  },
  apob: {
    what: 'Apolipoprotein B counts the particles that build plaque, one ApoB per particle. Many lipid specialists trust it most, and it can be high even when LDL looks fine.',
    range: 'Under 90 mg/dL is commonly quoted as good and lower for people with other risk factors; above 130 is commonly read like a high LDL.',
    whyMoves: ['Same drivers as LDL, plus insulin resistance, which makes many small particles.'],
    faq: [{ q: 'LDL is fine but ApoB is high, which is right?', a: 'They measure different things. ApoB counts particles; LDL measures cholesterol mass. Many small particles can mean a high ApoB with a normal LDL, which is worth raising with your doctor.' }],
  },
  glucose: {
    what: 'Fasting glucose is blood sugar after a night without food. It is the quick check on insulin sensitivity, and it is often the first number to move on growth hormone or MK-677.',
    range: 'Under 100 mg/dL (5.6 mmol/L) is normal; 100 to 125 is prediabetes; 126 and up on two tests is diabetes.',
    whyMoves: ['Growth hormone and secretagogues raise it directly.', 'A long bulk at higher body fat.', 'Cortisol from poor sleep or stress.'],
    faq: [{ q: 'Why is my fasting glucose high on MK-677?', a: 'It raises growth hormone, which raises blood sugar and blunts insulin. It is one of the most common causes in peptide users. What to do about it is a question for your doctor.' }],
  },
  hba1c: {
    what: 'HbA1c is the share of hemoglobin with sugar stuck to it. It averages blood sugar over about three months, so it does not swing with one meal.',
    range: 'Under 5.7 percent (39 mmol/mol) is normal; 5.7 to 6.4 is prediabetes; 6.5 and up is diabetes. On TRT it can read a little low, because red cells turn over faster and donations replace old cells with new.',
    whyMoves: ['Growth hormone and secretagogues.', 'Body fat, refined carbohydrate, poor sleep.', 'Faster red-cell turnover on testosterone, and recent donations, lower it without blood sugar changing.'],
    faq: [
      { q: 'Can HbA1c be wrong on TRT?', a: 'It can read low. Anything that shortens red-cell life, including donations, lowers it. That is why it is read next to fasting glucose and insulin.' },
      { q: 'How fast does HbA1c change?', a: 'It reflects about three months, so a change shows fully after about that long.' },
    ],
  },
  insulin: {
    what: 'Fasting insulin shows how hard the pancreas is working to keep glucose normal. It rises years before glucose does, which makes it the early warning.',
    range: 'Labs accept up to about 25 µIU/mL; lower figures, under 8 or so, are commonly quoted as better. With glucose it gives HOMA-IR, the insulin resistance index.',
    whyMoves: ['Body fat, especially around the middle.', 'Growth hormone and MK-677.', 'Poor sleep, inactivity, refined carbohydrate.'],
    faq: [{ q: 'Normal glucose but high insulin, what does that mean?', a: 'Often early insulin resistance: the pancreas is working harder to hold glucose normal. It is a good one to raise with your doctor early.' }],
  },
  creatine_kinase: {
    what: 'Creatine kinase leaks from muscle when it is worked or damaged. Lifters often run high CK; it is what can make ALT and AST look like a liver problem when they are not.',
    range: 'Lab ranges top out around 200 to 300 U/L. Two days after a hard session it can read in the thousands. Very high CK with dark urine is a medical problem, not a training one.',
    whyMoves: ['Training in the two or three days before the draw.', 'Muscle mass; bigger people run higher.', 'Statins and dehydration add to it.'],
    faq: [{ q: 'High ALT and high CK, is my liver damaged?', a: 'Not necessarily. ALT and AST leak from muscle too. A normal GGT with a high CK points at muscle rather than liver.' }],
  },
  creatinine: {
    what: 'Creatinine is a waste product of muscle metabolism cleared by the kidneys. It tracks muscle mass and creatine intake as much as kidney function.',
    range: 'Lab range roughly 0.7 to 1.3 mg/dL (60 to 110 µmol/L). A big lifter on creatine can sit at the top or just over with normal kidneys.',
    whyMoves: ['Creatine supplements raise it without touching the kidney.', 'Muscle mass; the formula assumes an average build.', 'Dehydration, a high-protein diet, NSAIDs.', 'Blood pressure running high for months; the real kidney risk.'],
    faq: [{ q: 'Does creatine raise creatinine?', a: 'Yes, without harming the kidney, so the number can overstate a problem. Cystatin C is a kidney test that ignores muscle and creatine; ask your doctor whether it is worth adding.' }],
  },
  egfr: {
    what: 'eGFR estimates how well the kidneys filter, calculated from creatinine, age and sex. It is only as good as the creatinine that feeds it.',
    range: 'Above 90 is normal; 60 to 89 is mildly decreased on paper and normal for many adults; under 60 on two tests is kidney disease.',
    whyMoves: ['Anything that raises creatinine (creatine, muscle, dehydration) lowers eGFR without the kidney changing.', 'Blood pressure and diabetes lower it for real over years.'],
    faq: [{ q: 'eGFR 75 on TRT, is that a problem?', a: 'Often not. Creatine and muscle mass can explain much of it. Cystatin C gives a second view that ignores muscle.' }],
  },
  cystatin_c: {
    what: 'Cystatin C is a protein every cell makes at a steady rate, cleared by the kidneys. Unlike creatinine it does not care about muscle or creatine, so it is a cleaner kidney test for lifters.',
    range: 'Under 1.0 mg/L is normal; above about 1.2 is a real reduction in filtration.',
    whyMoves: ['Actual kidney function.', 'Thyroid disease and corticosteroids shift it a little.'],
    faq: [{ q: 'Creatinine high, cystatin C normal, which is right?', a: 'Cystatin C is less affected by muscle and creatine, so the two together often point at muscle rather than the kidney.' }],
  },
  alt: {
    what: 'ALT is the liver enzyme most specific to the liver, and it also leaks from muscle after training.',
    range: 'Labs quote up to about 40 to 50 U/L. A mild rise after training is common; a large rise, or one with GGT rising too, points at the liver.',
    whyMoves: ['Heavy training within two days of the draw.', 'Alcohol, high-dose paracetamol, some fat burners and other medications.', 'Fatty liver after a long bulk.'],
    faq: [
      { q: 'ALT 60 after leg day, is that the liver?', a: 'Often it is muscle. GGT and CK help tell them apart: a normal GGT with a high CK points at training.' },
      { q: 'When is a high ALT a concern?', a: 'A large or rising ALT, a rising GGT next to it, or any yellowing, dark urine or pain is one for your doctor.' },
    ],
  },
  ast: {
    what: 'AST is a liver enzyme that also lives in muscle and heart. It rises with ALT on liver stress and on its own after training.',
    range: 'Labs quote up to about 40 U/L. AST higher than ALT after training points at muscle; ALT higher than AST points at the liver.',
    whyMoves: ['Training, especially eccentric work.', 'Alcohol and some medications, with ALT.', 'Hemolysis in the sample can raise it falsely.'],
    faq: [{ q: 'AST high but ALT normal?', a: 'Often muscle. A high CK in the same test supports that.' }],
  },
  ggt: {
    what: 'GGT is the liver enzyme that does not live in muscle. That makes it the tie-breaker: a high ALT with a normal GGT points at training, a high ALT with a rising GGT at the liver.',
    range: 'Labs quote up to about 50 to 70 U/L. Alcohol raises it before anything else does.',
    whyMoves: ['Alcohol, fatty liver, some medications.', 'Bile duct problems raise it with ALP.'],
    faq: [{ q: 'Why does GGT matter if ALT is already checked?', a: 'ALT leaks from muscle. GGT does not, so it helps tell whether a high ALT is training or the liver.' }],
  },
  tsh: {
    what: 'Thyroid stimulating hormone is the brain asking the thyroid for more. High TSH means the thyroid is falling behind; low TSH means it is being pushed, or hormone is coming from a pill.',
    range: 'Labs quote about 0.4 to 4.5 mIU/L. Suppressed TSH on thyroid medication is expected.',
    whyMoves: ['Hard dieting and low calories push T3 down and TSH up.', 'Thyroid medication suppresses it.', 'Iodine or selenium running short.', 'Plain hypothyroidism, unrelated to the protocol.'],
    faq: [{ q: 'TSH high on a cut, is my thyroid broken?', a: 'Not necessarily. A big calorie deficit lowers active thyroid hormone and TSH can rise to compensate. Your doctor can tell a diet effect from thyroid disease.' }],
  },
  free_t4: {
    what: 'Free T4 is the storage form of thyroid hormone, made by the gland and converted to T3 in tissue. It moves slowly and shows what the thyroid itself is producing.',
    range: 'Lab range roughly 0.8 to 1.8 ng/dL (12 to 22 pmol/L). Low with a high TSH is hypothyroidism; low with a low TSH is a pituitary or medication story.',
    whyMoves: ['Thyroid disease.', 'T3 medication lowers it because the gland stops making its own.'],
    faq: [{ q: 'Is free T4 read on its own?', a: 'Rarely. It makes sense next to TSH and free T3.' }],
  },
  free_t3: {
    what: 'Free T3 is the active thyroid hormone, the one that sets metabolic rate. It is often the first thyroid number to fall in a hard diet.',
    range: 'Lab range roughly 2.3 to 4.2 pg/mL (3.5 to 6.5 pmol/L).',
    whyMoves: ['Calorie deficit lowers it fast; eating more brings it back.', 'Selenium and zinc shortfalls slow the conversion from T4.', 'Growth hormone raises conversion a little.'],
    faq: [{ q: 'Low free T3 with normal TSH?', a: 'Often diet or stress lowering conversion rather than thyroid disease. Your doctor reads it next to TSH and free T4.' }],
  },
  vitamin_d: {
    what: 'Vitamin D (25-OH) is the storage form measured in blood. It matters for bone, mood, immune function and testosterone production in men not on TRT.',
    range: 'Labs call 20 to 30 ng/mL (50 to 75 nmol/L) sufficient; 40 to 60 ng/mL (100 to 150 nmol/L) is commonly quoted as a target. Above 100 ng/mL is more than anyone needs.',
    whyMoves: ['Indoor life, winter, darker skin.', 'Body fat stores it away.', 'Very low fat diets cut absorption.'],
    faq: [{ q: 'Does vitamin D raise testosterone?', a: 'Correcting a deficiency can help in men making their own. On TRT it does not change the number much, but it still matters for bone and mood.' }],
  },
  vitamin_b12: {
    what: 'Vitamin B12 is needed to make red cells and to keep nerves working. Low B12 can feel like tiredness, brain fog and pins and needles.',
    range: 'Labs accept above 200 pg/mL. Supplements and injections can push it far above range.',
    whyMoves: ['A vegetarian diet.', 'Metformin and acid blockers cut absorption.', 'Supplements raise it.'],
    faq: [{ q: 'B12 is way above range, is that dangerous?', a: 'Usually not on supplements; the excess leaves. Very high B12 without supplements is worth raising with your doctor.' }],
  },
  crp: {
    what: 'High-sensitivity CRP is the general inflammation marker. It rises with infection, injury, body fat, poor sleep and hard training, and it adds to cardiovascular risk when it stays up.',
    range: 'Under 1 mg/L is low risk, 1 to 3 average, above 3 high. Above 10 is usually an infection or injury, not a lifestyle number.',
    whyMoves: ['Hard training in the days before the draw.', 'An infection, an injury, poor sleep, extra body fat.', 'Gum disease and smoking.'],
    faq: [{ q: 'CRP 4 after a hard week of training?', a: 'Common. CRP spikes after big sessions, so a result drawn after a hard week reads higher than one after a few easy days.' }],
  },
  homocysteine: {
    what: 'Homocysteine is an amino acid that builds up when the B vitamins that recycle it run short. High levels are linked to artery damage and clot risk.',
    range: 'Labs accept up to about 15 µmol/L; under 10 is commonly quoted as better.',
    whyMoves: ['Low folate, B12 or B6.', 'MTHFR variants that slow folate use.', 'Kidney function and coffee push it up a little.'],
    faq: [{ q: 'Does homocysteine matter on TRT?', a: 'A high hematocrit and a high homocysteine both add to clot risk, so they are worth reading together with your doctor.' }],
  },
  cortisol: {
    what: 'Morning cortisol is the stress hormone at its daily peak. It shows whether recovery is happening or the body is running on fumes.',
    range: 'Morning range roughly 6 to 23 µg/dL (170 to 630 nmol/L); it is only meaningful drawn before 9 am. A low morning result with fatigue is one to raise with your doctor.',
    whyMoves: ['Sleep debt, overtraining, hard dieting.', 'Corticosteroid medication suppresses it.', 'Time of draw, which changes it more than anything.'],
    faq: [{ q: 'Does testosterone lower cortisol?', a: 'A little. A high morning cortisol on TRT is more often sleep or training load than the protocol.' }],
  },
}

// Extra notes per panel, used on the guides index and to cross-link markers.
export const PANEL_INTRO: Record<string, string> = {
  'Sex Hormones': 'The core numbers on a protocol. Testosterone, its free fraction, estradiol, the binding protein and the pituitary signals.',
  'Lipids': 'Cholesterol and its carriers. This is the panel androgens push the wrong way, and the one worth reading as ratios.',
  'Blood Count': 'Red cells and iron stores. Hematocrit is the number doctors watch most closely on testosterone.',
  'Metabolic': 'Blood sugar, insulin and the muscle enzyme that makes liver panels look worse than they are.',
  'Kidney & Electrolytes': 'Filtration and salts. Creatinine lies to lifters; cystatin C does not.',
  'Liver': 'The liver enzymes, and the one that separates a liver problem from a hard training week.',
  'Thyroid': 'Metabolic rate. The first system a long diet suppresses.',
  'Vitamins & Minerals': 'The levels that show up in energy and recovery.',
  'Inflammation': 'Background inflammation and clot risk, the quiet numbers next to hematocrit.',
}
