# ПЕРЕЛОМ — задание на звук

Задание самодостаточное. Промты написаны по-английски, потому что генераторы
обучены на английских описаниях и понимают жанровые термины точнее; пояснения
и правила — по-русски.

У каждого куска два вида промта: **короткая строка стиля** (для Suno, где
промт — список тегов) и **развёрнутое описание** (для ElevenLabs Music или
Stable Audio). Брать один из двух, не оба.

**Звука в игре сейчас нет вообще** — ни файла `audio.js`, ни синтеза. Это
единственная игра в портфеле, которая начинает звук с нуля, и потому здесь
важнее не музыка, а удар.

## Что за игра

Браузерный файтинг в реальном времени про размен ударами вплотную. Двое стоят
друг против друга, бьют рукой, ногой и броском, шаг назад работает блоком.

Две вещи, ради которых игра существует:

- **Удачный перехват подбрасывает противника в воздух** и открывает комбо.
  Это единственный стык спокойного размена и града ударов.
- **Сломанная кость навсегда вычёркивает действие из арсенала.** Сломали руку —
  этой рукой больше не ударить, до конца боя. Перелом показывается рентгеном.

Картинка — **Shadow Fight**: почти чёрные силуэты `#05060a` на светящемся небе
от тёмно-вишнёвого `#2b0812` вверху до алого `#c4172c` у горизонта. Кровь
`#e01020` свежая, `#5c0a12` засохшая. Из Mortal Kombat взята только жестокость,
не стиль.

Звук должен идти за этим: **сухо и телесно**, без металла и без фэнтези.

## Правила выдачи

- **Музыка:** MP3, 128–160 kbps, 60–120 секунд, бесшовная петля, обрезать по
  такту. Без вокала — голос перетягивает внимание с боя.
- **Звуки:** WAV 44.1 кГц, короткие, **без хвоста тишины** в конце файла.
  Пик −3 дБ, все нормализовать между собой.
- **Ударам нужен ноль задержки.** Атака в файтинге читается по первым
  30 миллисекундам: если звук начинается с нарастания, удар ощущается вялым.
  В каждом промте это требование повторено — не убирать его.
- **Вес:** файлы уезжают на публичный сайт вместе с игрой.
- Один промт — один файл.

---

# Музыка

## 1. `music/fight.mp3` — цикл боя

Играет весь бой. Бой быстрый и вязкий одновременно: долгая нейтралка, где двое
меряются дистанцией, и внезапный град, когда прошёл перехват. Музыка держит
нижний слой напряжения и **не пытается вести** — вести будут удары.

Строка стиля для Suno:

```
dark industrial instrumental, 96 BPM, low distorted bass pulse, dry metallic
percussion, no melody, no vocals, loopable, tense, oppressive, restrained
```

Развёрнутое описание:

```
A tense industrial instrumental loop for a brutal one-on-one fighting game.
96 BPM, minor key, no discernible melody. A low distorted bass pulse on the
downbeat, dry percussive hits with almost no reverb, and a thin high drone
that never resolves. The piece stays at one oppressive intensity — no
build-up, no drop, no chorus. It must sit underneath fast combat sound
effects without competing with them. No vocals. Seamless loop, 90 seconds.
```

## 2. `music/xray.mp3` — момент перелома

Играет один раз, 2–3 секунды, когда кость ломается и включается рентген. Это
главный момент игры, и он обязан звучать как остановка времени.

```
short cinematic sting, 3 seconds, time-stopping impact: sub-bass drop, brief
reversed swell, then a cold high metallic ring holding alone in silence. No
melody, no vocals, clinical and cruel.
```

## 3. `music/victory.mp3` и `music/defeat.mp3`

По 4–5 секунд, один раз на экране итога, без петли.

Победа:

```
short victory sting, 4 seconds, single heavy industrial hit followed by a low
brass swell settling into a minor chord. Grim rather than triumphant. No
vocals.
```

Поражение:

```
short defeat sting, 5 seconds, low distorted drone sagging downward into
silence, one dull body-like thud at the end. Quiet and final. No vocals.
```

---

# Звуки

Это половина задания. В файтинге звук — не украшение, а обратная связь: игрок
узнаёт, попал он или его блокировали, раньше, чем видит анимацию.

## Удары

`sfx/punch-light.wav`

```
Bare-knuckle punch landing on a human body, 0.15 seconds. Dry, close-miked,
thick — a flat slap with a short low thud underneath, no reverb, no metal,
no cartoon whoosh. The impact must be at the very first millisecond of the
file, no fade-in and no silence before it. Mono.
```

`sfx/punch-heavy.wav`

```
Heavy bare-knuckle punch landing on a human body, 0.25 seconds. The same dry
close-miked character as a light punch but deeper and wetter — a flat slap
over a sub-bass thud, with a faint low-frequency body shudder after it. No
reverb, no metal. Impact at the first millisecond. Mono.
```

`sfx/kick.wav`

```
Heavy kick landing on a human torso, 0.25 seconds. A broad muffled impact —
more mass and less snap than a punch, with a short cloth rustle over it. Dry
and close, no reverb. Impact at the first millisecond. Mono.
```

`sfx/whiff.wav` — удар прошёл мимо. Тихий, но нужный: по нему игрок понимает,
что промахнулся, и что сейчас его накажут.

```
Fast arm swing through air, 0.12 seconds. A short, quiet, tight whoosh with no
tail. Must be clearly quieter and thinner than any impact sound. Mono.
```

## Защита и перехват

`sfx/block.wav`

```
Blocked punch on a raised forearm, 0.14 seconds. A dull compressed thud with
a slight tightness to it — clearly softer and duller than a clean hit, so a
player can tell blocked from landed without looking. Dry, no reverb. Mono.
```

`sfx/parry.wav` — удачный перехват, тот самый лаунчер. Единственный звук в
игре, которому разрешено быть приятным.

```
Successful parry in a fighting game, 0.3 seconds. A sharp tight snap of a
grabbed wrist followed by a brief rising whoosh as the body is lifted. Clean,
satisfying, immediately distinct from a block. Dry and close. Mono.
```

`sfx/throw.wav`

```
Body being grabbed and thrown, 0.5 seconds. Cloth grip and strain, then a
heavy whoosh of a body swinging through air. Dry, close, no reverb. Mono.
```

## Кости — главное в игре

`sfx/bone-crack.wav` — перелом. Этот звук игрок должен запомнить после первого
раза и бояться его до конца боя.

```
Human bone breaking, 0.35 seconds. A single sharp dry snap — like a thick
dry branch cracking — with a wet low-frequency component underneath and a
brief crumbling tail. Visceral and clinical, not comedic and not squelchy.
Close-miked, no reverb. Impact at the first millisecond. Mono.
```

`sfx/limb-tear.wav` — конечность оторвана.

```
Limb being torn from a body, 0.7 seconds. Wet tearing of tissue with a low
tension release underneath, ending in a heavy wet spatter. Brutal and
close-miked, no reverb, no metal. Mono.
```

`sfx/blood-splat.wav`

```
Blood hitting a hard floor, 0.3 seconds. A wet slap with fine scattered
droplets after it. Close, dry, no reverb. Mono.
```

## Тело и арена

`sfx/land.wav`

```
Human body landing hard on a stone floor, 0.4 seconds. A heavy dull thud with
cloth and a faint scrape after it. Dry and close, no reverb. Mono.
```

`sfx/step.wav`

```
Single bare footstep on stone, 0.1 seconds. Dry, soft, close. Quiet enough to
sit under combat without being noticed. Mono.
```

`sfx/wall-hit.wav` — край арены уже участвует в бою: в `src/fight.js` у стены
есть своя скорость (`wallSpeed`), и её работа — «закончить комбо и впечатать
тело в край арены».

```
Body slamming into a hard wall, 0.5 seconds. A broad heavy impact with a
short low boom and a brief debris rattle. Dry, close, minimal reverb. Mono.
```

## Голос бойца

Три коротких выдоха, не слова. Нужны, потому что бойцы — чёрные силуэты без
лиц, и голос единственное, что делает их живыми.

`sfx/grunt-hit.wav`

```
Short male grunt of pain from a body blow, 0.3 seconds. Involuntary, breathy,
no words, no scream. Dry and close, no reverb. Mono.
```

`sfx/grunt-effort.wav`

```
Short male exhale of effort while throwing a punch, 0.2 seconds. Breathy and
tight, no words. Dry and close. Mono.
```

`sfx/scream.wav` — только на перелом.

```
Short male scream of sudden agony, 0.8 seconds. Raw and involuntary, cut off
rather than fading. No words. Dry and close, no reverb. Mono.
```

---

# Что делать с готовыми файлами

1. Музыку положить в `music/`, звуки — в `assets/sfx/`.
2. Звукового движка в игре нет, его нужно написать: загрузка буферов, общая
   шина громкости, кнопка «без звука». Образец, который можно переносить почти
   как есть, — `~/dev/odin-udar/src/audio.js`: он читает `music/manifest.json`
   и играет `sfx()` по имени.
3. Начинать стоит с трёх файлов: `punch-heavy`, `bone-crack`, `parry`. Если эти
   три звучат правильно, игра уже ощущается собранной, а остальное — добор.
