# 4 Element

Ateş, Su, Toprak ve Hava ile başlayıp birleştire birleştire neredeyse her şeye ulaşılan, Türkçe bir simya (birleştirme) oyunu.

Her turda külliyattan rastgele bir **hedef** seçilir; 4 elementten yola çıkıp o hedefi en az denemeyle bulmaya çalışırsın.

Bir de **yapay zeka modu** var: hazır külliyat yerine her birleşimi DeepSeek o an üretir; hedef yoktur, keşif sonsuzdur.

## Çalıştırma

Node.js 18+ yeterli, başka bağımlılık yok.

```bash
npm start
```

Sonra tarayıcıda: http://localhost:3000

## Oynanış

| Eylem | Nasıl |
|---|---|
| Birleştir | Bir öğeyi sürükleyip diğerinin üstüne bırak |
| Alana öğe koy | Sağdaki keşiflerden sürükle ya da tıkla |
| Alanda gezin | Orta tuşla (veya boş yerde sol tuşla) sürükle |
| Yakınlaş / uzaklaş | Fare tekerleği, sol alttaki düğmeler |
| Sil | Sağ tık |
| Kopyala | Çift tık |
| İpucu | **İpucu** düğmesi ya da `H` |

- **İpucu**: Elindeki öğelerle hedefe bir adım yaklaştıran birleştirmeyi, sanal bir el sürükleyip bırakıyormuş gibi senin yerine yapar. Sınırsızdır ama her ipucu tur puanını %20 azaltır.
- **Pes Et**: İki seçenek sunar: doğrudan *Yeni görev* ya da *Çözüme bak*. Çözüm önce 4 elementten hedefe hızlı bir animasyonla oynatılır, ardından incelenebilir (kaydır/yakınlaştır) bir **çözüm ağacı** ve adım adım liste açılır. *Sıradaki görev* ile devam edilir.
- **Zorluk** (menü): Kolay (3–6 adım), Orta (7–12), Zor (13–20), Efsane (21+), Karışık.
- **Çerçeve renkleri**: Bir öğeyi diğerinin üstüne getirince sonuç hemen belli olur: **yeşil** bu turda yeni bir şey çıkar, **mavi** zaten bulduğun bir şey çıkar, **kırmızı** birleşmezler. Kırmızıyken bırakırsan öğe olduğu yerde kalır, deneme sayılmaz.
- **Keşif**: Turda yeni bir şey bulduğunda kısa bir "trink" sesi çalar ve öğe bir an parlar (ses menüden kapatılabilir).

### Puan

```
tur puanı = (en kısa yol × 100) × (0,35 + 0,65 × verimlilik) × 0,8^ipucu
verimlilik = en kısa yol ÷ yaptığın farklı birleşim sayısı
```

Aynı ikiliyi tekrar denemek ve birleşmeyen ikililer sayılmaz; yalnızca farklı, başarılı birleşimler deneme sayısını artırır.

## Yapay zeka modu

Menüden (sağ üstteki düğme ya da sol üstteki logo) **Yapay zeka modu** açılıp yeni tur başlatılır.

- Her birleşimi DeepSeek (`deepseek-flash`, düşünme modu kapalı) üretir. Sonuç şu öncelikle aranır:
  1. **Gerçek birleşim**: ikisi bir araya gelince ortaya çıkan şey (Su + Ateş = Buhar)
  2. **Ortak nokta**: ikisinin birlikte bulunduğu yer ya da onları bağlayan şey (Kum + Deniz = Plaj, Elma + Yerçekimi = Newton)
  3. **Kelime oyunu / espri**: bileşik kelime, deyim, kültürel gönderme (Ay + Çiçek = Ayçiçeği)
  4. Hiçbiri makul değilse birleşmez.
- Sonuç nesne olmak zorunda değil; kişi, yer, kavram ya da eylem de olabilir. İstem, öngörülebilirliği her şeyin önüne koyar: sonucu görünce "tabii ya" denmeli.
- Sonuç zaten var olan bir öğe de olabilir. Model her istekte dünyanın o ana kadarki tüm birleşimlerini ("kanon") ve öğe listesini görür; bilinen öğelere aynı adla döner.
- Üretilen dünya tarayıcıda (`localStorage`) saklanır ve turlar boyunca korunur: aynı ikili hep aynı sonucu verir. Ansiklopedi sekmesinden sıfırlanabilir.
- Öğe ikonları: adı külliyatta geçen öğeler külliyatın ikonunu kullanır, diğerleri modelin seçtiği emoji ve renkle çizilir.

### Bekletmeden oynatmak: ön-üretim

Birleşimler oyuncu denemeden önce arka planda üretilir:

- **Sıcak öğeler**: alandaki öğelerin hepsi, son 12 keşif ve 4 element (oyunun başında, 24 keşfe kadar bütün keşifler). Bunların kendi aralarındaki bütün birleşimleri her zaman hazır tutulur; üstüne getirince renk hemen belli olur.
- Keşiflerden bir öğe sürüklenmeye başladığı anda, o öğenin alandaki her şeyle birleşimi de hemen istenir.
- **İleri pencere**: bu birleşimlerden çıkacak (henüz bulunmamış) öğeler ve onların da sonuçları, dallar boyunca birkaç adım ileriye kadar izlenir.
- Penceredeki hazır ve denenmemiş birleşim sayısı **50'nin altına düşünce 100'e kadar** yeniden doldurulur. İstekler 8'li paketler hâlinde, aynı anda 4 tane gider; sonuçlar satır satır akarak gelir.
- Yine de henüz hazır olmayan bir çiftin üstüne gelinirse halka gri olur ve çift hemen (öncelikli) sorulur. Bırakılırsa iki öğe üst üste bekler, sonuç gelince birleşir.
- Sekme arka plandayken ön-üretim durur.

### Kurulum

DeepSeek API anahtarı gerekir. Proje kökünde `.env` dosyası oluştur (`.env.example`'ı kopyalayabilirsin):

```bash
cp .env.example .env
```

```
DEEPSEEK_API_KEY=sk-...
```

Sonra `npm start`. Anahtar sunucuda durur; tarayıcı yalnızca `/api/ai` üzerinden konuşur. Sunucuda anahtar yoksa menüdeki alana kendi anahtarını da girebilirsin (yalnızca o tarayıcıda saklanır).

- `DEEPSEEK_MODEL`: modeli değiştirmek için (varsayılan `deepseek-flash`)
- `DEEPSEEK_MOCK=1`: anahtarsız deneme için sahte ama tutarlı sonuçlar

**Netlify**: `netlify/functions/ai.mjs` aynı `/api/ai` ucunu sunar; site ortam değişkenlerine `DEEPSEEK_API_KEY` eklemek yeterli. Bu uç herkese açıktır: siteye giren herkes senin anahtarınla üretim yapar, bakiyeni buna göre tut.

## Külliyat

`data/*.txt` dosyalarında, düz metin olarak:

- **4.067 öğe**
- **15.841 tarif** (11.100 elle yazılmış + 4.740 kategori kuralından türeyen)
- Hepsi 4 elementten ulaşılabilir (derleyici doğrular), en derin hedef 56 adım

Satır biçimi:

```
== Kategori Adı #renk
Öğe Adı {glif+rozet #renk} [etiket1 etiket2] = A + B | C + D
Meyve Salatası = #meyve + #meyve          // #etiket: o etiketi taşıyan her öğe için kural
Hidrojen = Su + Elektrik*                 // *: bilinçli çoklu sonuç (paylaşımlı tarif)
```

Kurallar:
- Aynı ikili iki farklı sonuca yazılmışsa ilk tanım kazanır ve derleyici çakışmayı raporlar.
- Yıldızsız tarif her zaman yıldızlı olanı geçer.
- İki yıldızlı tarif aynı ikiliyi paylaşırsa ikisi birden çıkar.
- Yazılı tarifler, etiket kurallarından her zaman önceliklidir.

### Genişletmek

1. Herhangi bir `data/*.txt` dosyasına satır ekle (ya da yeni dosya aç).
2. Doğrula:

```bash
npm run check
```

Tanımsız öğeleri sıklığa göre listelemek için:

```bash
node tools/missing.mjs
```

Sunucu çalışırken veri dosyaları değişirse külliyat bir sonraki yüklemede otomatik yeniden derlenir.

## İkonlar

Hazır ikon ya da emoji kullanılmadı. `public/js/glyphs.js` içinde 24×24 ızgarada elle çizilmiş ~420 özgün glif var; kısa bir mini dille yazılmışlardır (`M…` path, `c` daire, `e` elips, `r` dikdörtgen; `*` yumuşak dolgu, `!` dolgu, `_` koyu dolgu, `=` kalın çizgi).

Her öğenin ikonu dört parçadan oluşur:
- renkli bir karo,
- ana glif,
- köşede bir rozet glifi,
- aynı glif+rozet ikilisini paylaşan öğeler için ayırt edici bir desen varyantı.

Böylece her öğe görsel olarak benzersizdir.

Tüm glifleri ve öğe ikonlarını görmek için: http://localhost:3000/galeri.html

## Dosya yapısı

```
server.js              bağımlılıksız yerel sunucu (külliyatı derleyip /library.json olarak sunar, /api/ai)
lib/ai.mjs             yapay zeka modu: DeepSeek istemi, akış ve yanıt ayrıştırma (sunucu tarafı)
netlify/functions/     Netlify'da /api/ai
tools/build.mjs        külliyat derleyici + doğrulama raporu (npm run check)
tools/missing.mjs      tanımsız öğe listesi (yazarken yardımcı)
data/*.txt             külliyat
public/index.html      oyun
public/galeri.html     ikon galerisi
public/js/solver.js    en kısa yol / ipucu çözücüsü (Node ve tarayıcıda ortak)
public/js/glyphs.js    glif kütüphanesi
public/js/icons.js     glif → SVG, öğe ikonu üretimi
public/js/workspace.js serbest birleştirme alanı (kaydırma, yakınlaştırma, sürükle-bırak)
public/js/tree.js      çözüm ağacı görünümü
public/js/anim.js      animasyon yardımcıları, ipucu eli
public/js/ai.js        yapay zeka dünyası (kalıcı kayıt) ve arka plan ön-üretim motoru
public/js/sfx.js       keşif sesi (WebAudio)
public/js/main.js      oyun akışı
```

### En kısa yol nasıl hesaplanıyor?

Tarifler bir hiper-graf oluşturur. Çözücü, Knuth'un Dijkstra genellemesiyle her öğe için gereken *farklı öğe kümesini* bit dizisi olarak taşır. Böylece ortak ara öğeler iki kez sayılmaz.

Aynı algoritma iki yerde kullanılır:
- **İpucu**: o anda elinde olanlardan başlar.
- **Çözüm**: 4 elementten başlar.
