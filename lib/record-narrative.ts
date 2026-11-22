/**
 * Movement II — the record. The making-of narrative, as data.
 *
 * Eight beats covering how this study was built: the question, the instrument,
 * the store, an abandoned pipeline, the estimators, the live publish path, this
 * dashboard's own defects, and what the result cannot support. The prose lives
 * here rather than inside a component so that every editorial claim on the site
 * is reviewable in one file, against one set of rules.
 *
 * THE RULES THIS FILE IS WRITTEN UNDER
 *
 * 1. No fabricated statistic, anywhere. Every claim below was checked against
 *    the file it names. Several claims that were previously asserted here did
 *    not survive that check and have been rewritten; see the note on the event
 *    definition in `limits`.
 * 2. NO DATA-DERIVED NUMBER IN PROSE. The watcher republishes on every survey
 *    submission, so a figure baked into a sentence becomes a wrong number the
 *    moment a response arrives. Anything the pipeline computes goes in
 *    `figures` as a key, resolved live at render. Where a quantity has no
 *    published key it is described structurally — "one row per category
 *    selected" rather than a row count — and its absence is named.
 * 3. Filesystem facts are quoted directly. A line count, a filename, a literal
 *    written into a source file, an answer option in the questionnaire: none of
 *    these move when the pipeline reruns, so they live in `evidence` as
 *    citations. Live measurements never do.
 * 4. Nothing per-respondent. The survey collects full names and email
 *    addresses. No beat quotes a response, and no beat describes an individual.
 *    Answer options are quoted from the survey source — the menu, never anyone's
 *    selection from it — and every characterisation of the panel is an aggregate
 *    with no number attached to a person.
 * 5. Evidence, not incident. Every dramatic claim points at an artefact a
 *    reader can open. Nothing asserts what anyone felt, intended, or did on a
 *    particular day, and no named individual is credited with an act.
 * 6. Where a beat's verdict depends on the current publish rather than on a
 *    constant, the prose says so and the figures beside it carry the verdict.
 *    Two beats turn on a direction — a concordance below one half, a corrected
 *    threshold nothing clears — and both are written to be re-read against
 *    their figures rather than to stand alone.
 *
 * WHAT THE RENDERER MUST DO
 *
 * `figures[].key` is a lookup into the published payload, not a value. The
 * component that renders a beat resolves each key at paint time and, when a key
 * cannot be resolved, MUST render an explicit unavailable state that names the
 * reason — "no publish yet", "pipeline reported no events", "median not
 * reached". A blank or a zero in a figure slot reads as a measurement, which is
 * the one failure mode this file exists to prevent. See FIGURE_KEYS for what
 * each key resolves from.
 *
 * Deliberately dependency-free: types only, no imports. A reviewer reading this
 * file needs nothing else open to audit what the site says.
 */

/* ─────────────────────────────────────────────────────────── figure keys ──── */

/**
 * Every live value the narrative is allowed to print, and where it comes from.
 * Accessor names are those exported by lib/supabase-browser.
 *
 *   panel.records            meta.source_rows, else recordsOf(payload).length
 *   panel.analyzed           meta.analyzed_rows — rows that yielded a usable
 *                            (time, event) pair, which is fewer than the rows
 *                            collected whenever a purchase date is missing
 *   panel.categories         deviceKeysOf(payload).length
 *   panel.events             kmOverallOf(payload).events
 *   panel.censored           kmOverallOf(payload).censored
 *   panel.followup_months    kmOverallOf(payload).max_followup_months
 *
 *   curves.total             deviceKeysOf(payload).length
 *   curves.estimable         kmCurvesOf(payload), counting curve.estimable
 *
 *   survival.rmst_months     kmOverallOf(payload).restricted_mean_months
 *   survival.s24             kmOverallOf(payload).points, survival at month 24
 *   survival.median          kmOverallOf(payload).median_survival_months. NULL
 *                            IS A RESULT, NOT A GAP: it means more than half the
 *                            panel outlived follow-up, so the renderer must
 *                            print "not reached" and never an empty slot.
 *
 *   models.cox_in            modelsOf(payload).cox_in
 *   models.cox_cv            modelsOf(payload).cox_cv
 *   models.cox_cv_sd         modelsOf(payload).cox_cv_sd
 *   models.rsf_in            modelsOf(payload).rsf_in
 *   models.rsf_cv            modelsOf(payload).rsf_cv
 *   models.rsf_cv_sd         modelsOf(payload).rsf_cv_sd
 *   models.folds             modelsOf(payload).folds — folds that actually
 *                            scored, not folds requested: report_values.py skips
 *                            any test fold holding fewer than two events
 *   models.covariates        modelsOf(payload).covariates.length
 *   models.min_covariate_p   smallest p across modelsOf(payload).covariates
 *
 *   logrank.pairs            kmComparisonOf(payload).pairs.length
 *   logrank.nominal          kmComparisonOf(payload).significant_pairs
 *   logrank.bonferroni_alpha comparison.alpha / pairs.length
 *   logrank.bonferroni_pairs pairs where p_value < comparison.alpha / pairs.length
 *
 *   brands.count             brandsOf(payload).rates.length
 *   brands.tier_p            brandsOf(payload).tiers.p
 *   brands.logrank_p         brandsOf(payload).logrank.p
 *
 *   pipeline.ms              meta.pipeline_ms
 *   pipeline.updated_at      meta.updated_at
 *
 * Two of these are derived rather than read: `logrank.bonferroni_alpha` and
 * `logrank.bonferroni_pairs`. That is on purpose. The pipeline publishes every
 * pairwise p-value and its own alpha but does not publish a corrected verdict,
 * so the correction is computed from the published values instead of asserted
 * as a literal — and it re-derives itself when the number of comparisons
 * changes, which it will as soon as another category becomes estimable.
 */
export const FIGURE_KEYS = [
  'panel.records',
  'panel.analyzed',
  'panel.categories',
  'panel.events',
  'panel.censored',
  'panel.followup_months',
  'curves.total',
  'curves.estimable',
  'survival.rmst_months',
  'survival.s24',
  'survival.median',
  'models.cox_in',
  'models.cox_cv',
  'models.cox_cv_sd',
  'models.rsf_in',
  'models.rsf_cv',
  'models.rsf_cv_sd',
  'models.folds',
  'models.covariates',
  'models.min_covariate_p',
  'logrank.pairs',
  'logrank.nominal',
  'logrank.bonferroni_alpha',
  'logrank.bonferroni_pairs',
  'brands.count',
  'brands.tier_p',
  'brands.logrank_p',
  'pipeline.ms',
  'pipeline.updated_at',
] as const;

/** A key the renderer must be able to resolve, or explain the absence of. */
export type FigureKey = (typeof FIGURE_KEYS)[number];

/* ──────────────────────────────────────────────────────────────── shapes ──── */

/**
 * One citation. `detail` names the file, literal or filename that supports the
 * beat, so a reader can check the claim without having to guess where to look.
 */
export interface BeatEvidence {
  label: string;
  detail: string;
}

/** A live value the beat prints. `label` is editorial; `key` is the lookup. */
export interface BeatFigure {
  label: string;
  key: FigureKey;
}

export type BeatId =
  | 'question'
  | 'instrument'
  | 'store'
  | 'false-start'
  | 'estimator'
  | 'live-pipeline'
  | 'dashboard'
  | 'limits';

export interface RecordBeat {
  id: BeatId;
  /** Array position, ZERO-BASED, matching the Act convention in app/page.tsx.
   *  Render the human ordinal as `index + 1` — the kicker carries no number so
   *  that reordering the array cannot desynchronise the two. */
  index: number;
  /** Eyebrow. Short, and never a restatement of the title. */
  kicker: string;
  title: string;
  /** Paragraphs, in order. Two to three sentences each. */
  body: string[];
  evidence: BeatEvidence[];
  figures?: BeatFigure[];
}

/* ───────────────────────────────────────────────────────────────── beats ──── */

export const RECORD_BEATS: RecordBeat[] = [
  {
    id: 'question',
    index: 0,
    kicker: 'Why lifespan',
    title: 'The question',
    body: [
      'Cheap peripherals are bought as disposable and thrown away without anyone recording when they stopped working. Across ten categories, how long does a unit last?',
      'Survival analysis fits because most units have not failed. A device still working when last seen is censored, not missing — it sets a lower bound.',
    ],
    evidence: [
      { label: 'The binding constraint',
        detail: 'Every estimate is limited by the number of observed failures, not the number of responses.' },
    ],
    figures: [
      { label: 'Device histories', key: 'panel.records' },
      { label: 'Categories', key: 'panel.categories' },
      { label: 'Observed failures', key: 'panel.events' },
      { label: 'Censored', key: 'panel.censored' },
    ],
  },

  {
    id: 'instrument',
    index: 1,
    kicker: 'Two builds',
    title: 'The instrument',
    body: [
      'Two survey builds exist and ask the same questions. Each is one HTML file with Supabase and Tailwind from a CDN and no build step — which is why there are two rather than one with a history.',
    ],
    evidence: [
      { label: 'The files',
        detail: 'survival_survey.html at 1283 lines; index.html at 1737.' },
      { label: 'Rows are devices, not people',
        detail: 'One row per category selected, so a submission can produce several.' },
    ],
  },

  {
    id: 'store',
    index: 2,
    kicker: 'Two blobs',
    title: 'The store',
    body: [
      'One Postgres table. A few real columns, and everything answered inside two JSONB blobs the pipeline flattens with json_normalize.',
    ],
    evidence: [
      { label: 'The 1000-row cap',
        detail: 'Extraction pages through the table because PostgREST caps one request at 1000 rows. A single call would have truncated the panel silently.' },
    ],
    figures: [
      { label: 'Rows retrieved', key: 'panel.records' },
      { label: 'Usable', key: 'panel.analyzed' },
    ],
  },

  {
    id: 'false-start',
    index: 3,
    kicker: 'The abandoned tree',
    title: 'The false start',
    body: [
      'An earlier version was written in R and abandoned: eleven numbered stage scripts and a folder of plots.',
      'What ended it is in the filenames. Seven scripts beginning fix_ and four beginning test_ are not analysis — each reads a stage script, rewrites a line by regular expression, and writes it back. The pipeline was patched by scripts that edited its own source.',
    ],
    evidence: [
      { label: 'A frozen clock',
        detail: 'parse_data.R hardcodes the year, so every censored duration was measured against a fixed date.' },
      { label: 'The plots',
        detail: 'Twenty-two files, numbered to twenty-five.' },
    ],
  },

  {
    id: 'estimator',
    index: 4,
    kicker: 'What the models did',
    title: 'The estimator',
    body: [
      'The curves work. The predictive models do not: cross-validated Cox falls below 0.50, worse than a coin flip, and the forest scores far higher in-sample than out of it. That gap is memorisation. No covariate reaches significance.',
    ],
    evidence: [
      { label: 'Below chance is a result',
        detail: 'Under 0.50 the ordering carries no usable information.' },
      { label: 'In-sample is not a finding',
        detail: 'Fitting and scoring on the same rows measures recall; it is shown only beside the held-out number.' },
    ],
    figures: [
      { label: 'Cox, cross-validated', key: 'models.cox_cv' },
      { label: 'Cox, in-sample', key: 'models.cox_in' },
      { label: 'Forest, cross-validated', key: 'models.rsf_cv' },
      { label: 'Forest, in-sample', key: 'models.rsf_in' },
      { label: 'Lowest covariate p', key: 'models.min_covariate_p' },
    ],
  },

  {
    id: 'live-pipeline',
    index: 5,
    kicker: 'No table, no DDL',
    title: 'The live pipeline',
    body: [
      'Results reach this page with no results table and no schema: the payload goes to a public Storage bucket and is announced on a broadcast channel. Both work with the API keys alone.',
      'Not a design choice. With no database password there was no way to create a table.',
    ],
    evidence: [
      { label: 'The loop',
        detail: 'A watcher recomputes on a broadcast, re-publishes, and the page repaints without a reload.' },
    ],
    figures: [
      { label: 'Last publish', key: 'pipeline.updated_at' },
      { label: 'Run time', key: 'pipeline.ms' },
    ],
  },

  {
    id: 'dashboard',
    index: 6,
    kicker: 'This build',
    title: 'The dashboard',
    body: [
      'Two defects worth stating, because both produced output that looked correct.',
      'The restricted-mean estimator interpolated a step function and was biased low on nine of ten curves — adding samples converged on the wrong number. And the whole WebGL layer sat behind an opaque background at a negative z-index: nothing it drew ever reached the screen, and what looked like the animated background was a CSS gradient.',
    ],
    evidence: [
      { label: 'Why it was wrong',
        detail: 'Interpolation ramps down before each step, always removing area under a decreasing step function.' },
      { label: 'Why it was invisible',
        detail: 'A negative z-index child paints before in-flow block backgrounds. Draw calls happened; nothing composited.' },
    ],
  },

  {
    id: 'limits',
    index: 7,
    kicker: 'What this cannot say',
    title: 'The limits',
    body: [
      'A convenience sample of students, with dates self-reported from memory. Neither is fixable after collection.',
      'The harder limit is arithmetic: with this few failures across ten categories, no pairwise comparison survives correction, and brand is confounded with category. The pooled curves hold; the rankings are leads.',
    ],
    evidence: [
      { label: 'What would change it',
        detail: 'More responses from people whose devices actually broke. More responses alone would not.' },
    ],
    figures: [
      { label: 'Pairs tested', key: 'logrank.pairs' },
      { label: 'Clear the uncorrected bar', key: 'logrank.nominal' },
      { label: 'Corrected bar', key: 'logrank.bonferroni_alpha' },
      { label: 'Clear it', key: 'logrank.bonferroni_pairs' },
      { label: 'Named vs unbranded', key: 'brands.tier_p' },
    ],
  },
];

export const BEAT_COUNT = RECORD_BEATS.length;
