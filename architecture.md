Yes. Based on your requirements, I would **not** design this as “search every examCode for every HTNO.” That will create unnecessary JNTUH requests.

The better architecture is a **two-level system**:

1. **Global JNTUH examination catalog** — continuously maintains all B.Tech examCodes.
2. **Student/cohort-specific search pattern** — determines which of those examCodes are relevant to a particular HTNO and stops searching as soon as the student's result history proves that further searches are unnecessary.

JNTUH's current results portal shows that releases can combine multiple categories—for example, regular/supplementary and RC/RV—and releases happen for different semesters and batches at different times. [JNTUH Results](https://results3.jntuh.ac.in/?utm_source=chatgpt.com)

## 1. Overall architecture

```text
                         ┌──────────────────────────┐
                         │   JNTUH Official Site    │
                         │ Results + Notifications  │
                         └────────────┬─────────────┘
                                      │
                         Every 24 hours / manual
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │ JNTUH Examination Catalog       │
                    │                                 │
                    │ examCode                        │
                    │ semester                        │
                    │ regulation                      │
                    │ examType                        │
                    │ releaseDate                     │
                    │ source URL                      │
                    │ status                           │
                    └────────────────┬────────────────┘
                                     │
                                     │
             ┌───────────────────────┴────────────────────────┐
             │                                                │
             ▼                                                ▼
      ┌───────────────┐                              ┌────────────────┐
      │ HTNO Parser   │                              │ Result Cache   │
      │               │                              │                │
      │ admissionYear │                              │ student result │
      │ collegeCode   │                              │ subjects       │
      │ entryType     │                              │ attempts       │
      │ course        │                              │ fetchedAt      │
      │ branch        │                              └────────────────┘
      └───────┬───────┘
              │
              ▼
      ┌─────────────────────┐
      │ Student Search      │
      │ Pattern / Cohort    │
      └──────────┬──────────┘
                 │
                 ▼
      ┌─────────────────────┐
      │ Relevant Releases   │
      │ only                │
      └──────────┬──────────┘
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
     Regular   Supply    RC/RV
        │        │        │
        └────────┼────────┘
                 ▼
       ┌───────────────────┐
       │ Search + Decision │
       │ Engine            │
       └─────────┬─────────┘
                 │
                 ▼
          Final Student Result
```

---

# 2. Most important concept: Examination Catalog

Do **not** store examCodes only inside student records.

Create a global table:

### `jntuh_exam_releases`

```text
id
exam_code
degree
regulation
year
semester
exam_type
exam_month
exam_year
release_date
result_url
source
is_active
first_seen_at
last_seen_at
```

Example:

```text
exam_code: 1964
degree: BTECH
regulation: R22
year: III
semester: II
exam_type: REGULAR
exam_month: APRIL
exam_year: 2026
```

Another:

```text
exam_code: 1965
degree: BTECH
regulation: R18
year: III
semester: II
exam_type: SUPPLY
exam_month: APRIL
exam_year: 2026
```

But **do not assume examCode itself tells you regulation/type**.

Your catalog scraper should obtain this information from the JNTUH release listing/metadata.

That is important because JNTUH can publish different examination activities around the same period, and its official portal currently shows releases such as B.Tech regular/supplementary/RC-RV combinations. [JNTUH Results](https://results3.jntuh.ac.in/?utm_source=chatgpt.com)

---

# 3. Update the examination catalog every 24 hours

You specifically want:

> no need to search for examcodes everytime

Correct.

Create a background job:

```text
Every 24 hours
       ↓
Open JNTUH results page
       ↓
Extract B.Tech releases
       ↓
Compare with database
       ↓
New examCode?
   ├── YES → INSERT
   └── NO  → UPDATE last_seen_at
       ↓
Mark old records appropriately
```

For example:

```text
02:00 AM every day

JNTUH Scanner
     ↓
B.Tech releases
     ↓
1964 exists
1965 exists
1966 exists
...
1983 exists
1984 NEW
     ↓
INSERT 1984
```

So a student search **never needs to scrape the JNTUH release page**.

It only queries your database.

JNTUH's official results portal itself publishes the result announcements, while its examination portal also publishes examination notifications, so these can be separate sources in your catalog-ingestion layer. [JNTUH Results](https://results3.jntuh.ac.in/?utm_source=chatgpt.com)

---

# 4. But don't create one giant examCode list for every student

This is where your **pattern system** becomes important.

For example:

```text
23E31A0586
```

Parse it into:

```text
Admission Year = 23
College        = E3
Entry Type     = Regular
Course         = 1
Branch         = A0
Serial         = 86
```

Your student pattern should ignore the serial number.

So:

```text
23E31A0586
23E31A0587
23E31A0588
23E31A0589
```

belong to the same search pattern.

---

# 5. Create `htno_groups`

I recommend this table:

```text
htno_groups
```

### Fields

```text
id
admission_year
college_code
entry_type
course_code
branch_code
regulation
group_key

first_discovered_at
last_updated_at
status
```

Example:

```text
admission_year = 23
college_code   = E3
entry_type     = REGULAR
course_code    = 1
branch_code    = A0
regulation     = R22

group_key =
23-E3-REGULAR-1-A0-R22
```

Now:

```text
23E31A0586
23E31A0587
23E31A0588
23E31A0589
```

all use:

```text
23-E3-REGULAR-1-A0-R22
```

---

# 6. Store the search pattern separately

Create:

```text
group_result_candidates
```

Example:

```text
group_id
release_id
semester
attempt_type
priority
status
discovered_from
last_verified_at
```

Suppose the group is:

```text
23-E3-REGULAR-1-A0-R22
```

It might eventually learn:

```text
I-I
    REGULAR → 1801

I-II
    REGULAR → 1850
    SUPPLY  → 1870

II-I
    REGULAR → 1900
    SUPPLY  → 1920

II-II
    REGULAR → 1950
    SUPPLY  → 1960
    RC/RV   → 1961

III-I
    REGULAR → 1930
    SUPPLY  → 1940
    RC/RV   → 1941

III-II
    REGULAR → 1964
    SUPPLY  → 1965
    RC/RV   → 1964/related release
```

These numbers are just architectural examples—not a claim that those codes correspond to all of those categories.

---

# 7. Very important: same examCode can cover multiple student cohorts

Your architecture should therefore **not** do this:

```text
student
   ↓
examCode
```

Instead:

```text
JNTUH Release
       │
       ├── cohort/group A
       ├── cohort/group B
       ├── cohort/group C
       └── ...
```

Because one JNTUH release can contain results for multiple groups.

Your release should be a **global object**.

Your group determines whether that release is relevant.

This is especially important because JNTUH's announcements can combine regular/supplementary categories and different semester activities in a single published release. [JNTUH Results](https://results3.jntuh.ac.in/?utm_source=chatgpt.com)

---

# 8. The search engine should be stateful

This is the biggest improvement I recommend.

Don't simply:

```text
for examCode in examCodes:
    search()
```

Instead:

```text
Student Search State
```

Maintain something like:

```text
student_progress
```

```text
student_id

current_semester
last_successful_regular
last_successful_supply

failed_subject_count

has_pending_supply
has_pending_rcrv

search_status
```

---

# 9. First search MUST be I-I Regular

You specifically requested:

> first search 1 year 1 semester regular

Correct.

The algorithm should be:

```text
HTNO
 ↓
Parse HTNO
 ↓
Determine expected regulation/cohort
 ↓
Find I-I Regular releases
 ↓
Search actual HTNO
```

If no result:

```text
NO I-I REGULAR RESULT
        ↓
Invalid HTNO
        ↓
STOP
```

Do **not** search:

```text
I-II
II-I
II-II
Supply
RC/RV
```

because the HTNO has already failed the fundamental validation.

---

# 10. After I-I Regular succeeds

Now the HTNO is proven to exist.

Suppose:

```text
I-I Regular
       ↓
FOUND
```

Then:

```text
I-II Regular
       ↓
search
```

Then:

```text
II-I Regular
       ↓
search
```

and so on.

Conceptually:

```text
I-I Regular
    │
    ├── NOT FOUND → INVALID HTNO → STOP
    │
    └── FOUND
         ↓
      I-II Regular
         ↓
      II-I Regular
         ↓
      II-II Regular
         ↓
      III-I Regular
         ↓
      III-II Regular
         ↓
      IV-I Regular
         ↓
      IV-II Regular
```

But there is an important optimization.

---

# 11. Don't search future semesters unnecessarily

Suppose the student entered:

```text
23E31A0586
```

and currently only III-II results are expected to exist.

You don't want:

```text
IV-II
IV-I
III-II
III-I
...
```

randomly.

Your catalog knows:

```text
release semester
release date
academic year
regulation
```

Therefore your search engine should know which semesters **could currently exist** for that admission year.

---

# 12. Regular result is the backbone

For each semester:

```text
REGULAR
   ↓
student found?
```

If yes:

```text
store result
analyze subjects
```

Then determine whether supplementary search is required.

---

# 13. Your supply optimization is very good

Suppose:

```text
III-I Regular
```

result:

```text
Java       A
DBMS       A
Networks   B
OS         B
AI         A
```

No failed subjects.

Therefore:

```text
failedSubjects = 0
```

Then:

```text
DO NOT SEARCH SUPPLY
DO NOT SEARCH RC/RV
```

Excellent optimization.

---

# 14. If there are failed subjects

Example:

```text
III-I Regular

Java       A
DBMS       F
Networks   B
OS         F
AI         A
```

Then:

```text
failedSubjects = 2
```

Now search relevant supplementary releases.

But only for that semester/failed subjects.

```text
III-I
   │
   ├── Regular → FOUND
   │
   ├── Failed subjects = 2
   │
   └── Search Supply
```

---

# 15. After first supply

Suppose supply result:

```text
DBMS → C
OS   → B
```

Now:

```text
failedSubjects = 0
```

Therefore:

```text
STOP SUPPLY SEARCH
STOP RC/RV SEARCH
```

This is exactly what you want.

---

# 16. Student with multiple supplies

Another student:

```text
Regular
 ↓
3 failed
 ↓
Supply #1
 ↓
1 failed
 ↓
Supply #2
 ↓
0 failed
 ↓
STOP
```

Your system therefore doesn't have a fixed number of searches.

It dynamically determines:

```text
How many attempts are necessary?
```

This is much better than:

```text
Search all supply examCodes.
```

---

# 17. RC/RV should be conditional

You said:

> rcrv is applicable for only failed subjects

So your engine should have:

```text
if failedSubjects.length === 0:
    skip RC/RV
```

If:

```text
failedSubjects.length > 0
```

then RC/RV candidates become eligible.

But there is another important distinction:

### RC/RV shouldn't automatically be searched immediately.

A better model is:

```text
Regular
   ↓
F subjects
   ↓
Supply
   ↓
Still F?
   ↓
RC/RV candidate
```

The exact availability should come from your release catalog.

---

# 18. Search state machine

I recommend implementing the student search as a state machine.

```text
START
  │
  ▼
VALIDATE HTNO FORMAT
  │
  ▼
I-I REGULAR
  │
  ├── NOT FOUND → INVALID
  │
  ▼
I-I RESULT
  │
  ▼
ANALYZE FAILURES
  │
  ├── PASS → NEXT SEMESTER
  │
  └── FAIL
        │
        ▼
      SUPPLY
        │
        ├── PASS → NEXT SEMESTER
        │
        └── FAIL
              │
              ▼
            NEXT SUPPLY
              │
              └── ...
```

Eventually:

```text
FAIL
 ↓
RC/RV eligible?
 ↓
YES
 ↓
RC/RV
 ↓
Re-evaluate result
```

---

# 19. But there is one major problem: "same year = same examCodes"

I would **not** make the rule simply:

```text
Admission year 23
       ↓
same examCodes
```

That is too broad.

Use:

```text
Admission Year
+
Entry Type
+
Regulation
+
College
+
Course
+
Branch
```

as your initial pattern.

For example:

```text
23-E3-REGULAR-1-A0-R22
```

and:

```text
23-E3-LATERAL-1-A0-R22
```

should not automatically share the same student search pattern.

However, they can still point to the **same global JNTUH release** if that release actually serves both groups.

---

# 20. Separate "release" from "student applicability"

This distinction will make your architecture much cleaner.

### Release

```text
examCode = 1964
```

means:

> JNTUH published a particular result release.

### Applicability

means:

> Which student groups can have results in this release?

Therefore:

```text
jntuh_exam_releases
        │
        ▼
release_applicability
        │
        ├── 23-E3-REGULAR-...
        ├── 23-E3-LATERAL-...
        └── ...
```

This solves your:

> regular new academic batch + supply previous batch on same day / same examCode

problem.

---

# 21. Recommended final database

I would use these tables:

```text
┌─────────────────────────┐
│ jntuh_exam_releases     │
├─────────────────────────┤
│ id                      │
│ exam_code               │
│ degree                  │
│ regulation              │
│ year                    │
│ semester                │
│ exam_type               │
│ exam_month              │
│ exam_year               │
│ release_date            │
│ source_url              │
│ first_seen_at           │
│ last_seen_at            │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│ release_applicability   │
├─────────────────────────┤
│ release_id              │
│ group_id                │
│ confidence              │
│ verified                │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│ htno_groups             │
├─────────────────────────┤
│ id                      │
│ admission_year          │
│ college_code            │
│ entry_type              │
│ course_code             │
│ branch_code             │
│ regulation              │
│ group_key               │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│ students                │
├─────────────────────────┤
│ id                      │
│ htno                    │
│ group_id                │
│ name                    │
│ father_name             │
│ college_code            │
│ first_verified_at       │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│ student_results         │
├─────────────────────────┤
│ id                      │
│ student_id              │
│ release_id              │
│ semester                │
│ attempt_type            │
│ result_status           │
│ failed_subject_count    │
│ fetched_at              │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│ result_subjects         │
├─────────────────────────┤
│ result_id               │
│ subject_code            │
│ subject_name            │
│ internal                │
│ external                │
│ total                   │
│ grade                   │
│ credits                 │
└─────────────────────────┘
```

And additionally:

```text
student_search_state
```

for the optimization engine.

---

# 22. `student_search_state`

Something like:

```text
student_id

last_regular_semester

last_completed_semester

pending_failed_subjects

supply_attempts

rcrv_required

search_completed

search_version

updated_at
```

Example:

```text
23E31A0586

last_regular_semester = III-II

pending_failed_subjects = 0

supply_attempts = 1

rcrv_required = false

search_completed = true
```

Next time the same student searches:

```text
DB/cache
 ↓
already completely processed
 ↓
return stored results
```

**No JNTUH request.**

---

# 23. Search algorithm

The complete algorithm becomes:

```text
USER ENTERS HTNO
        │
        ▼
Check browser localStorage
        │
   ┌────┴────┐
   │         │
 HIT       MISS
   │         │
   ▼         ▼
Return      Backend
cached        │
              ▼
        Check student DB
              │
       ┌──────┴──────┐
       │             │
    COMPLETE       NEW
       │             │
       ▼             ▼
    Return       Parse HTNO
                     │
                     ▼
                Find HTNO group
                     │
                     ▼
              Get candidate releases
                     │
                     ▼
             I-I REGULAR FIRST
                     │
              ┌──────┴──────┐
              │             │
           NOT FOUND       FOUND
              │             │
              ▼             ▼
          INVALID        Save result
          STOP               │
                             ▼
                      Analyze subjects
                             │
                     ┌───────┴────────┐
                     │                │
                   PASS             FAIL
                     │                │
                     ▼                ▼
               Next regular        Supply
                                      │
                                ┌─────┴─────┐
                                │           │
                              PASS        FAIL
                                │           │
                                ▼           ▼
                           Next sem.    Next supply
                                              │
                                              ▼
                                           Repeat
                                              │
                                              ▼
                                       Still failed?
                                              │
                                              ▼
                                           RC/RV
```

---

# 24. Important optimization: candidate priority

Don't store candidates as an unordered list.

Store priority.

Example:

```text
priority 1 → current regular
priority 2 → previous supply
priority 3 → latest supply
priority 4 → RC/RV
```

But more specifically:

```text
III-I

REGULAR
   ↓
SUPPLY-1
   ↓
SUPPLY-2
   ↓
RC/RV
```

Your database can know the order.

---

# 25. How the system learns the pattern

Suppose the first user:

```text
23E31A0586
```

searches.

The system discovers:

```text
23-E3-REGULAR-1-A0-R22
```

and searches relevant releases.

Suppose it finds:

```text
I-I Regular       → 1801
I-II Regular      → 1850
II-I Regular      → 1900
II-II Regular     → 1950
III-I Regular     → 1930
III-II Regular    → 1964
```

It stores that pattern.

Then another user:

```text
23E31A0512
```

comes.

Instead of scanning all 200+ B.Tech examCodes:

```text
ALL EXAMCODES
   ↓
200+
```

you do:

```text
23-E3-REGULAR-1-A0-R22
             ↓
       known candidates
             ↓
        10–20 releases
```

Much faster.

---

# 26. But never trust the pattern blindly

This is extremely important.

Suppose:

```text
23E31A0586 → pattern A
23E31A0587 → pattern A
```

You must **still submit the actual HTNO** to JNTUH.

Do NOT do:

```text
pattern match
    ↓
assume student has result
```

Instead:

```text
pattern match
      ↓
candidate examCode
      ↓
actual HTNO → JNTUH
      ↓
actual result?
```

This prevents accidentally showing another student's result.

---

# 27. Two caching levels

Your system should have **three** caches.

### Level 1 — Browser

```text
localStorage
```

Fastest.

```text
HTNO → complete result
```

---

### Level 2 — Server/database

```text
student_results
```

If the same student searches from another device:

```text
DB → result
```

No JNTUH request.

---

### Level 3 — JNTUH release catalog

```text
jntuh_exam_releases
```

This prevents repeatedly discovering examCodes.

So:

```text
Browser Cache
      ↓ miss
Server Cache
      ↓ miss
Student Search Pattern
      ↓
Exam Release Catalog
      ↓
JNTUH
```

That's the architecture I'd use.

---

# 28. 24-hour catalog updater

Create a cron/background job:

```text
┌──────────────────────────┐
│ Every 24 hours           │
└────────────┬─────────────┘
             ▼
      JNTUH Result Portal
             ▼
      Extract B.Tech data
             ▼
      Normalize releases
             ▼
      Compare exam_codes
             ▼
     ┌───────┴────────┐
     │                │
   Existing           New
     │                │
     ▼                ▼
 update             insert
 last_seen          release
```

You should also keep:

```text
catalog_sync_log
```

with:

```text
started_at
completed_at
records_found
new_records
updated_records
failed
error
```

This lets you know whether your 24-hour crawler actually worked.

---

# 29. Don't rely only on result-page scraping

Use two official JNTUH sources:

### Result release source

The JNTUH results portal publishes result announcements and dates. [JNTUH Results](https://results3.jntuh.ac.in/?utm_source=chatgpt.com)

### Examination notification source

The university examination portal publishes B.Tech examination notifications, including regular/supply examinations. [JNTUH Exams](https://exams1.jntuh.ac.in/Portal/common/load?utm_source=chatgpt.com)

So your ingestion architecture can eventually be:

```text
JNTUH Result Portal
        │
        ├── result release metadata
        │
        ▼
JNTUH Catalog

JNTUH Exam Portal
        │
        ├── exam notification metadata
        │
        ▼
Exam Schedule/Context
```

This makes your catalog more reliable than trying to infer everything solely from an `examCode`.

---

# 30. Final architecture I recommend

```text
                         JNTUH
                           │
              ┌────────────┴────────────┐
              │                         │
       Results Portal             Exam Portal
              │                         │
              └────────────┬────────────┘
                           │
                     Catalog Worker
                       every 24h
                           │
                           ▼
                ┌─────────────────────┐
                │ JNTUH Exam Catalog  │
                │                     │
                │ ALL B.Tech releases │
                └──────────┬──────────┘
                           │
                           │
USER HTNO ────────────────►│
                           │
                           ▼
                  ┌────────────────┐
                  │ HTNO Parser    │
                  └───────┬────────┘
                          │
                          ▼
                  ┌────────────────┐
                  │ HTNO Group     │
                  │ / Pattern      │
                  └───────┬────────┘
                          │
                          ▼
                Relevant Releases
                          │
                          ▼
                ┌──────────────────┐
                │ Search State     │
                │ Machine          │
                └────────┬─────────┘
                         │
             ┌───────────┼────────────┐
             ▼           ▼            ▼
          Regular      Supply       RC/RV
             │           │            │
             └───────────┼────────────┘
                         ▼
                   Actual HTNO
                         │
                         ▼
                       JNTUH
                         │
                         ▼
                  Parse Result
                         │
                         ▼
                 Analyze Failures
                         │
                         ▼
               Update Search State
                         │
                         ▼
                 Save in Database
                         │
                         ▼
                  Return Results
```

### The key principle

**The catalog tells you what examCodes exist.**

**The HTNO pattern tells you which releases are probably relevant.**

**The actual student's result tells you whether to continue.**

**The student's subject status tells you whether Supply/RC-RV is necessary.**

That gives you a system that adapts to both:

```text
Student A
I-I → I-II → II-I → II-II
all pass
STOP
```

and:

```text
Student B
I-I → I-II → supply → supply
        ↓
      pass
        ↓
II-I → fail
        ↓
supply
        ↓
RC/RV
        ↓
pass
        ↓
next semester
```

without blindly searching every examCode.

Also, JNTUH's current public data demonstrates why the catalog needs to be dynamic: recent announcements include separate B.Tech releases for I-I, I-II, II-I, II-II, III-I, III-II, IV-I and IV-II, with regular, supplementary, advanced-supply and RC/RV variants appearing at different times. [JNTUH Results](https://results3.jntuh.ac.in/?utm_source=chatgpt.com)

**I would build this architecture before writing more scraper logic.** The next concrete step should be designing the exact **PostgreSQL schema + relationships + indexes + search-state algorithm**, because that will determine how efficiently the backend can perform these adaptive searches.