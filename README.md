# Open Lemma

Dünyanın en iyi 20 matematik bölümünün (QS World University Rankings by Subject: Mathematics) herkese açık, İngilizce öğretim materyallerini toplayan, **ticari olmayan** bir dijital kütüphane.

- Astro 7 (statik çıktı) + TypeScript, GitHub Pages'te yayınlanır.
- Arama: MiniSearch (istemci tarafı). Filtreler URL'ye yazılır.
- Animasyon: GSAP + ScrollTrigger + SplitText, Lenis. Hero: kütüphanesiz WebGL ile Lorenz çekeri.
- Matematik: KaTeX (build sırasında render edilir).
- Arayüz TR/EN; tüm metinler `src/i18n/strings.ts` içinde.

## Hızlı başlangıç

Gereksinimler: Node 24 veya 22.23.4+ (`.nvmrc`), PDF önizlemeleri ve crawler için `poppler-utils` (`pdftoppm`, `pdftotext`, `pdfinfo`).

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
| `npm run test:pipeline` | Crawler/lisans/robots/engelleme listesi için regresyon testleri (yalnızca yerel sunucular kullanır, gerçek siteye istek atmaz) |
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

- `robots.txt`'ye uyar (Crawl-delay dahil). `robots.txt` yönlendirmeleri izlenir. 401/403/429, 5xx, zaman aşımı ve çözülemeyen yönlendirme "her şey yasak" sayılır (3 deneme; başarısızlık 10 dk sonra yeniden denenir). Yalnızca 404/410 ve diğer düz 4xx "robots.txt yok" demektir. Crawl-delay 60 sn'den büyükse site taranmaz.
- Alan adı başına en fazla **1 istek / 2 sn** (`scripts/lib/http.ts`). Sınır **kayıtlı alan adına** göredir (`ox.ac.uk`, `unimelb.edu.au` gibi iki parçalı son ekler dahil); şema, port ve alt alan adı ayrı kova açmaz.
- User-Agent: `OpenLemmaBot/1.0 (+https://github.com/negitsuneiq/Trytry; …)`.
- Canvas, Moodle, Blackboard, D2L/Brightspace, Sakai, Piazza, Gradescope, SSO/login yolları (`/login`, `/sign_in`, `/adfs`, `/cosign`, `/pluginfile.php`, `/webapps/` …), SharePoint ve yayınevi paywall alanları kara listededir. Yönlendirmelerin her adımı ayrıca kontrol edilir. Şifre alanı içeren sayfalar terk edilir. `cas.` ile başlayan alan adları bilerek engellenir (yanlış pozitif kabul edilir).
- Kapsam (`scope`) URL sınırında eşleşir; tohum sayfalar ve yönlendirme sonrası HTML sayfaları kapsam içinde olmalıdır. PDF'ler kapsam dışında yalnızca kapsam girdilerinden birinin kayıtlı alan adını paylaşan sunuculardan alınır. Takvim/sıralama gibi sorgu parametreleri ve 2'den fazla parametreli HTML URL'leri izlenmez; her HTTP isteği (başarısız olanlar dahil) sayfa bütçesine sayılır.
- Sadece PDF: içerik türü PDF/octet-stream, HTTP 200 + `%PDF-` imzası (ilk KiB'ta kontrol edilir, değilse indirme kesilir). Dil, ilk 3 sayfadan çıkarılan metinle doğrulanır; tek harfli değişkenler sayılmaz. Metni çok kısa belgeler ("too short to verify language") atlanır; gerekirse küratörlük ile eklenir.
- Tekrarlar SHA-256 (tarama sonunda; `host`, `link`'e tercih edilir) ve aynı ders kodu içinde başlık benzerliği (Jaccard ≥ 0.85) ile elenir. Başlıklar bir sayısal belirteçte ya da solution/sheet/set/midterm/final gibi sözcüklerde farklıysa, başlık genelse veya iki ders kodu da boşsa başlıktan tekilleştirme yapılmaz.
- Öğrenci ödevi gibi görünen dosyalar ("my solutions", "submitted by: Student …") atlanır. Sezgisel bilinçli olarak dardır: resmî ders notu "scribed by", sınav kapağındaki "Student ID" geçer; asıl süzgeç insan küratörlüğüdür.
- Lisansı yeniden dağıtıma izin vermeyen PDF'ler incelemeden sonra diskten silinir. Yalnızca meta veri tutulur. `.cache/crawl/tmp` her çalıştırmada başta boşaltılır.
- Dayanıklılık: her URL ayrı try/catch içindedir, gövde okuma zaman aşımı vardır, her aday `candidates.jsonl`'a anında eklenir, `candidates.json` atomik yazılır, Ctrl-C'de kısmi sonuç kaydedilir; büyük indirmeler en fazla 3 eşzamanlıdır.

### Lisans politikası

Şüphede karar her zaman **link**'tir, asla **host** değildir.

- Önce kısıtlama ifadeleri her şeyi veto eder ("all rights reserved", "not licensed under", "may not be reproduced", "used with permission", "courtesy of", "except figures" …). Sonra bir CC / kamu malı adı ya da creativecommons.org lisans URL'si ancak yakınında bir **izin ifadesi** varsa ("licensed under", "released under", "available under" …) sayılır. Kaynakça ("References" başlığından sonrası, `[12]` atıfları), izin ifadesiz çıplak CC URL'si ve birbiriyle çelişen ya da sürümü olmayan/desteklenmeyen lisans (ör. CC BY 2.0, sürümsüz "CC BY") **unknown** olur. `ACC0` gibi sözcük içi eşleşmeler sayılmaz. Tire ve boşluk çeşitleri (– ‑ NBSP) normalleştirilir.
- Lisans **dosya** düzeyinde (PDF metni) veya **ders** düzeyinde (dersin sayfasının ana içeriği ya da ana içerikteki `rel="license"` bağlantısı) aranır. `<footer>`, `<nav>`, `<header>`, `<aside>`, `role=contentinfo/navigation/banner/complementary` ve footer benzeri class/id alt ağaçları (iç içe etiketler dahil) taramadan çıkarılır, çünkü site geneli bir not yeterli değildir; kapanmamış bir footer öğesi belgenin geri kalanını da atar (güvenli yön).
- Ders sayfası lisansı yalnızca **aynı origin'de ve sayfanın kendi dizini altındaki** PDF'lere geçer (site kökündeki sayfa hiçbir şeyi kapsamaz) ve PDF'in kendi metninde izin içermeyen bir telif notu (©, "Copyright") ya da lisans anması varsa geçmez. Sayfadaki "excluded / used with permission" ifadesi barındırmayı veto eder.
- Yalnızca CC0/kamu malı, CC BY (3.0/4.0), BY-SA, BY-NC, BY-NC-SA, BY-ND (3.0/4.0), BY-NC-ND ve GFDL 1.3 **barındırılır**. Diğer her şey link olarak eklenir. Barındırmadan önce PDF'in **tam metni** kısıtlama/üçüncü taraf ifadeleri için taranır; metin okunamıyorsa link kalır.
- MIT OCW: kısayol yalnızca son URL'nin sunucusu `ocw.mit.edu` ise ve dosyanın kendisi `ocw.mit.edu/terms`'e atıf yapıyorsa CC BY-NC-SA 4.0 kabul eder. "excluded from our Creative Commons license", "courtesy of", "used with permission" gibi üçüncü taraf ifadeleri (PDF'in tamamında ve sayfada aranır) dosyayı asla barındırılamaz yapar.
- `npm run validate` şunları doğrular: barındırılan her dosya izinli bir lisansa ve URL biçiminde `license_evidence` alanına sahip, `docs/<üniversite>/<id>.pdf` yolunda, ≤ 50 MB, toplam ≤ 700 MB ve SHA-256'sı kayıtla aynı (dosya değiştirilmemiş). `public/docs` altında hiçbir kayda bağlı olmayan dosya da hatadır (build durur).
- `npm run curate`: `.cache/crawl/candidates.json` yoksa (temiz klon, CI) mevcut barındırılan dosyalar SHA-256 eşleşiyorsa olduğu gibi korunur ve hiçbir dosya silinmez.
- `npm run verify-links`: "broken" yalnızca 404/410 veya PDF olmayan 200 yanıtında yazılır. robots.txt engeli, zaman aşımı, ağ hatası, 403, 429, 5xx belirsiz sayılır: önceki durum ve `last_checked` korunur (bir kez yeniden denenir). Aylık workflow yalnızca `last_checked` dışında bir değişiklik varsa commit atar.
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
