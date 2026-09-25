# Architecture Baseline v1: AI-Powered Photo-Bashing Web Application \& Style DNA Engine

**Проект:** StyleDNA Studio  
**Версія:** 3.0.0 (Production Architecture Baseline v1)  
**Цільова аудиторія:** Digital Artists, Indie Game Developers, Performance Marketers \& Media Buyers  
**Комерційна модель:** Freemium + Entitlement-Driven Дворівнева Передплата:

* **Standard ($10/місяць):** 250 кредитів/міс, ліміт 1 активної задачі на GPU, пріоритет черги 5, генерація до 2K, базові формати.
* **Pro ($25/місяць):** 1000 кредитів/міс, ліміт до 3 одночасних задач на GPU, найвищий пріоритет черги (priority 1), 4K комерційний апскейл, пакетний експорт рекламних форматів (9:16, 1:1, 16:9), повний доступ до API.

\---

## 1\. Головні Архітектурні Принципи (Architecture Decisions)

1. **Розділення Style DNA на Контракти та ML Runtime:**

   * `packages/style-dna-contracts/` (TypeScript): Zod-схеми, інтерфейси та контракти завдань черги для веб-клієнта, BFF та оркестратора.
   * `apps/worker-ai/` (Python 3.11 ML Runtime): PyTorch, OpenCV, DINOv2, SciPy, NumPy, Spherical Harmonics Estimator. Обчислювально важка екстракція ознак та робота з тензорами виконується виключно на Python-боці.
2. **Канонічне Версіонування Векторного Простору (DINOv2 -> pgvector):**

   * Style DNA не є абстрактним масивом чисел. Кожен профіль містить суворі метадані: `embedding\\\_model` (напр. `dinov2\\\_vitl14`), `embedding\\\_version` (`v1.0`), `embedding\\\_dimension` (`1024`), `extractor\\\_version` та `style\\\_dna\\\_schema\\\_version`.
   * Векторний індекс HNSW у PostgreSQL партиціонується або фільтрується за моделлю та версією, запобігаючи спотворенню косинусних відстаней при міграції моделей.
3. **Дворівнева Модель Ознак Style DNA (Realistic Physical Modeling):**

   * **Детерміністичні ознаки (Deterministic Features):** безпосередньо виміряні з пікселів — квантована палітра CIELAB, L*a*b\* статистика (середнє, дисперсія, асиметрія), контрастні криві, частотний аналіз мікрозерна через 2D FFT, радіус розмиття країв.
   * **Оціночні ознаки (Inferred Features):** висновки нейромережевих естіматорів із обов’язковим індексом впевненості (`confidence`: 0.0–1.0) та версією оцінювача (`estimatorVersion`): вектор освітлення (азимут, кут піднесення, колірна температура в Кельвінах, заповнююче світло).
4. **Decoupled Conditioning Compiler \& Provider Adapters:**

   * Style DNA відділений від prompt-інжекцій. Core IP — це чистий математичний Style DNA.
   * Адаптери провайдерів (`ImagenConditioningAdapter`, `DiffusionConditioningAdapter`, `ControlNetAdapter`) транслюють Style DNA у специфічні параметри (текстові директиви, LoRA triggers, від’ємні ваги, карти глибини та вагові коефіцієнти inpaint). Моделі можна замінювати без зміни історичних профілів Style DNA.
5. **CanvasProject Layer Manifest як Source of Truth:**

   * Джерелом правди сцени є структурований **Layer Manifest**, а не плоский растровий PNG.
   * Канонічним рушієм обрано **Fabric.js** (з виключенням Konva для усунення дублювання). Збереження стану матриць трансформацій, blend modes та прив’язки до `assets(id)`.
6. **Першокласна Доменна Сутність `assets`:**

   * Усі бінарні файли (референси, вирізки, маски, карти глибини, фінальні рендери) реєструються в таблиці `assets` з ключами Cloudflare R2, хешами SHA-256 та розмірами, розвантажуючи інші сутності від зберігання сирих URL.
7. **Динамічні Політики Черг (Entitlements Policy):**

   * Замість жорстко закодованих лімітів в API ("10 одночасних задач") впроваджено систему Entitlements: `maxQueuedJobs`, `maxRunningJobs`, `queuePriority`, `maxResolutionPx`. Це захищає юніт-економіку тарифу $25/міс.
8. **Раціональні Межі Середовища Виконання (No Dogmatic Edge):**

   * Повноцінний **Node.js 22 LTS** для API Gateway, довготривалих з’єднань Server-Sent Events (SSE), пулів Redis/BullMQ, Stripe webhook та Sharp.
   * Edge використовується виключно на рівні CDN (Cloudflare) для кешування статичних бандлів та асетів.
9. **SLO Performance Target:**

   * Час виконання 3.5s – 7.6s для комерційного 4K зафіксовано як інженерний цільовий орієнтир продуктивності (SLO benchmark target), що підтверджується бенчмарками на цільовому GPU-обладнанні.

\---

## 2\. Системна Топологія

```
+---------------------------------------------------------------------------------------+
|                          КЛІЄНТСЬКИЙ РІВЕНЬ (Next.js 15 SPA)                          |
|  - Інтерактивне полотно: Fabric.js (Канонічний рушій)                                 |
|  - CanvasProject Layer Manifest (Source of truth: z-index, transforms, blend modes)  |
|  - Дворівневий телеметричний інспектор Style DNA (детерміністичні дані + оцінки)      |
|  - Server-Sent Events (SSE) клієнт для трансляції прогресу генерації                 |
+------------------------------------------+--------------------------------------------+
                                           | HTTPS REST / Persistent SSE
                                           v
+---------------------------------------------------------------------------------------+
|                         NODE.JS 22 RUNTIME API \\\& ORCHESTRATOR                         |
|  - Fastify / Express на Node.js 22 LTS (без обмежень Edge)                            |
|  - TypeScript Zod-валідація через @styledna/contracts                                 |
|  - Перевірка Entitlements користувача (Standard: 1 running, Pro: 3 running)           |
|  - Управління таблицею assets \\\& генерація Pre-signed URLs для Cloudflare R2           |
+------------------------------------------+--------------------------------------------+
                                           | Dispatch Job
                                           v
+---------------------------------------------------------------------------------------+
|                       REDIS 7 \\\& BULLMQ ENTITLE-WEIGHTED QUEUE                         |
|  - Priority 1 (Pro Tier $25/mo) vs Priority 5 (Standard Tier $10/mo)                  |
|  - Redlock розподілені блокування, контроль maxRunningJobs per user                   |
|  - Real-time Progress Event Emitter (depth -> conditioning -> blending -> 4k)         |
+------------------------------------------+--------------------------------------------+
                                           | Worker Pull
                                           v
+---------------------------------------------------------------------------------------+
|                        PYTHON 3.11 ML GPU WORKER CLUSTER                              |
|  1. Style DNA Feature Extraction:                                                     |
|     - Deterministic: CIELAB Delta E, 2D FFT grain density, L/a/b stats                |
|     - Inferred: Spherical Harmonics light estimation + Confidence score (0.0-1.0)     |
|     - Canonical Embedding: DINOv2 ViT-L/14 (1024-dim, versioned metadata)             |
|  2. Conditioning Compiler \\\& Adapters:                                                 |
|     - ImagenAdapter / DiffusionAdapter / ControlNetAdapter                            |
|  3. Multi-Stage Photobash Pipeline:                                                   |
|     - SAM/BiRefNet Alpha Matting -> Depth-Anything v2 Geometry                        |
|     - Generative Seam Blending \\\& Contact Shadow Synthesis                             |
|     - Commercial Real-ESRGAN 4K Polish \\\& Multi-Ratio Outpainting (9:16, 1:1, 16:9)   |
+------------------------------------------+--------------------------------------------+
                                           | Read / Write
                                           v
+---------------------------------------------------------------------------------------+
|                          СХОВИЩЕ ДАНИХ ТА АСЕТІВ (R2 \\\& PG16)                          |
|  - PostgreSQL 16: 10 реляційних таблиць (users, subscriptions, assets, style\\\_dna, ...) |
|  - pgvector: HNSW індекс (m=16, ef\\\_construction=64) з фільтром embedding\\\_model        |
|  - project\\\_versions: історія знімків маніфесту для недеструктивного undo/redo         |
|  - Cloudflare R2: S3-сумісне об’єктне сховище без плати за вихідний трафік (Zero Egress) |
+---------------------------------------------------------------------------------------+
```

\---

## 3\. Схема Бази Даних (10 Сутностей, PostgreSQL 16 + pgvector)

1. **users**: id, email, name, avatar\_asset\_id (FK -> assets), stripe\_customer\_id, credits\_balance.
2. **subscriptions**: user\_id, plan\_tier, status, max\_queued\_jobs, max\_running\_jobs, queue\_priority.
3. **assets**: id, user\_id, project\_id, type ('reference' | 'cutout' | 'mask' | 'render'), storage\_key, mime\_type, width, height, size\_bytes, checksum\_sha256, metadata.
4. **style\_dna\_profiles**: style\_dna\_schema\_version, extractor\_version, embedding\_model, embedding\_version, embedding\_dimension, embedding vector(1024), deterministic\_features, inferred\_features, is\_public.
5. **projects**: user\_id, title, canvas\_width, canvas\_height, canvas\_dpi, active\_style\_dna\_id, thumbnail\_asset\_id.
6. **project\_versions**: project\_id, version\_number, layer\_manifest\_snapshot JSONB, change\_summary.
7. **canvas\_layers**: project\_id, z\_index, layer\_type, source\_asset\_id, mask\_asset\_id, transform\_matrix JSONB, blend\_mode, is\_visible, is\_locked.
8. **generations**: project\_id, style\_dna\_id, bullmq\_job\_id, status, target\_provider, compiler\_directives JSONB, manifest\_snapshot JSONB, latency\_ms, credits\_spent.
9. **generation\_artifacts**: generation\_id, asset\_id, aspect\_ratio ('9:16' | '1:1' | '16:9'), format\_name, is\_master\_4k.
10. **usage\_events**: user\_id, generation\_id, event\_type, credits\_delta, gpu\_duration\_ms.

\---

## 4\. Пайплайн Фотобашингу (Layer Manifest as Source of Truth)

CanvasProject (Fabric.js)
|
Layer Manifest JSON (x, y, scale, rotation, blendMode, source\_asset\_id)
|
Asset Normalization \& Verification (Cloudflare R2 + SHA-256 Checksum)
|
Segmentation \& Alpha Matting (SAM / BiRefNet)
|
Depth Estimation (Depth-Anything v2 Geometry)
|
Conditioning Compiler (Provider Adapter: Imagen / Diffusion / ControlNet)
|
Generative Seam Harmonization \& Contact Shadow Synthesis
|
Commercial 4K Upscale (Real-ESRGAN)
|
Multi-Format Outpaint \& Delivery (9:16 TikTok, 1:1 Feed, 16:9 Banner)
|
Artifacts Registration in assets table

