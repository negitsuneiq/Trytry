# Open Lemma

Dünyanın en iyi 20 matematik bölümünün (QS World University Rankings by Subject: Mathematics) herkese açık, İngilizce öğretim materyallerini toplayan, **ticari olmayan** bir dijital kütüphane.

- Astro (statik çıktı) + TypeScript, GitHub Pages'te yayınlanır.
- Arama: MiniSearch (istemci tarafı). Filtreler URL'ye yazılır.
- Animasyon: GSAP + ScrollTrigger + SplitText, Lenis. Hero: kütüphanesiz WebGL ile Lorenz çekeri.
- Matematik: KaTeX (build sırasında render edilir).
- Arayüz TR/EN; tüm metinler `src/i18n/strings.ts` içinde.

## Hızlı başlangıç

Gereksinimler: Node 22.12+ (`.nvmrc`), PDF önizlemeleri ve crawler için `poppler-utils` (`pdftoppm`, `pdftotext`, `pdfinfo`).

```bash
npm ci
npm run dev            # http://localhost:4321
npm run build          # validate → thumbnails → astro build → dist/
npm run preview
```

| Komut | Ne yapar |
|---|---|
| `npm run crawl` | `data/sources.json` içindeki kaynakları tarar, adayları `.cache/crawl/candidates.json`'a, raporu `data/crawl-report.md`'ye yazar |
| `npm run curate` | `data/curation.json`'da onaylanan adaylardan `data/documents.json`'ı üretir, barındırılabilir PDF'leri `public/docs/` altına kopyalar |
| `npm run verify-links` | Tüm kaynak linklerini kontrol eder, `link_status` ve `last_checked` alanlarını günceller |
| `npm run thumbnails` | Barındırılan PDF'lerin ilk sayfasından `public/thumbs/<id>.webp` üretir |
| `npm run validate` | Lisans politikası, dosya boyutu, SHA-256 ve şema kurallarını denetler; hata varsa build durur |
| `npm run build` | Yukarıdaki doğrulama + önizleme + Astro build |

Bir proxy arkasındaysanız Node'un `fetch`'i proxy'yi ancak şu şekilde kullanır: `NODE_USE_ENV_PROXY=1 npm run crawl`.

## Veri akışı

```
data/universities.json   QS listesi (elle, kaynağıyla doğrulanır)
data/sources.json        üniversite başına tohum (seed) sayfalar ve tarama kapsamı
        │ npm run crawl
        ▼
.cache/crawl/candidates.json  her PDF: doğrulama, dil, lisans, karar (host/link/skip) ve gerekçeler
data/crawl-report.md          üniversite başına sayılar ve atlanma sebepleri
        │ insan incelemesi → data/curation.json
        │ npm run curate
        ▼
data/documents.json + public/docs/<üniversite>/<id>.pdf
```

Crawler hiçbir şeyi kendiliğinden yayımlamaz. Konu, seviye ve tür tahminleri yalnızca öneridir. Yayına giren her kayıt `data/curation.json`'da bir insan tarafından onaylanır.

### Crawler kuralları (kodda zorunlu)

- `robots.txt`'ye uyar (Crawl-delay dahil). Alan adı başına en fazla **1 istek / 2 sn** (`scripts/lib/http.ts`).
- User-Agent: `OpenLemmaBot/1.0 (+https://github.com/negitsuneiq/Trytry; …)`.
- Canvas, Moodle, Blackboard, Piazza, Gradescope, SSO/login yolları ve yayınevi paywall alanları kara listededir. Yönlendirmelerin her adımı ayrıca kontrol edilir. Şifre alanı içeren sayfalar terk edilir.
- Sadece PDF: HTTP 200 + `%PDF-` imzası. Dil, ilk 3 sayfadan çıkarılan metinle doğrulanır.
- Tekrarlar SHA-256 ve aynı ders içinde başlık benzerliği (Jaccard ≥ 0.85) ile elenir.
- Öğrenci ödevi gibi görünen dosyalar ("my solutions", "submitted by"…) atlanır.
- Lisansı yeniden dağıtıma izin vermeyen PDF'ler incelemeden sonra diskten silinir. Yalnızca meta veri tutulur.

### Lisans politikası

- Lisans **dosya** düzeyinde (PDF metni) veya **ders** düzeyinde (dersin sayfasının ana içeriği ya da `rel="license"`) aranır. `<footer>`, `<nav>` ve `<header>` içerikleri taramadan çıkarılır, çünkü site geneli bir not yeterli değildir.
- Yalnızca CC0/kamu malı, CC BY, BY-SA, BY-NC, BY-NC-SA, BY-ND, BY-NC-ND ve GFDL **barındırılır**. Diğer her şey link olarak eklenir.
- MIT OCW: dosyanın kendisi `ocw.mit.edu/terms`'e atıf yapıyorsa CC BY-NC-SA 4.0 kabul edilir. "excluded from our Creative Commons license" ifadesini taşıyan üçüncü taraf içerik asla barındırılmaz.
- `npm run validate` şunları doğrular: barındırılan her dosya izinli bir lisansa ve `license_evidence` alanına sahip, ≤ 50 MB, toplam ≤ 700 MB ve SHA-256'sı kayıtla aynı (dosya değiştirilmemiş).
- Site ticari değildir: reklam, ücretli üyelik ve izleme yoktur.

## Yeni üniversite eklemek

1. `data/universities.json`'a bir kayıt ekleyin. `country` ISO 3166-1 alpha-2 kodudur (ör. `GB`):
   ```json
   { "rank": 21, "rank_label": "21", "slug": "example", "name": "Example University", "country": "GB",
     "department": "Department of Mathematics", "department_url": "https://…",
     "ranking_source": "QS World University Rankings by Subject: Mathematics", "ranking_url": "https://www.topuniversities.com/university-subject-rankings/mathematics", "ranking_year": 2026 }
   ```
2. `data/sources.json`'a tohum sayfaları ekleyin. Ders listeleri, ders sayfaları ve hocaların "teaching" sayfaları olabilir:
   ```json
   { "university": "example", "seeds": ["https://maths.example.ac.uk/teaching/"], "scope": ["https://maths.example.ac.uk/"], "maxDepth": 2, "maxPages": 150 }
   ```
3. `npm run crawl -- --only example` komutunu çalıştırın, `data/crawl-report.md`'yi ve `.cache/crawl/candidates.json`'ı inceleyin.

## Yeni belge eklemek

`data/curation.json`'a, crawler'ın gördüğü URL ile bir kayıt ekleyin, ardından `npm run curate` ve `npm run build` çalıştırın:

```json
{
  "url": "https://…/notes.pdf",
  "id": "example-ma101-measure-theory-notes",
  "title": "Measure Theory",
  "authors": ["Ada Example"],
  "course_code": "MA101",
  "course_title": "Measure Theory",
  "level": "undergraduate",
  "type": "lecture-notes",
  "topics": ["analysis"],
  "priority": 10
}
```

Konu kimlikleri `src/lib/topics.ts`'tedir (MSC2020 ana sınıflarına eşlenmiş, TR/EN adlarıyla). `priority` değeri küçük olan kayıtlar 700 MB barındırma bütçesinden önce pay alır. `"force_link": true` verilirse kayıt, lisans izin verse bile link olarak kalır.

## Yayın

- `main` dalına her push, `.github/workflows/deploy.yml` ile GitHub Pages'e yayınlanır. `SITE` ve `BASE_PATH`, `actions/configure-pages`'ten alınır, yani `/<repo>/` alt yolu otomatik ayarlanır.
- İlk kurulum: depo **Settings → Pages → Source: GitHub Actions**.
- `.github/workflows/check-links.yml` her ayın 1'inde linkleri kontrol eder, kırıkları `link_status: "broken"` olarak işaretleyip commit'ler ve siteyi yeniden yayınlar.

## Yerel tasarım çalışması

Veri dosyalarına dokunmadan tasarımı denemek için `OL_DATA_DIR=/yol/fixture npm run dev` kullanın. Bu dizindeki `universities.json` ve `documents.json` kullanılır.

## Kaldırma talepleri

Takedown iletişim adresi `src/site.config.ts` içindeki `contactEmail` alanından gelir. Boşsa site, GitHub Issues'a yönlendirir.

## Lisans

Kod: MIT (`LICENSE`). Meta veri: CC0. Barındırılan her PDF kendi orijinal lisansını korur.
