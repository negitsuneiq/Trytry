# Crawl report

Run: 2026-10-29T01:36:33.514Z  
User-Agent: `OpenLemmaBot/1.0 (+https://github.com/negitsuneiq/Trytry; non-commercial open-course-material index)`  
Policy: robots.txt obeyed; ≥ 2 s between requests per host; no LMS/SSO/login pages; PDFs only; English only.

Counts are crawl candidates. Only entries accepted in `data/curation.json` are published.

| # | University | HTML pages | PDFs checked | Host-eligible | Link-only | Skipped |
|---|---|---:|---:|---:|---:|---:|
| 1 | Massachusetts Institute of Technology | 257 | 300 | 279 | 1 | 20 |
| 2 | University of Oxford | 4 | 94 | 0 | 76 | 18 |
| 3 | University of Cambridge | 19 | 350 | 0 | 341 | 9 |
| 4 | Harvard University | 18 | 450 | 34 | 310 | 106 |
| 5 | Princeton University | 4 | 320 | 0 | 206 | 114 |
| 6 | Stanford University | 10 | 107 | 0 | 64 | 43 |
| 7 | University of California, Berkeley | 18 | 120 | 0 | 105 | 15 |
| 8 | Imperial College London | 4 | 73 | 0 | 54 | 19 |
| 9 | National University of Singapore | 10 | 71 | 0 | 71 | 0 |
| 10 | ETH Zurich | 5 | 51 | 0 | 39 | 12 |
| 11 | Sorbonne Université | 4 | 10 | 0 | 5 | 5 |
| 12 | Nanyang Technological University | 1 | 46 | 0 | 43 | 3 |
| 13 | Tsinghua University | 1 | 5 | 0 | 0 | 5 |
| 14 | University of California, Los Angeles | 11 | 120 | 0 | 15 | 105 |
| 15 | Peking University | 13 | 144 | 0 | 97 | 47 |
| 16 | University of Toronto | 2 | 15 | 0 | 15 | 0 |
| 17 | EPFL – École polytechnique fédérale de Lausanne | 2 | 51 | 0 | 41 | 10 |
| 18 | New York University | 21 | 120 | 0 | 111 | 9 |
| 19 | Université Paris-Saclay | 11 | 150 | 1 | 45 | 104 |
| 20 | California Institute of Technology | 4 | 118 | 5 | 66 | 47 |
| | **Total** | | **2715** | **291** | **1192** | **1232** |

## Skip and link-only reasons

### Massachusetts Institute of Technology

- not a PDF (bad magic bytes): 10
- no extractable text (scanned?): 6
- looks like student work: 2
- file says it is excluded from the open licence: 1
- licence: link only: 1
- HTTP 404: 1
- disallowed by robots.txt: 1
- not visited — deny-listed host (learn.mit.edu): 3351

### University of Oxford

- licence: link only: 76
- disallowed by robots.txt: 8
- duplicate (SHA-256): 5
- no extractable text (scanned?): 5
- not visited — login/portal path: 3
- not visited — deny-listed host (www.springer.com): 1
- not visited — deny-listed host (www.ams.org): 1

### University of Cambridge

- licence: link only: 341
- duplicate (SHA-256): 5
- HTTP 404: 1
- language not confidently English: 1
- disallowed by robots.txt: 1
- language: de: 1
- not visited — deny-listed host (www.vle.cam.ac.uk): 5
- not visited — login/portal path: 1

### Harvard University

- licence: link only: 305
- no extractable text (scanned?): 33
- disallowed by robots.txt: 19
- language not confidently English: 17
- HTTP 404: 16
- duplicate (SHA-256): 14
- over 50 MB: link only: 5
- language: it: 4
- HTTP 403: 2
- download failed or stalled: 1
- not visited — deny-listed host (www.ams.org): 2
- not visited — deny-listed host (www.dropbox.com): 2
- not visited — deny-listed host (canvas.harvard.edu): 1

### Princeton University

- licence: link only: 206
- no extractable text (scanned?): 58
- HTTP 404: 46
- language not confidently English: 9
- HTTP 403: 1
- not visited — deny-listed host (moodle-app2.let.ethz.ch): 3
- not visited — deny-listed host (link.springer.com): 3
- not visited — deny-listed host (eu.wiley.com): 1
- not visited — deny-listed host (www.cambridge.org): 1
- not visited — deny-listed host (piazza.com): 1

### Stanford University

- licence: link only: 64
- HTTP 404: 42
- language not confidently English: 1

### University of California, Berkeley

- licence: link only: 105
- no extractable text (scanned?): 10
- encrypted PDF: 2
- language: de: 1
- disallowed by robots.txt: 1
- language: fr: 1
- not visited — login/portal path: 1

### Imperial College London

- licence: link only: 54
- no extractable text (scanned?): 15
- language not confidently English: 3
- looks like student work: 1

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

- licence: link only: 43
- language: cjk: 1
- looks like student work: 1
- HTTP 404: 1
- not visited — deny-listed host (drive.google.com): 26

### Tsinghua University

- no extractable text (scanned?): 5

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

- licence: link only: 111
- no extractable text (scanned?): 7
- language not confidently English: 1
- looks like student work: 1
- not visited — deny-listed host (www3.interscience.wiley.com): 1

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

- licence: link only: 66
- HTTP 404: 38
- language not confidently English: 4
- no extractable text (scanned?): 2
- language: es: 2
- language: it: 1
- not visited — deny-listed host (www.ams.org): 42

