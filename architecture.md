Yes. That is a **different and better data architecture** for your actual goal.

Instead of thinking:

> HTNO → search releases → aggregate temporary results

we can build a **Batch Result Repository**.

The idea is:

> **Identify a student batch once, collect all result releases belonging to that batch, and store Regular + Supplementary + RC/RV results together.**

Then when a user searches an HTNO, we mostly query **our database**, not JNTUH.

## 1. Core architecture

```text
                    JNTUH Result Releases
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Release Discovery   │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Batch Resolver      │
                 │                     │
                 │ Admission year      │
                 │ Regular/Lateral     │
                 │ Regulation          │
                 │ College/Branch      │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Batch Result Store  │
                 │                     │
                 │ Regular             │
                 │ Supplementary       │
                 │ RC/RV               │
                 └──────────┬──────────┘
                            │
                            ▼
                     Our Database
                            │
                  ┌─────────┴─────────┐
                  │                   │
              HTNO Search        Background Sync
                  │                   │
                  ▼                   ▼
              User UI             JNTUH Updates
```

---

# 2. What is a "batch"?

We need to define a batch carefully.

For example:

```text
2023 Regular R22
```

could represent students who:

```text
Admission year = 2023
Entry type = Regular
Regulation = R22
```

And:

```text
2024 Lateral R22
```

would be a separate batch because those students enter directly into II Year.

So:

```text
Batch
├── admissionYear
├── entryType
└── regulation
```

Example:

```json
{
  "batchId": "2023-REG-R22",
  "admissionYear": 2023,
  "entryType": "REGULAR",
  "regulation": "R22"
}
```

and:

```json
{
  "batchId": "2024-LAT-R22",
  "admissionYear": 2024,
  "entryType": "LATERAL",
  "regulation": "R22"
}
```

---

# 3. The important part: store releases under the batch

Now your architecture becomes:

```text
2023 Regular R22
│
├── I-I
│   └── Regular
│       └── examCode XXXXX
│
├── I-II
│   └── Regular
│       └── examCode XXXXX
│
├── II-I
│   ├── Regular
│   │   └── examCode XXXXX
│   │
│   └── Supplementary
│       └── examCode XXXXX
│
├── II-II
│   ├── Regular
│   └── Supplementary
│
├── III-I
│   ├── Regular
│   ├── Supplementary
│   └── RC/RV
│
├── III-II
│   ├── Regular
│   ├── Supplementary
│   └── RC/RV
│
├── IV-I
│   ├── Regular
│   ├── Supplementary
│   └── RC/RV
│
└── IV-II
    ├── Regular
    ├── Supplementary
    └── RC/RV
```

This is much closer to what you want.

---

# 4. But don't store only exam codes

We should store the **release itself**.

For example:

```json
{
  "releaseId": "1964",
  "batchId": "2023-REG-R22",

  "semester": "III-II",

  "examType": "REGULAR",

  "examPeriod": "APR-2026",

  "request": {
    "degree": "btech",
    "etype": "r17",
    "type": "intgrade"
  },

  "rcRv": {
    "available": true,
    "request": {
      "degree": "btech",
      "etype": "r17",
      "result": "gradercrv",
      "type": "rcrvintgrade"
    }
  }
}
```

This allows us to retrieve both normal and RC/RV results for the same release.

Your JNTUH listing actually demonstrates this pattern: `1964` has the normal result request and an RC/RV variant with `result=gradercrv&type=rcrvintgrade`.  

---

# 5. Now the database becomes powerful

I'd use a relational database such as PostgreSQL.

### Tables

```text
batches
   │
   ├── batch_releases
   │          │
   │          └── release_variants
   │
   └── students
              │
              └── student_results
                         │
                         └── subjects
```

More concretely:

```text
batches
│
├── releases
│
├── students
│
└── results
```

---

# 6. `batches` table

```sql
CREATE TABLE batches (
    id BIGSERIAL PRIMARY KEY,

    admission_year INT NOT NULL,

    entry_type VARCHAR(20) NOT NULL,

    regulation VARCHAR(10) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
        admission_year,
        entry_type,
        regulation
    )
);
```

Example:

```text
id | admission_year | entry_type | regulation
------------------------------------------------
1  | 2023           | REGULAR    | R22
2  | 2024           | LATERAL    | R22
3  | 2024           | REGULAR    | R22
```

---

# 7. `releases` table

This represents a JNTUH examination release.

```sql
CREATE TABLE releases (
    id BIGSERIAL PRIMARY KEY,

    exam_code VARCHAR(20) NOT NULL UNIQUE,

    semester_year INT NOT NULL,
    semester_number INT NOT NULL,

    regulation VARCHAR(10) NOT NULL,

    exam_type VARCHAR(20) NOT NULL,

    exam_month VARCHAR(20),
    exam_year INT,

    publication_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Example:

```text
exam_code | semester | regulation | type
------------------------------------------
1964      | III-II   | R22        | REGULAR
1945      | III-II   | R22        | SUPPLEMENTARY
1942      | III-I    | R22        | REGULAR
```

---

# 8. `batch_releases`

This is the key table.

It connects a release to a batch.

```sql
CREATE TABLE batch_releases (
    batch_id BIGINT REFERENCES batches(id),
    release_id BIGINT REFERENCES releases(id),

    PRIMARY KEY (batch_id, release_id)
);
```

So:

```text
2023 REGULAR R22
        │
        ├── 1964
        ├── 1945
        ├── 1942
        └── ...
```

And:

```text
2024 LATERAL R22
        │
        ├── different releases
        ├── ...
```

This is exactly the grouping you are asking for.

---

# 9. But supplementary needs one more concept

A supplementary release isn't necessarily the regular release of the same semester.

Therefore:

```text
batch
  ↓
release
  ↓
semester
  ↓
attempt type
```

Example:

```text
2023 REGULAR R22
│
└── III-II
    │
    ├── Regular
    │   └── 1964
    │
    └── Supplementary
        └── 197X
```

The release itself contains the semester and exam type.

---

# 10. RC/RV should belong to the release

Don't create:

```text
1964
1964-RCRV
```

as two independent releases.

Instead:

```text
Release 1964
│
├── Original
│   └── intgrade
│
└── RC/RV
    └── rcrvintgrade
```

So we can have:

```sql
CREATE TABLE release_variants (
    id BIGSERIAL PRIMARY KEY,

    release_id BIGINT REFERENCES releases(id),

    variant_type VARCHAR(20) NOT NULL,

    etype VARCHAR(20),

    result_param VARCHAR(50),

    request_type VARCHAR(50)
);
```

Example:

```text
release_id | variant | type
--------------------------------
1964       | ORIGINAL | intgrade
1964       | RCRV     | rcrvintgrade
```

---

# 11. Then store actual student results

This is the part that makes your website extremely fast.

```sql
CREATE TABLE students (
    id BIGSERIAL PRIMARY KEY,

    htno VARCHAR(20) UNIQUE NOT NULL,

    batch_id BIGINT REFERENCES batches(id),

    name VARCHAR(200),
    father_name VARCHAR(200),
    college_code VARCHAR(20)
);
```

Then:

```sql
CREATE TABLE student_results (
    id BIGSERIAL PRIMARY KEY,

    student_id BIGINT REFERENCES students(id),

    release_id BIGINT REFERENCES releases(id),

    variant_id BIGINT REFERENCES release_variants(id),

    result_status VARCHAR(30),

    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(student_id, release_id, variant_id)
);
```

And subjects:

```sql
CREATE TABLE result_subjects (
    id BIGSERIAL PRIMARY KEY,

    student_result_id BIGINT REFERENCES student_results(id),

    subject_code VARCHAR(50),
    subject_name TEXT,

    internal INT,
    external INT,
    total INT,

    grade VARCHAR(10),
    credits DECIMAL(5,2)
);
```

---

# 12. Now your search becomes VERY simple

User:

```text
23E31A0586
```

Backend:

```text
HTNO
 ↓
students
 ↓
batch_id
 ↓
batch_releases
 ↓
student_results
 ↓
result_subjects
```

No need to scan JNTUH every time.

For example:

```text
23E31A0586
      │
      ▼
2023-REG-R22
      │
      ├── I-I
      │   └── Regular
      │
      ├── I-II
      │   └── Regular
      │
      ├── II-I
      │   ├── Regular
      │   └── Supplementary
      │
      ├── II-II
      │   └── Regular
      │
      ├── III-I
      │   ├── Regular
      │   └── Supplementary
      │
      └── III-II
          ├── Regular
          ├── Supplementary
          └── RC/RV
```

---

# 13. JNTUH becomes a background data source

This is the biggest architectural change.

Instead of:

```text
User
 ↓
JNTUH
 ↓
Result
```

we use:

```text
                     JNTUH
                       │
                       ▼
                Background Sync
                       │
                       ▼
               Our PostgreSQL
                       │
                       ▼
                     User
```

The user interacts primarily with **your database**.

---

# 14. Background synchronization

We create a separate worker:

```text
workers/
    releaseSync.worker.js
    resultSync.worker.js
```

### Release sync

Periodically:

```text
JNTUH result listing
        ↓
Find new examCode
        ↓
Parse release
        ↓
Determine associated batch
        ↓
Store release
```

### Result sync

For a batch:

```text
2023-REG-R22
        ↓
Get its releases
        ↓
Fetch student results
        ↓
Store valid results
```

However, we need to be careful here:

**We cannot enumerate every student's HTNO and scrape JNTUH indiscriminately.**

Instead, when a student searches for the first time, we can populate that student's result history. Then subsequent searches are database reads.

---

# 15. First search vs subsequent search

### First search

```text
User enters HTNO
        ↓
Find student?
        │
       NO
        ↓
Parse HTNO
        ↓
Determine batch
        ↓
Get batch releases
        ↓
Query JNTUH for relevant releases
        ↓
Store valid results
        ↓
Return result
```

### Second search

```text
User enters same HTNO
        ↓
students table
        ↓
student_results
        ↓
PostgreSQL
        ↓
Return
```

**Zero JNTUH requests.**

---

# 16. What happens when JNTUH publishes a new supply?

This is where the architecture becomes useful.

Suppose JNTUH publishes:

```text
1979
I-II R22 Supplementary
June 2026
```

The release sync discovers:

```text
1979
```

Then:

```text
JNTUH
 ↓
Release Discovery
 ↓
New Release
 ↓
Which batches can this release belong to?
 ↓
2023 Regular R22
2024 Regular R22
...
```

We associate it with the relevant batches.

Then when a student from that batch searches:

```text
HTNO
 ↓
batch
 ↓
new release
 ↓
JNTUH
 ↓
result
 ↓
store
```

---

# 17. Important: Batch should not contain actual results

I recommend:

```text
Batch
   ↓
Release
   ↓
Student Result
   ↓
Subjects
```

rather than putting a huge JSON object inside `batches`.

Don't do:

```json
{
  "batch": "2023-REG-R22",
  "results": {
      "23E31A0001": {...},
      "23E31A0002": {...},
      "23E31A0003": {...}
  }
}
```

That becomes difficult to update and query.

Use relational relationships.

---

# 18. Final database relationship

```text
                    ┌──────────────┐
                    │    BATCH     │
                    │              │
                    │ 2023 REG R22 │
                    └──────┬───────┘
                           │
                    batch_releases
                           │
                           ▼
                    ┌──────────────┐
                    │   RELEASE    │
                    │              │
                    │ examCode 1964│
                    │ III-II       │
                    │ R22          │
                    │ Regular      │
                    └──────┬───────┘
                           │
                    release_variant
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
             Original             RC/RV
             intgrade             rcrv...
                  │                 │
                  └────────┬────────┘
                           │
                     student_result
                           │
                           ▼
                    ┌──────────────┐
                    │    STUDENT   │
                    │              │
                    │ 23E31A0586   │
                    └──────┬───────┘
                           │
                     result_subject
                           │
                           ▼
                    ┌──────────────┐
                    │   SUBJECT    │
                    │              │
                    │ code         │
                    │ marks        │
                    │ grade        │
                    │ credits      │
                    └──────────────┘
```

## This is the architecture I think you are actually asking for

The hierarchy becomes:

```text
BATCH
│
├── Student A
├── Student B
├── Student C
│
└── Result Releases
    │
    ├── I-I Regular
    ├── I-II Regular
    ├── II-I Regular
    ├── II-I Supply
    ├── II-II Regular
    ├── III-I Regular
    ├── III-I Supply
    ├── III-II Regular
    ├── III-II Supply
    ├── III-II RC/RV
    ├── IV-I Regular
    ├── IV-I Supply
    └── IV-II Regular
```

**One correction to the wording:** I would not literally store "all students' result data under a batch" as one giant batch document. Store the **batch relationship** centrally, and store releases/results in normalized tables linked to that batch. That gives you the exact batch-oriented behavior you want without creating an unmanageable data structure.
