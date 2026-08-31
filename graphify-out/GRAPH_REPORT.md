# Graph Report - apollo-health  (2026-08-31)

## Corpus Check
- 112 files · ~126,187 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 850 nodes · 1753 edges · 36 communities (28 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App Shell, Settings & Export
- Backend API & Auth
- Dashboard Charts & PK
- Injection Logging Flow
- Client Sync & API
- Local DB & Scheduling
- Runtime Dependencies
- Lab Markers & Composites
- PDF Lab Parsing & Toasts
- Dev Dependencies & Tooling
- Timeline View
- Health Import Bridge
- TS Config (app)
- App Lock & Passphrase
- TS Config (node)
- UI Primitives (Card/Layout)
- Targets & Goals
- Insights & Correlations
- shadcn Config
- Theming & Bootstrap
- Dropdown Menu UI
- Sign-In & Branding
- Select UI
- Sheet UI
- Table UI
- PWA Install Prompt
- D1 Statement Types
- R2 Bucket Types
- Tooltip UI
- TS Config (root)
- File Row Actions
- Trash & Restore

## God Nodes (most connected - your core abstractions)
1. `cn()` - 123 edges
2. `jsonOk()` - 20 edges
3. `jsonError()` - 18 edges
4. `db` - 18 edges
5. `compilerOptions` - 18 edges
6. `Button()` - 17 edges
7. `compilerOptions` - 16 edges
8. `requireUser()` - 13 edges
9. `PagesFunction` - 12 edges
10. `InjectionLog` - 12 edges

## Surprising Connections (you probably didn't know these)
- `CompositeRow()` --calls--> `cn()`  [EXTRACTED]
  src/components/LabComposites.tsx → src/lib/utils.ts
- `DropdownMenuContent()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts
- `DropdownMenuItem()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts
- `DropdownMenuCheckboxItem()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts
- `DropdownMenuRadioItem()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (36 total, 4 thin omitted)

### Community 0 - "App Shell, Settings & Export"
Cohesion: 0.05
Nodes (60): AddInjection, App(), AuthBundle, ExportSheet, Labs, PdfReviewSheet, Settings, Timeline (+52 more)

### Community 1 - "Backend API & Auth"
Cohesion: 0.08
Nodes (54): onRequestPost, onRequestPost, onRequestGet(), onRequestPost, onRequestGet, onRequestPost, onRequestDelete(), onRequestGet() (+46 more)

### Community 2 - "Dashboard Charts & PK"
Cohesion: 0.06
Nodes (46): ActiveLevelsCard(), inferEster(), Legend, mean(), SeriesPoint, STATUS_META, stdev(), bpInsight() (+38 more)

### Community 3 - "Injection Logging Flow"
Cohesion: 0.06
Nodes (47): View, SiteCombobox(), Symptom, ALL_SITES, COMMON_SITES, IM_QUICK_SITES, IM_SITES, QuickSite (+39 more)

### Community 4 - "Client Sync & API"
Cohesion: 0.07
Nodes (39): api, ApiError, ApiUser, AuthMe, LoginPayload, request(), safeJson(), SignupPayload (+31 more)

### Community 5 - "Local DB & Scheduling"
Cohesion: 0.07
Nodes (35): AnyRow, ApolloDatabase, fetchLocalSeed(), importBundledSeed(), LabResult, MetaRecord, Protocol, ProtocolCadence (+27 more)

### Community 6 - "Runtime Dependencies"
Cohesion: 0.05
Nodes (41): class-variance-authority, clsx, date-fns, dexie, dexie-react-hooks, lucide-react, motion, @noble/hashes (+33 more)

### Community 7 - "Lab Markers & Composites"
Cohesion: 0.08
Nodes (35): buildBlood(), buildCardio(), buildHormones(), buildHpta(), buildLatestMap(), buildLiver(), CompositePanel, CompositeRow() (+27 more)

### Community 8 - "PDF Lab Parsing & Toasts"
Cohesion: 0.07
Nodes (28): Shell(), handleLabPdfUpload(), titleFor(), DATE_LABELS, extractCollectionDate(), ExtractedMarker, extractMarkersFromText(), extractPdfText() (+20 more)

### Community 9 - "Dev Dependencies & Tooling"
Cohesion: 0.06
Nodes (33): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+25 more)

### Community 10 - "Timeline View"
Cohesion: 0.08
Nodes (27): BP_COLS, BpRow, bpStatus(), BpTone, Col, DataGrid(), Delta(), EventType (+19 more)

### Community 11 - "Health Import Bridge"
Cohesion: 0.10
Nodes (18): BodyMetric, bridge, HealthBridge, SyncRange, WebStubBridge, ATTR, commitHealthImport(), extractRecords() (+10 more)

### Community 12 - "TS Config (app)"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib (+15 more)

### Community 13 - "App Lock & Passphrase"
Cohesion: 0.14
Nodes (21): deriveHash(), encoder, fromBase64(), getLockConfig(), keys, LockConfig, setLockPassphrase(), timingSafeEqual() (+13 more)

### Community 14 - "TS Config (node)"
Cohesion: 0.10
Nodes (20): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+12 more)

### Community 15 - "UI Primitives (Card/Layout)"
Cohesion: 0.16
Nodes (15): Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle(), DialogOverlay() (+7 more)

### Community 16 - "Targets & Goals"
Cohesion: 0.16
Nodes (14): Targets, RangeBar(), Goal, MarkerTarget, weightSummary(), allMarkerMeta(), metaForKey(), computeProgress() (+6 more)

### Community 17 - "Insights & Correlations"
Cohesion: 0.19
Nodes (16): TestosteroneEster, activeTestosteroneAt(), buildAllWeightSeries(), buildCorrelationInsights(), buildTestosteroneCurve(), buildWeightDoseSeries(), CorrelationInsight, describeCorrelation() (+8 more)

### Community 18 - "shadcn Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 19 - "Theming & Bootstrap"
Cohesion: 0.18
Nodes (10): ErrorBoundary, applyTheme(), getChartColors(), getTheme(), saved, setTheme(), Theme, toggleTheme() (+2 more)

### Community 20 - "Dropdown Menu UI"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 21 - "Sign-In & Branding"
Cohesion: 0.22
Nodes (9): BrandMark(), BrandMarkProps, Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger(), AuthBundle (+1 more)

### Community 22 - "Select UI"
Cohesion: 0.18
Nodes (7): SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger()

### Community 23 - "Sheet UI"
Cohesion: 0.18
Nodes (7): SheetBody(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle()

### Community 24 - "Table UI"
Cohesion: 0.29
Nodes (9): Table(), TableBody(), TableCaption(), TableCell(), TableFooter(), TableHead(), TableHeader(), TableRow() (+1 more)

### Community 25 - "PWA Install Prompt"
Cohesion: 0.36
Nodes (7): BeforeInstallPromptEvent, detectPlatform(), InstallPrompt(), dismiss(), install(), isStandalone(), Platform

### Community 29 - "TS Config (root)"
Cohesion: 0.40
Nodes (4): compilerOptions, paths, files, references

### Community 30 - "File Row Actions"
Cohesion: 0.67
Nodes (3): ensureBlobAvailable(), FileRow(), open()

## Knowledge Gaps
- **221 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+216 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 315 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Primitives (Card/Layout)` to `App Shell, Settings & Export`, `Dashboard Charts & PK`, `Injection Logging Flow`, `Lab Markers & Composites`, `PDF Lab Parsing & Toasts`, `Timeline View`, `Targets & Goals`, `Dropdown Menu UI`, `Sign-In & Branding`, `Select UI`, `Sheet UI`, `Table UI`, `Tooltip UI`, `Trash & Restore`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `db` connect `App Shell, Settings & Export` to `Injection Logging Flow`, `Client Sync & API`, `Local DB & Scheduling`, `Timeline View`, `Health Import Bridge`, `App Lock & Passphrase`, `Targets & Goals`, `Table UI`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `VitalLog` connect `App Shell, Settings & Export` to `Dashboard Charts & PK`, `Injection Logging Flow`, `Local DB & Scheduling`, `Timeline View`, `Health Import Bridge`, `Insights & Correlations`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _221 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell, Settings & Export` be split into smaller, more focused modules?**
  _Cohesion score 0.052184769038701624 - nodes in this community are weakly interconnected._
- **Should `Backend API & Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.08324324324324324 - nodes in this community are weakly interconnected._
- **Should `Dashboard Charts & PK` be split into smaller, more focused modules?**
  _Cohesion score 0.055523085914669784 - nodes in this community are weakly interconnected._