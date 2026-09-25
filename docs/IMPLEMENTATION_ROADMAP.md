AristoColors STUDIO: Implementation Roadmap v1.2
Architecture Baseline v1.2 Execution Plan (FINAL FROZEN FOR AI CODING AGENT)
Цей документ визначає повну інженерну дорожню карту реалізації платформи AristoColors Studio версії v1.2.
План побудовано за принципом суворого порядку залежностей (Dependency Order), розбито на 6 виробничих етапів (Milestones) з артефактами (Deliverables) та критеріями готовності (Acceptance Criteria).
Усі критерії продуктивності та швидкодії позначено як [Benchmark / SLO Target — вимірюється на тестах], що відокремлює обов'язкову функціональну реалізацію від вимірюваних цільових показників заліза.
1. Загальний Графік та Порядок Залежностей (Dependency Graph)
code
Code
[Фаза 0: Спільні Контракти & Багатомодельне Сховище Даних]
  │ (packages/style-dna-contracts, style_dna_embeddings, Idempotency, Postgres 16 DDL, R2)
  ▼
[Фаза 1: Python 3.11 ML Runtime & AristoColors Engine]
  │ (Stateless GPU Service, DINOv2, Spherical Harmonics, CIELAB, 2D FFT, Conditioning Compiler)
  ▼
[Фаза 2: Node.js 22 BullMQ Dispatcher, SSE Fan-Out & Entitlements]
  │ (Node BullMQ Dispatcher ➔ Python ML Runtime boundary, SSE Reconnect/Last-Event-ID, R2 Pre-signed)
  ▼
[Фаза 3: Canvas Workspace & Layer Manifest Source of Truth]
  │ (Next.js 15, Fabric.js, CanvasProject State, Non-destructive Snapshots)
  ▼
[Фаза 4: 7-Етапний Конвеєр Генерації & Незмінний Provenance]
  │ (BiRefNet / Depth-Anything v2 / Generative Seam / 4K ESRGAN / Immutable Generation Provenance)
  ▼
[Фаза 5: Білінг, Reserve ➔ Settle ➔ Refund Кредити & Hardening]
  │ (Idempotent Usage Ledger, Reserve-Settle-Refund, $10 vs $25 Entitlements, SLO Benchmarks)
2. Детальні Етапи Реалізації
Фаза 0: Спільні Контракти, Багатомодельна База Даних та Інфраструктура Сховища
Мета: Створити типізований скелет монорепозиторію, схеми бази даних із гнучкою підтримкою векторних просторів, моделі ідемпотентності, життєвого циклу кредитів та незмінного провенансу.
Залежності: Немає (Base foundation).
Орієнтовна тривалість: Тижні 1–2.
Задачі та Deliverables:
Ініціалізація Turborepo Монорепозиторію:
Налаштування pnpm-workspace.yaml, спільних конфігурацій packages/config/ (TypeScript 5.x, ESLint, Prettier, Tailwind CSS v4).
Пакет Спільних Контрактів (packages/style-dna-contracts):
Zod-схеми та TypeScript-інтерфейси для:
AristoColorsProfile (канонічні метадані, детерміністичні та оціночні ознаки).
AristoColorsEmbeddingRecord (багатомодельна стратегія: назва моделі, версія, розмірність 1024/768/512).
CanvasLayerManifest (матриця трансформацій Fabric.js, blend modes, z-index, зв'язок з sourceAssetId).
GenerationJobPayload з обов'язковим idempotencyKey та provenance.
CreditLifecycleStage: трифазний життєвий цикл reserve ➔ settle ➔ refund.
EntitlementsPolicy ($10 Standard vs $25 Pro).
Пакет Бази Даних (packages/db):
Налаштування Drizzle ORM з підтримкою PostgreSQL 16 та pgvector.
Коректна мультимодельна pgvector стратегія (style_dna_embeddings):
Відокремлена таблиця векторних ембеддінгів зі строго типізованими колонками для кожної розмірності:
dimension INTEGER NOT NULL
embedding_1024 vector(1024) (DINOv2 ViT-L/14)
embedding_768 vector(768) (SigLIP SO400M)
embedding_512 vector(512) (CLIP ViT-H/14)
CHECK constraint гарантує заповнення рівно однієї колонки відповідно до dimension.
Ізольовані часткові HNSW індекси (Partial HNSW) за кожною розмірністю (WHERE embedding_XXXX IS NOT NULL). Повністю усуває помилки невідповідності розмірностей у pgvector і оптимізує пам'ять.
Таблиця generations розширена полями:
idempotency_key VARCHAR(128) NOT NULL UNIQUE
billing_stage VARCHAR(32) NOT NULL DEFAULT 'reserved' (reserved | settled | refunded)
provenance JSONB NOT NULL DEFAULT '{}'::jsonb (знімок версії маніфесту, SHA-256 хеш, версії моделей, компілятора, seed, гіперпараметри).
Таблиця usage_events (Financial Ledger):
idempotency_key VARCHAR(128) NOT NULL UNIQUE
lifecycle_stage VARCHAR(32) NOT NULL (reserve | settle | refund)
event_type VARCHAR(32) NOT NULL (credit_reserve | credit_settle | credit_refund | monthly_renewal | topup_purchase)
Cloudflare R2 Bucket Provisioning:
Створення бакета R2 зі структурою каталогів:
assets/originals/{userId}/{assetId}.png
assets/masks/{userId}/{assetId}.png
assets/intermediates/{userId}/{generationId}/depth.png
assets/renders/{userId}/{generationId}/{ratio}.png
Налаштування CORS для прямих Pre-signed PUT запитів із браузера.
Acceptance Criteria (Критерії Приймання):

pnpm build успішно збирає всі пакети монорепозиторію без помилок компіляції.

Drizzle міграції застосовуються чисто на PostgreSQL 16 з увімкненим розширенням vector.

Схема style_dna_embeddings гарантує збереження 1024d, 768d та 512d векторів у строго типізованих колонках без помилок розмірності в pgvector.

Часткові HNSW індекси створені для кожної розмірності (embedding_1024, embedding_768, embedding_512) з умовою WHERE embedding_XXXX IS NOT NULL.

Таблиці generations та usage_events мають унікальні обмеження idempotency_key.

Pre-signed URL дозволяє завантажити файл у R2 напряму та верифікувати доступ за SHA-256 хешем.

[Benchmark / SLO Target — вимірюється на тестах]: HNSW векторний пошук схожих стилів у просторі DINOv2 показує середній час виконання 
 мс при базі 10 000+ векторів.
Фаза 1: Python 3.11 ML Runtime (Stateless GPU Service) & AristoColors Engine
Мета: Створити високопродуктивний безстанковий (stateless) GPU-сервіс для вилучення ознак AristoColors та компіляції кондиціонування, доступний для виклику через внутрішній RPC/HTTP з оркестратора Node.js.
Залежності: Фаза 0 (packages/style-dna-contracts).
Орієнтовна тривалість: Тижні 3–4.
Задачі та Deliverables:
Фіксація Архітектурної Межі (Node Dispatcher ➔ Python ML Runtime):
Python НЕ є прямим споживачем BullMQ черги.
Python-сервіс розгортається як чистий безстанковий ML Runtime (FastAPI / gRPC worker microservice), що приймає задачі на обчислення від Node.js воркера-диспетчера.
Це усуває станкові конфлікти, зберігає управління чергою та білінгом у типізованому середовищі Node.js і робить GPU-пул горизонтально масштабованим.
ML Container & CUDA Налаштування (apps/worker-ai):
Dockerfile на базі NVIDIA CUDA 12.2 + Python 3.11 + PyTorch 2.3+.
Прогрів та кешування вагів: DINOv2 ViT-L/14, Depth-Anything v2, BiRefNet, Real-ESRGAN x4plus.
Дворівневий Екстрактор Ознак (src/style_dna/extractor.py):
Детерміністичний модуль:
Квантування палітри CIELAB (5 ключових кольорів із відсотковими вагами).
Статистика каналів 
 (середнє, дисперсія, асиметрія).
2D FFT спектральний аналіз частот для визначення мікрозерна (Fine / Medium / Impasto).
Оцінка крайової дисперсії (Edge Bleed Radius у px).
Оціночний модуль (Inferred Features):
Естіматор сферичних гармонік (Spherical Harmonics) напрямку світла: азимут 
, піднесення 
, температура (Kelvin), контраст.
Розрахунок індексу впевненості (confidence: 0.0–1.0) та фіксація estimatorVersion.
Багатомодельний вектор:
Вилучення вектора за канонічною моделлю (DINOv2 ViT-L/14, 1024d) з можливістю паралельної підтримки вторинних енкодерів (SigLIP/CLIP).
Decoupled Conditioning Compiler & Provider Adapters (src/conditioning/):
DiffusionConditioningAdapter: компілює LoRA тригери, зважені від'ємні промпти, ControlNet inpaint вагу (0.85).
ImagenConditioningAdapter: компілює структуровані текстові директиви атмосфери та освітлення.
ControlNetAdapter: компілює тензорні параметри препроцесора (inpaint_only+lama), карти глибини та IP-Adapter scale.
Acceptance Criteria (Критерії Приймання):

Сервіс apps/worker-ai успішно стартує як безстанковий RPC/HTTP мікросервіс та відповідає на healthcheck GPU.

Вихідний JSON екстракції на 100% валідується схемою AristoColorsProfileSchema з packages/style-dna-contracts.

Адаптери Conditioning Compiler генерують валідні конфіги для Diffusion, Imagen та ControlNet без мутації канонічного AristoColors.

[Benchmark / SLO Target — вимірюється на тестах]: Час повного вилучення AristoColors на цільовому GPU (RTX 4090 / L4 / A10G) складає 
 с для роздільної здатності 2048x2048.

[Benchmark / SLO Target — вимірюється на тестах]: Вектор DINOv2 демонструє детерміністичну повторюваність з похибкою косинусної схожості 
 для одного й того самого вхідного асету.
Фаза 2: Node.js 22 BullMQ Worker/Dispatcher, SSE Fan-Out & Entitlements
Мета: Реалізувати надійний шар оркестрації на Node.js 22, який володіє чергою BullMQ, реалізує ідемпотентний прийом задач, керує резервуванням кредитів, транслює SSE-події з підтримкою reconnect та диспатчить обчислення на Python ML Runtime.
Залежності: Фаза 0 (packages/db, packages/style-dna-contracts), Фаза 1 (apps/worker-ai).
Орієнтовна тривалість: Тижні 5–6.
Задачі та Deliverables:
Архітектура Диспетчера (Node BullMQ Worker ➔ Python Runtime):
Воркер BullMQ реалізовано на Node.js 22 LTS.
Диспетчер витягує задачу з черги, блокує стан ідемпотентності, робить виклик до Python ML Runtime через захищений внутрішній канал (gRPC / HTTP keep-alive) та контролює таймаути і ретраї.
Ідемпотентний API Gateway (POST /api/v1/projects/:projectId/blend):
Підтримка заголовка Idempotency-Key (UUIDv4 або клієнтський хеш).
Якщо задача з таким ключем уже створена чи виконується, повертається існуючий generationId без повторного списання кредитів чи запуску duplicate job.
BullMQ черга з підтримкою Entitlements та Redlock:
Налаштування підключення до Redis 7 Cluster.
Динамічні ліміти паралелізму:
Standard ($10/міс): priority: 5, ліміт maxRunningJobs = 1, maxQueuedJobs = 3.
Pro ($25/міс): priority: 1, ліміт maxRunningJobs = 3, maxQueuedJobs = 10.
Розподілене блокування через Redlock гарантує дотримання maxRunningJobs між горизонтальними нодами бекенду.
Стійкий SSE Event Stream із Reconnect & Fan-Out (GET /api/v1/jobs/:jobId/stream):
Redis Pub/Sub Fan-Out: події зміни кроків генерації публікуються в Redis канал і транслюються на будь-яку ноду API Gateway, де підключений клієнт.
Підтримка Last-Event-ID: зберігання останніх N подій задачі в Redis буфері (TTL 10 хв). При обриві зв'язку клієнт передає заголовок Last-Event-ID і отримує пропущені кроки без втрати прогресу.
Кроки трансляції: queued (5%) ➔ depth_mapping (25%) ➔ adapter_compilation (40%) ➔ harmonizing (70%) ➔ upscaling (90%) ➔ completed із посиланням на готовий asset_id.
Acceptance Criteria (Критерії Приймання):

Межа чітко дотримана: чергою BullMQ керує Node.js; Python виконує роль безстанкового GPU-обчислювача.

Повторна відправка запиту з однаковим Idempotency-Key повертає статус без повторного додавання в чергу чи подвійного резервування кредитів.

Перевищення ліміту maxRunningJobs для тарифу Standard блокує паралельний запуск другої задачі.

Завдання користувачів тарифу Pro опрацьовуються з пріоритетом 1.

При імітації розриву мережі клієнт успішно перепідключається до SSE через Last-Event-ID та наздоганяє статус без зависання UI.

Пряме завантаження асетів через R2 Pre-signed URLs захищає оперативну пам'ять API Gateway від великих файлів.
Фаза 3: Canvas Workspace (Fabric.js) & Layer Manifest Source of Truth
Мета: Створити інтерактивний веб-редактор, де Source of Truth сцени — це структурований JSON-маніфест шарів з недеструктивною історією версій.
Залежності: Фаза 0 (packages/style-dna-contracts), Фаза 2 (Assets API).
Орієнтовна тривалість: Тижні 7–8.
Задачі та Deliverables:
Інтерактивне Полотно Fabric.js (apps/web/components/canvas/):
Єдиний канонічний рушій: Fabric.js (без надлишкових дублюючих бібліотек).
Підтримка трансформацій (масштабування, переміщення, вільне обертання, flip, z-order).
Режими накладання (Blend Modes): normal, multiply, screen, overlay, soft-light.
CanvasProject State & Layer Manifest Controller:
Збереження сцени у форматі CanvasLayerManifest:
code
TypeScript
{
  projectId: string,
  manifestVersionId: string,
  width: number,
  height: number,
  dpi: number,
  layers: Array<{
    layerId: string,
    sourceAssetId: string,
    maskAssetId?: string,
    transformMatrix: TransformMatrix,
    blendMode: BlendMode,
    zIndex: number,
    opacity: number
  }>
}
Запобігання втраті даних: автоматичне збереження та синхронізація з бекендом.
Недеструктивна Історія Знімків (project_versions):
Збереження повного знімка layer_manifest_snapshot перед кожною генерацією та значною правкою.
Інтерфейс Undo/Redo та швидке повернення до будь-якої попередньої версії полотна.
Asset Workspace & Direct-to-Storage Uploader:
Drag & Drop завантаження референсів, фонів та вирізок.
Клієнтське отримання Pre-signed URL, прямий upload в R2 та миттєве додавання асету на полотно.
Acceptance Criteria (Критерії Приймання):

Полотно стабільно відображає та дозволяє редагувати 20+ шарів високої роздільної здатності.

Збережений Layer Manifest містить повні матриці трансформацій та зв'язки з assets(id).

Відкат версії (Undo) повертає полотно у точний попередній стан без втрати зв'язків з асетами.

[Benchmark / SLO Target — вимірюється на тестах]: Рендеринг сцени за знімком маніфесту забезпечує 100% візуальну відповідність геометрії та положення об'єктів при повторному завантаженні проекту.
Фаза 4: 7-Етапний Конвеєр Генерації & Незмінний Provenance
Мета: Об'єднати Layer Manifest, AristoColors, Conditioning Compiler та генеративні моделі в єдиний пайплайн із повною фіксацією незмінного провенансу.
Залежності: Фази 1, 2, 3.
Орієнтовна тривалість: Тижні 9–10.
Задачі та Deliverables:
Незмінний провенанс генерації (Immutable Generation Provenance):
Кожна операція генерації фіксує у полі generations.provenance незмінний знімок контексту виконання:
manifestVersionId та manifestSnapshotHash (SHA-256 хеш стану сцени).
compilerVersion (версія компілятора директив).
modelVersions (точні хеші/теги вагів BiRefNet, Depth-Anything v2, SDXL/Flux, ControlNet, Real-ESRGAN).
seed (псевдовипадкове зерно для можливості повторного відтворення).
hyperparameters (steps, cfgScale, edgeBleedRadiusPx, denoiseStrength, sampler).
Сегментація, Alpha Matting та Карта Глибини:
Точне вирізання об'єктів через BiRefNet / SAM для шарів із типом cutout.
Побудова узгодженої 16-бітної карти глибини сцени через Depth-Anything v2.
Генеративне Зшивання Швів та Синтез Контактних Тіней:
Дифузійний inpaint крайових зон (Edge Bleed Radius) відповідно до детерміністичних параметрів AristoColors.
Генерація контактних тіней (Ambient Occlusion та Cast Shadows) за оціночним вектором світла фону (азимут, піднесення, Kelvin).
Комерційний 4K Апскейл та Пакетний Outpainting:
Фінальний апскейл через Real-ESRGAN x4plus до 3840x2160 (4K Master).
Пакетна генерація форматів оголошень:
9:16 (TikTok / Reels / Stories)
1:1 (Instagram Feed / Square)
16:9 (YouTube / Display Banner)
Реєстрація всіх вихідних файлів у таблиці generation_artifacts з прив'язкою до assets(id).
Acceptance Criteria (Критерії Приймання):

Кожен завершений запис generations містить повний валідний JSON-об'єкт provenance.

Відсутні помітні штучні контури або різкі розриви по краях вставлених об'єктів.

Вектор освітлення та контактні тіні гармонізовано узгоджуються з фоновим референсом.

Усі згенеровані формати (9:16, 1:1, 16:9, 4K) зареєстровані в assets та готові до пакетного завантаження.

[Benchmark / SLO Target — вимірюється на тестах]: Час базової генерації 2K колажу на цільовому GPU складає 
 с.

[Benchmark / SLO Target — вимірюється на тестах]: Повний комерційний пакет (4K апскейл + 3 формати outpainting) завершується в межах 
 с.
Фаза 5: Білінг (Stripe), Reserve ➔ Settle ➔ Refund Кредити & Production Hardening
Мета: Запустити комерційний білінг, захистити юніт-економіку за допомогою трифазного життєвого циклу кредитів та ідемпотентного фінансового журналу.
Залежності: Фази 0–4.
Орієнтовна тривалість: Тижні 11–12.
Задачі та Deliverables:
Інтеграція Stripe Billing & Динамічні Entitlements:
Stripe Checkout Sessions для тарифів Standard (
25/міс, 1000 кредитів).
Обробка Stripe Webhooks (customer.subscription.created, invoice.payment_succeeded, customer.subscription.deleted).
Синхронізація підписки та автоматичне оновлення лімітів у subscriptions.
Трифазний Життєвий Цикл Кредитів (Reserve ➔ Settle ➔ Refund):
Фаза Reserve: при постановці задачі в чергу баланс кредитів користувача декрементується, створюється запис у usage_events зі статусом reserve та idempotency_key. Генерація отримує billing_stage = 'reserved'.
Фаза Settle: після успішного збереження артефактів у R2 статус генерації переводиться в completed, billing_stage = 'settled', а в usage_events фіксується підтвердження з фактичним gpu_duration_ms.
Фаза Refund: якщо обчислення на GPU зазнало непоправної помилки, таймауту або збою зв'язку, транзакція відкочується: баланс кредитів відновлюється (+credits), створюється запис usage_events з lifecycle_stage = 'refund', а генерація позначається billing_stage = 'refunded'.
Захист від Подвійних Списань (Strict Idempotency):
Унікальний індекс idx_usage_events_idempotency на рівні PostgreSQL блокує створення дублюючих фінансових операцій навіть при повторних мережевих ретраях з боку клієнта чи Stripe.
End-to-End Тестування, Безпека та Аудит SLO:
Повний E2E тест на Playwright: створення проекту ➔ завантаження 2 асетів ➔ компонування шарів ➔ екстракція AristoColors ➔ диспатч у BullMQ ➔ SSE моніторинг ➔ фіксація артефактів 4K ➔ списання кредитів.
Тестування відновлення при збої воркера: штучне падіння GPU-процесу під час генерації повинно викликати фазу refund кредитів та інформування клієнта через SSE.
Prometheus / Grafana дашборди: затримка черги BullMQ, GPU VRAM, коефіцієнт конверсії генерацій.
Acceptance Criteria (Критерії Приймання):

Баланс користувача не може піти в мінус ні за яких умов конкурентних паралельних запитів (REPEATABLE READ транзакції).

При збої або таймауті задачі кредити автоматично повертаються користувачу за сценарієм refund.

Оформлення тарифу Pro миттєво розширює ліміти maxRunningJobs з 1 до 3 та підвищує пріоритет черги.

E2E тест повністю проходить у CI/CD середовищі.

[Benchmark / SLO Target — вимірюється на тестах]: Середній час реакції API Gateway для створення та диспетчеризації задач складає 
 мс.
3. Матриця Ризиків та Інженерних Запобіжників
Ризик	Ймовірність	Вплив	Інженерне Рішення / Запобіжник (v1.1)
Збитковість GPU при тарифі $25/міс	Середня	Критичний	Redlock контроль maxRunningJobs = 3 + ліміт кредитів (1000 кр/міс = ~333 генерації).
Втрата коштів / кредитів користувача при збої GPU	Середня	Критичний	Reserve ➔ Settle ➔ Refund: кредити автоматично повертаються при помилці воркера.
Дублювання задач при повторних кліках або ретраях	Висока	Високий	Idempotency-Key у HTTP-заголовках та унікальні обмеження в generations і usage_events.
Зрив консистентності HNSW при оновленні моделі	Середня	Високий	Багатомодельна ізоляція у style_dna_embeddings: векторний простір сегментовано за назвою та версією.
Втрата прогресу генерації при розриві мобільного зв'язку	Висока	Середній	SSE Reconnect з Last-Event-ID та буфером у Redis Stream + Pub/Sub Fan-Out.
Зрив пам'яті Node.js при 4K PSD	Висока	Критичний	Direct-to-Storage: клієнт завантажує файли напряму в Cloudflare R2 через Pre-signed URLs.
4. Change Log v1.0 ➔ v1.1 (Консолідований Звіт Змін)
Цей журнал фіксує точкові архітектурні вдосконалення, внесені до початкової дорожньої карти:
Архітектурна межа черги та воркерів (Phase 1 & Phase 2):
Було в v1.0: Python-воркер описувався як прямий споживач BullMQ черги.
Стало в v1.1: Чітко зафіксовано межу: Node.js BullMQ Worker/Dispatcher ➔ Python ML Runtime. Node.js тримає підключення до Redis/BullMQ, керує життєвим циклом задач та фінансами, а Python є чистим безстанковим GPU-мікросервісом обчислень (gRPC/HTTP).
Багатомодельна стратегія ембеддінгів (Phase 0):
Було в v1.0: Жорстка фіксація єдиного поля embedding vector(1024) у головній таблиці style_dna_profiles.
Стало в v1.1: Відокремлено таблицю style_dna_embeddings. Це дозволяє зберігати вектори різних розмірностей (1024, 768, 512) та різних моделей (DINOv2, SigLIP, CLIP) з ізольованими HNSW індексами без міграції структури профілів.
Фінансова безпека: Reserve ➔ Settle ➔ Refund (Phase 0 & Phase 5):
Було в v1.0: Однокрокове пряме списання кредитів при старті.
Стало в v1.1: Впроваджено трифазний транзакційний життєвий цикл: блокування/резерв (reserve), списання після підтвердження збереження артефактів (settle), гарантоване повернення при збої чи таймауті (refund).
Сувора Ідемпотентність (Phase 0, 2 & 5):
Додано idempotency_key з унікальними обмеженнями в таблиці generations та usage_events, а також підтримку заголовка Idempotency-Key в API для усунення дублювання задач і повторних списань.
Незмінний провенанс генерацій (Phase 4):
У generations додано поле provenance JSONB, що зберігає знімок версії маніфесту сцени, SHA-256 хеш, точні версії всіх моделей і компілятора, випадкове зерно (seed) та гіперпараметри для 100% повторюваності.
Стійкість SSE: Reconnect & Fan-Out (Phase 2):
Додано архітектуру Redis Pub/Sub Fan-Out для багатонодових кластерів та підтримку заголовка Last-Event-ID із кешуванням останніх подій у Redis.
Переосмислення критеріїв готовності (Benchmark / SLO Targets):
Часові метрики (<15 ms HNSW, 1.8 s AristoColors, 4.5 s 2K, 7.6 s 4K) та вимогу до 100% піксельної точності рекласифіковано як [Benchmark / SLO Target — вимірюється на тестах], що не блокує автоматизований кодинг до реальних залізячних тестів.
5. Change Log v1.1 ➔ v1.2 (Виправлення pgvector Multi-Model Storage)
Виправлення pgvector Dimension Incompatibility у style_dna_embeddings (Phase 0):
Помилка в v1.1: Таблиця style_dna_embeddings декларувала підтримку векторів 1024d, 768d та 512d, але колонка була жорстко задана як embedding vector(1024). Вставка векторів 768d (SigLIP) або 512d (CLIP) викликала б критичну фатальну помилку PostgreSQL: different vector dimensions.
Виправлення в v1.2:
Впроваджено строго типізовані sparse-колонки під кожну розмірність: embedding_1024 vector(1024), embedding_768 vector(768), embedding_512 vector(512).
Додано chk_embedding_dimension CHECK, який гарантує заповнення рівно однієї колонки відповідно до значення поля dimension.
Створено ізольовані часткові індекси (Partial HNSW Indexes): idx_style_dna_embedding_1024_hnsw, idx_style_dna_embedding_768_hnsw, idx_style_dna_embedding_512_hnsw з фільтром WHERE embedding_XXXX IS NOT NULL.
Синхронізовано DDL (docs/schema.sql), TypeScript contracts (src/types/architecture.ts), Zod-схеми та Roadmap.
6. Фінальне Замороження Дорожньої Карти (Status: FINAL FROZEN FOR AI AGENT)