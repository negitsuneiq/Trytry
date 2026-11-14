# Crawl report

Run: 2026-11-14T21:06:41.532Z  
User-Agent: `OpenLemmaBot/1.0 (+https://github.com/negitsuneiq/Trytry; non-commercial open-course-material index)`  
Policy: robots.txt obeyed; ≥ 2 s between requests per host; no LMS/SSO/login pages; PDFs only; English only.

Counts are crawl candidates. Only entries accepted in `data/curation.json` are published.

| # | University | HTML pages | PDFs checked | Host-eligible | Link-only | Skipped |
|---|---|---:|---:|---:|---:|---:|
| 1 | Massachusetts Institute of Technology | 177 | 1200 | 1124 | 12 | 64 |
| 2 | University of Oxford | 9 | 224 | 1 | 194 | 29 |
| 3 | University of Cambridge | 10 | 350 | 0 | 348 | 2 |
| 4 | Harvard University | 30 | 950 | 36 | 788 | 126 |
| 5 | Princeton University | 12 | 411 | 0 | 261 | 150 |
| 6 | Stanford University | 26 | 507 | 67 | 321 | 119 |
| 7 | University of California, Berkeley | 18 | 120 | 0 | 105 | 15 |
| 8 | Imperial College London | 9 | 277 | 0 | 224 | 53 |
| 9 | National University of Singapore | 10 | 71 | 0 | 71 | 0 |
| 10 | ETH Zurich | 5 | 51 | 0 | 39 | 12 |
| 11 | Sorbonne Université | 4 | 10 | 0 | 5 | 5 |
| 12 | Nanyang Technological University | 2 | 120 | 1 | 114 | 5 |
| 13 | University of California, Los Angeles | 11 | 120 | 0 | 15 | 105 |
| 14 | Peking University | 13 | 144 | 0 | 97 | 47 |
| 15 | University of Toronto | 2 | 15 | 0 | 15 | 0 |
| 16 | EPFL – École polytechnique fédérale de Lausanne | 2 | 51 | 0 | 41 | 10 |
| 17 | New York University | 18 | 250 | 0 | 156 | 94 |
| 18 | Université Paris-Saclay | 11 | 150 | 1 | 45 | 104 |
| 19 | California Institute of Technology | 13 | 408 | 0 | 223 | 185 |
| | **Total** | | **5434** | **1038** | **1786** | **2610** |

## Skip and link-only reasons

### Massachusetts Institute of Technology

- no extractable text (scanned?): 28
- language not confidently English: 14
- looks like student work: 13
- licence: link only: 12
- file says it is excluded from the open licence: 8
- language: it: 5
- duplicate (SHA-256): 2
- not a PDF (bad magic bytes): 1
- disallowed by robots.txt: 1
- not visited — deny-listed host (learn.mit.edu): 2222
- not visited — too many redirects: 1

### University of Oxford

- licence: link only: 194
- disallowed by robots.txt: 8
- duplicate (SHA-256): 5
- no extractable text (scanned?): 5
- language: es: 5
- language not confidently English: 4
- language: it: 1
- HTTP 404: 1
- not visited — login/portal path: 3
- not visited — deny-listed host (www.springer.com): 1
- not visited — deny-listed host (www.ams.org): 1

### University of Cambridge

- licence: link only: 348
- HTTP 403: 1
- HTTP 404: 1
- not visited — deny-listed host (www.vle.cam.ac.uk): 5
- not visited — disallowed by robots.txt: 4
- not visited — login/portal path: 2

### Harvard University

- licence: link only: 783
- no extractable text (scanned?): 38
- language not confidently English: 26
- duplicate (SHA-256): 20
- disallowed by robots.txt: 19
- HTTP 404: 17
- over 50 MB: link only: 5
- language: it: 4
- HTTP 403: 2
- not visited — deny-listed host (canvas.harvard.edu): 20
- not visited — deny-listed host (www.ams.org): 2
- not visited — deny-listed host (www.dropbox.com): 2
- not visited — deny-listed host (www.gradescope.com): 1

### Princeton University

- licence: link only: 261
- no extractable text (scanned?): 86
- HTTP 404: 46
- language not confidently English: 15
- encrypted PDF: 1
- language: it: 1
- HTTP 403: 1
- not visited — deny-listed host (moodle-app2.let.ethz.ch): 3
- not visited — deny-listed host (link.springer.com): 3
- not visited — deny-listed host (onlinelibrary.wiley.com): 1
- not visited — deny-listed host (eu.wiley.com): 1
- not visited — deny-listed host (www.cambridge.org): 1
- not visited — deny-listed host (piazza.com): 1

### Stanford University

- licence: link only: 321
- HTTP 404: 112
- no extractable text (scanned?): 6
- language not confidently English: 1
- not visited — disallowed by robots.txt: 10

### University of California, Berkeley

- licence: link only: 105
- no extractable text (scanned?): 10
- encrypted PDF: 2
- language: de: 1
- disallowed by robots.txt: 1
- language: fr: 1
- not visited — login/portal path: 1

### Imperial College London

- licence: link only: 224
- no extractable text (scanned?): 15
- HTTP 404: 14
- language not confidently English: 11
- language: es: 5
- language: it: 4
- looks like student work: 1
- disallowed by robots.txt: 1
- HTTP 300: 1
- not a PDF (bad magic bytes): 1

### National University of Singapore

- licence: link only: 71
- not visited — deny-listed host (canvas.nus.edu.sg): 8
- not visited — login/portal path: 7

### ETH Zurich

- licence: link only: 39
- language: de: 6
- language: fr: 1
- duplicate (SHA-256): 1
- HTTP 404: 1
- language not confidently English: 1
- language: it: 1
- no extractable text (scanned?): 1
- not visited — deny-listed host (www.cambridge.org): 1
- not visited — deny-listed host (bookstore.ams.org): 1
- not visited — deny-listed host (www.sciencedirect.com): 1

### Sorbonne Université

- licence: link only: 5
- language: fr: 3
- HTTP 404: 2
- not visited — deny-listed host (moodle-sciences-26.sorbonne-universite.fr): 2

### Nanyang Technological University

- licence: link only: 114
- HTTP 404: 2
- language: cjk: 1
- looks like student work: 1
- no extractable text (scanned?): 1
- not visited — deny-listed host (drive.google.com): 26
- not visited — deny-listed host (link.springer.com): 6
- not visited — deny-listed host (www.ams.org): 2
- not visited — deny-listed host (onlinelibrary.wiley.com): 2

### University of California, Los Angeles

- language not confidently English: 43
- no extractable text (scanned?): 34
- language: it: 19
- licence: link only: 15
- language: es: 5
- looks like student work: 2
- HTTP 404: 2

### Peking University

- licence: link only: 97
- HTTP 404: 45
- duplicate (SHA-256): 1
- disallowed by robots.txt: 1
- not visited — deny-listed host (link.springer.com): 4
- not visited — deny-listed host (www.cambridge.org): 3
- not visited — deny-listed host (www.sciencedirect.com): 1

### University of Toronto

- licence: link only: 15
- not visited — non-http scheme: 4

### EPFL – École polytechnique fédérale de Lausanne

- licence: link only: 41
- language: fr: 4
- language: es: 3
- language not confidently English: 2
- no extractable text (scanned?): 1
- not visited — deny-listed host (moodle.epfl.ch): 2

### New York University

- licence: link only: 156
- no extractable text (scanned?): 87
- disallowed by robots.txt: 3
- looks like student work: 2
- language not confidently English: 1
- not a PDF (bad magic bytes): 1
- not visited — deny-listed host (drive.google.com): 1
- not visited — deny-listed host (onlinelibrary.wiley.com): 1
- not visited — deny-listed host (ams.org): 1
- not visited — deny-listed host (link.springer.com): 1

### Université Paris-Saclay

- language: fr: 89
- licence: link only: 45
- HTTP 404: 10
- language not confidently English: 2
- no extractable text (scanned?): 1
- language: es: 1
- language: nl: 1
- not visited — deny-listed host (link.springer.com): 6
- not visited — deny-listed host (www.dropbox.com): 4
- not visited — deny-listed host (www.sciencedirect.com): 4
- not visited — deny-listed host (www.cambridge.org): 3
- not visited — deny-listed host (londmathsoc.onlinelibrary.wiley.com): 2
- not visited — deny-listed host (www.springer.com): 1
- not visited — deny-listed host (academic.oup.com): 1

### California Institute of Technology

- licence: link only: 223
- HTTP 404: 112
- no extractable text (scanned?): 38
- duplicate (SHA-256): 16
- language not confidently English: 11
- language: es: 3
- language: it: 2
- HTTP 403: 1
- disallowed by robots.txt: 1
- looks like student work: 1
- not visited — deny-listed host (www.ams.org): 42
- not visited — deny-listed host (piazza.com): 28
- not visited — deny-listed host (www.gradescope.com): 4
- not visited — deny-listed host (guides.gradescope.com): 4
- not visited — deny-listed host (www.piazza.com): 3
- not visited — deny-listed host (blackboard.usc.edu): 1

