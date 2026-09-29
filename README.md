# 4 Element

Ateş, Su, Toprak ve Hava ile başlayıp birleştire birleştire neredeyse her şeye ulaşılan, Türkçe bir simya (birleştirme) oyunu.

Her turda külliyattan rastgele bir **hedef** seçilir; 4 elementten yola çıkıp o hedefi en az denemeyle bulmaya çalışırsın.

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

### Puan

```
tur puanı = (en kısa yol × 100) × (0,35 + 0,65 × verimlilik) × 0,8^ipucu
verimlilik = en kısa yol ÷ denediğin farklı birleşim sayısı
```

Aynı ikiliyi tekrar denemek sayılmaz, yalnızca farklı birleşimler deneme sayısını artırır.

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
server.js              bağımlılıksız yerel sunucu (külliyatı derleyip /library.json olarak sunar)
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
public/js/main.js      oyun akışı
```

### En kısa yol nasıl hesaplanıyor?

Tarifler bir hiper-graf oluşturur. Çözücü, Knuth'un Dijkstra genellemesiyle her öğe için gereken *farklı öğe kümesini* bit dizisi olarak taşır. Böylece ortak ara öğeler iki kez sayılmaz.

Aynı algoritma iki yerde kullanılır:
- **İpucu**: o anda elinde olanlardan başlar.
- **Çözüm**: 4 elementten başlar.
