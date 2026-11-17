## 1. The limits

- [x] 1.1 `maxAlbums` 50,000 and `maxMemberships` 100,000; the API's request limit 8 MiB (design decisions 1 and 2).
- [x] 1.2 The domain, database and browser tests that state the numbers: the refusal at 50,000, the entry limit at 100,000, and the meter's "2 of 50,000 albums · 1 in Trash".

## 2. Measuring at 50,000

- [x] 2.1 `scaledWorkload` and `WORKLOAD_ALBUMS` in the seeder, with a test that the full workload keeps within the other limits (design decision 4).
- [x] 2.2 Fix `test:verify`'s sign-in (design decision 5). Run `test:perf` and `test:verify` once at 50,000 albums and at 5,000, record the numbers in the performance report, and file what's slow.

## 3. Words

- [x] 3.1 FR-15.1, Q-01, AC-32, section 8 and the change log; TS-18, TS-120 and the TON-95 note; DS-98; the README and the break-ui catalog.
