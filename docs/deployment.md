# Розгортання CRM на AWS EC2

CRM використовує Node.js `node:sqlite` та окремі локальні SQLite-файли для
автомалярок. Запускаємо один екземпляр застосунку з постійним диском.
Погоджено перший production-запуск із порожньою базою, без перенесення локальних даних.
Зареєстрований домен застосунку: `paintauto.pp.ua` (використовуємо без префікса `crm.`).

Поточна інсталяція: EC2 `paintauto-crm`, Stockholm (`eu-north-1`), Ubuntu 24.04
ARM64, `t4g.small`, public IPv4 `16.171.23.54`, зашифрований EBS `gp3` 30 ГБ.
Ресурси створено зі стартових кредитів Free plan. Перевірена базова ціна —
приблизно $18.71 за 730 годин ($0.0172/год EC2, $0.005/год IPv4,
$0.0836/ГБ-місяць EBS), плюс backup/storage/можливі інші витрати.
Фактичні IDs та локальні шляхи доступу збережені в gitignored
`.artifacts/deploy/aws-resources.json`. AWS CLI: `sh scripts/aws.sh`.

Перший production-запуск виконано на EC2, CRM і Caddy запущені. Подальші образи збирає GitHub Actions (розділ 6). Перевірено HTTPS сторінки
входу (200), перенаправлення неавторизованого доступу до замовлень (307),
захист API (401), збереження SQLite після заміни контейнера та відновлення
архіву із S3 з перевіркою цілісності. Clerk підтвердив production DNS, SSL,
поштові записи й налаштування Google. Фактичну першу Google-реєстрацію виконує
власник на `https://paintauto.pp.ua/auth/sign-up`.

## 1. AWS Free plan, сервер, домен і Clerk

Oracle відкладено: реєстрацію не вдалося завершити. Поточний провайдер — AWS.
Користувач підтвердив новий Free plan: $100 кредитів і 182 дні на момент перевірки.
План закінчується через шість місяців або при вичерпанні кредитів — що настане раніше.
EC2, EBS і public IPv4 споживають кредити; позначка Free tier eligible не означає
необмежений безкоштовний сервер. Перед запуском перевіряємо актуальний баланс,
доступні ресурси та вартість у вибраному регіоні. Paid plan автоматично не вмикаємо.

1. Регіон цього AWS-проєкту — Stockholm (`eu-north-1`): AWS підтвердив його
   під час входу. Free plan цього проєкту не дозволяє вхід у `eu-central-1`;
   усі перевірки й ресурси створюємо в `eu-north-1`.
2. Перевірте наявні інстанси перед створенням нового. Для невеликого стартового
   навантаження плануємо один `t4g.small` (ARM64, 2 ГБ RAM), Ubuntu 24.04 LTS
   з офіційного образу Canonical і диск EBS `gp3` 30 ГБ. Зіставте AMI й архітектуру.
   Під час збірки на малому сервері може знадобитися swap.
3. Для входу AWS CLI підтримує `aws login` із тимчасовою браузерною сесією;
   довгострокові access keys у чат передавати не потрібно. Вибраний профіль і
   регіон перевіряємо через STS та EC2 перед створенням ресурсів.
   У цьому робочому каталозі підготовлений `sh scripts/aws.sh`: він використовує
   локальний офіційний AWS CLI з `.artifacts/deploy/aws-cli/`, профіль `paintauto`
   і зберігає конфігурацію та тимчасовий кеш у `.artifacts/deploy/aws/`.
   Ці локальні файли виключені з Git і Docker. Вхід: `sh scripts/aws.sh login`.
   Перевірка: `sh scripts/aws.sh sts get-caller-identity`.
4. Додайте SSH public key. Private key залишається локально, поза Git і Docker.
   Мережа: public subnet із маршрутом до internet gateway і public IPv4.
   Security group: TCP 22 — лише з IP адміністратора, TCP 80/443 — з інтернету.
   Порт 3000 публічно не відкривати. Перевірте також firewall Ubuntu.
5. Базу зберігайте на постійному EBS-диску. Вимкніть видалення диска з даними
   при termination; перезапуск/оновлення контейнера не видаляє bind-mounted дані.
   Увімкніть захист інстанса від випадкового termination. Ці налаштування не
   замінюють зовнішні резервні копії й не зупиняють закриття Free plan.
6. На NIC.UA активуйте `paintauto.pp.ua`, призначте DNS-сервери й направте
   A-запис кореня (`@`) на IPv4 сервера. Звичайна public IPv4 EC2 може змінитися
   після stop/start; тоді оновіть DNS. Окрему Elastic IP погоджуємо за потреби.
   AAAA додавайте лише за налаштованого IPv6; спочатку використовуйте прямий DNS.
7. Створіть production instance Clerk для `paintauto.pp.ua`, налаштуйте видані
   DNS-записи й увімкніть Organizations. Використовуйте `pk_live_` і `sk_live_`
   одного instance. Для social login потрібні власні OAuth credentials.

Для поточної інсталяції у DNS потрібні такі записи (імена відносно `paintauto.pp.ua`):

| Ім'я | Тип | Значення |
| --- | --- | --- |
| @ | A | 16.171.23.54 |
| clerk | CNAME | frontend-api.clerk.services. |
| accounts | CNAME | accounts.clerk.services. |
| clkmail | CNAME | mail.wyzes17zgpag.clerk.services. |
| clk._domainkey | CNAME | dkim1.wyzes17zgpag.clerk.services. |
| clk2._domainkey | CNAME | dkim2.wyzes17zgpag.clerk.services. |

У полі «Аліас хосту» NIC.UA **крапка наприкінці CNAME-цілі обов'язкова**;
без неї NIC.UA дописує `paintauto.pp.ua` й запис стає неправильним.
Для `clk._domainkey` потрібен `dkim1...`, а не `mail...`.
Після виправлення цілей старі відповіді можуть залишатися в DNS-кешах до
закінчення їхнього TTL (у поточній зоні 14400 секунд). Актуальну конфігурацію
перевіряйте безпосередньо: `dig @ns10.uadns.com clerk.paintauto.pp.ua CNAME +short`.

Замініть паркувальний A-запис, а не додавайте другий IP до нього. У production
Clerk вже ввімкнені Organizations. Погоджений також Google sign-in:
OAuth origin `https://paintauto.pp.ua`, redirect
`https://clerk.paintauto.pp.ua/v1/oauth_callback`. Google Client ID/Secret
зберігаються в production Google connection у Clerk Dashboard; Google OAuth
app має бути опублікований (`In production`). Статус: `npx --yes clerk@latest deploy status --mode agent`.

Домен уже зареєстрований, повторна реєстрація не потрібна. Для `.pp.ua`
продовження потребує активації телефоном; дані власника публічні в WHOIS.
Платний хостинг або SSL у NIC.UA для нашої схеми не потрібні.

Офіційні джерела: [AWS Free plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html),
[EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html),
[AWS CLI login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html).
При завершенні Free plan доступ до ресурсів і даних припиняється. До цього потрібно
перенести CRM або свідомо перейти на оплату. Контролюйте витрату кредитів та
налаштуйте зовнішнє копіювання даних до внесення реальних клієнтських записів.

## 2. Підготовка Ubuntu

Підключіться через SSH як `ubuntu`. Встановіть Docker Engine, Buildx і Compose
Plugin через [офіційний apt-репозиторій Docker](https://docs.docker.com/engine/install/ubuntu/).
Нижче Docker виконується через `sudo`, додавати користувача до docker group не потрібно.

Скопіюйте погоджену версію проєкту на сервер у `/opt/rkr-crm` через Git або SSH.
Локальні незакомічені зміни звичайний `git clone` не перенесе. Не копіюйте `.env.local`,
`node_modules`, `.next` і робочі бази разом із вихідним кодом.

Усі наступні команди виконуйте на сервері:

```bash
cd /opt/rkr-crm
sudo install -d -o 1000 -g 1000 -m 700 data backups
cp deploy/production.env.example .env.production
chmod 600 .env.production
nano .env.production
```

Заповніть домен, email для TLS і production-ключі Clerk. Не друкуйте `.env.production`
у логи. `docker compose config` без `--quiet` також показує підставлені секрети.

## 3. Перший запуск

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml config --quiet
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait --wait-timeout 180
sudo docker compose --env-file .env.production -f compose.production.yaml ps
```

Збірка виконується на ARM-сервері, тому образ матиме правильну архітектуру.
Node.js 24 запускає standalone Next.js; Bun використовується лише для встановлення
залежностей за `bun.lock`. `NEXT_PUBLIC_*` вбудовуються під час build: після зміни
publishable key або домену потрібна повторна збірка. Secret key передається лише
під час запуску контейнера, його немає в Docker build args.

Caddy автоматично отримає HTTPS-сертифікат, коли DNS і порти 80/443 налаштовані.
База розміщена в `data/` на хості, резервні копії — в `backups/`. Обидві папки
виключені з Git та Docker build context. Сертифікати Caddy — у Docker volumes.

Перевірте `https://ВАШ-ДОМЕН`: вхід, створення автомалярки, запрошення виконавця,
клієнта, авто, замовлення, платіж і склад. Перезапустіть CRM та перевірте збереження:

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml restart crm
```

Healthcheck перевіряє HTTP-відповідь sign-in, а не бізнес-операції або доступність
Clerk. Діагностика: `sudo docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 crm caddy`.

## 4. Наявні дані та перехід із development Clerk

Перед перенесенням зупиніть локальний сервер і збережіть весь каталог `data/`.
Копіюйте всі бази автомалярок, а не лише `crm.sqlite`. Не копіюйте працюючу SQLite
звичайною файловою командою: актуальні записи можуть бути в WAL-файлі.

**Development і production Clerk мають окремі user/org IDs.** Бази вже прив'язані
до цих IDs, вони також є у виконавців та історії. Просте копіювання dev-баз на
сервер із production-ключами не виконує міграцію. Якщо дані реальні, спершу потрібні
погоджене зіставлення користувачів/автомалярок і перевірена міграція копії бази.
Не видаляйте прив'язки й не запускайте таку базу як порожню для обходу перевірок.
Для нового production-запуску без перенесення використовуйте порожню `data/`.

## 5. Резервні копії

На поточному EC2 встановлено `paintauto-backup.timer`: щодня о 02:15 UTC
із випадковою затримкою до 10 хвилин він запускає `deploy/backup-to-s3.sh`.
Кожна SQLite-база копіюється онлайн, проходить `integrity_check`, після чого
архів завантажується у приватне S3-сховище через EC2 IAM-роль із правом лише
записувати власні backup-об'єкти. Постійних AWS access keys на сервері немає.
Завантаження через роль перевірено; сам upload використовує AES256.
Bucket та роль вказані в локальному `.artifacts/deploy/aws-resources.json`.

У S3 ввімкнені Block Public Access, versioning і lifecycle: поточні архіви
зберігаються 30 днів, noncurrent versions — ще до 30 днів після переходу в цей стан.
Локальні завершені знімки старші за 7 днів очищаються лише після успішного
вивантаження нової копії. Якщо баз ще немає, таймер пропускає копіювання.
Це зовнішні щодо EC2 копії, але вони залишаються в тому самому AWS-акаунті:
при закритті Free plan доступ до S3 також припиниться. До закінчення плану
потрібно вивантажити копії в інше місце або перейти на погоджену оплату.

Перевірка й ручний запуск на сервері:

```bash
sudo systemctl list-timers paintauto-backup.timer --no-pager
sudo systemctl start paintauto-backup.service
sudo journalctl -u paintauto-backup.service -n 50 --no-pager
```

Не додавайте наведений нижче cron паралельно з уже встановленим timer.
Далі — команди для ручної локальної копії й альтернативного cron-налаштування.

Онлайн-копія всіх наявних баз через SQLite backup API, з `integrity_check`:

```bash
cd /opt/rkr-crm
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T crm node /opt/crm/backup.mjs /app/data/crm.sqlite /backups
```

Кожний успішний запуск створює `backups/crm-ДАТА-СУФІКС/` із базами та
`manifest.json`. Незавершена копія не публікується як успішна. Кожна база має
узгоджений знімок, але нові автомалярки, створені після початку переліку файлів,
потраплять у наступну копію. Без баз скрипт завершується помилкою.

Для щоденного запуску додайте через `sudo crontab -e`:

```cron
15 2 * * * cd /opt/rkr-crm && /usr/bin/docker compose --env-file .env.production -f compose.production.yaml exec -T crm node /opt/crm/backup.mjs /app/data/crm.sqlite /backups >> /var/log/rkr-crm-backup.log 2>&1
```

Це час сервера. Контролюйте виконання, вільне місце та накопичення архівів; скрипт
не видаляє попередні копії. Налаштуйте окреме вивантаження на погоджене сховище
або завантажуйте копії на свій комп'ютер через SSH. До налаштування зовнішнього
копіювання втрата VM означає втрату і цих локальних backup-файлів.
Не робіть сховище з клієнтськими даними публічним.

Для відновлення зупиніть `crm`, збережіть поточну `data/` окремо та скопіюйте всі
`.sqlite` із вибраного завершеного backup-каталогу в **порожню** `data/`. Не залишайте
WAL/SHM від іншої версії бази. Відновіть власника `1000:1000`, запустіть CRM і
перевірте організації, замовлення, платежі та залишки. Ключі Clerk мають належати
тому самому instance, з яким працювала відновлена база.

## 6. Оновлення: готовий образ із GitHub Actions

### Етапи в Actions

[Workflow PaintAuto](https://github.com/BYTULOCHKIN/rkr-car-paint-crm/actions/workflows/ci.yml)
автоматично запускається після push / merge у `main`. Pull requests і ручний
workflow_dispatch запускають перевірки, без production-деплою.

1. **Перевірки коду:** TypeScript, lint, бізнес-логіка, UI, резервні копії,
   доставка образу, відкат і протокол повідомлення про етапи.
2. **Збірка готового ARM64-образу:** GitHub runner відновлює кеш Bun та
   `.next/cache`, виконує звичайний `next build` зі standalone output,
   пакує результат через `deploy/Dockerfile.runtime`. Збірка перевіряє роботу
   SQLite та sharp усередині образу без мережі.
3. **Доставка:** образ стискається швидким gzip, до маніфесту додаються SHA256,
   розмір, архітектура та commit. Draft prerelease `paintauto-deploy-<sha>`
   публікується лише після завантаження обох assets. Опублікований реліз
   цього commit незмінний; повторний запуск не перезаписує його assets.
4. **Розгортання на AWS:** Actions окремо показує завантаження, перевірку SHA256,
   імпорт, S3 backup, запуск контейнера і публічний HTTPS healthcheck.
   У Summary є таблиця з фактичною тривалістю кожного етапу на сервері.

Зелений workflow підтверджує **фактичне розгортання саме його commit**.
Помилка конкретного етапу або відкат відображаються в Actions одразу після
отримання статусу від EC2, без очікування загального timeout.

### Чому це швидше

EC2 з 2 ГБ RAM більше не компілює Next.js і не перевіряє TypeScript.
Це робить стандартний ARM64 GitHub runner із 4 CPU та 16 ГБ RAM.
Кеш `.next/cache` зберігається між комітами; залежності встановлюються за
`bun.lock` з кешу Bun. Docker-образ містить уже готові standalone-файли,
static, public і backup-скрипт — runtime Dockerfile не запускає build.

На сервері `paintauto-deploy.timer` перевіряє публічний `main` кожні 20 секунд.
Готовність релізу визначається через публічний download маніфесту, тому немає
додаткового трихвилинного очікування GitHub REST API. GitHub Actions показує
час build окремо від доставки та запуску; 5–7 секунд локального build
не включають перевірки, передачу образу, backup і перевірку production.

### Налаштування й захист даних

Єдина змінна репозиторію для збірки:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...` у Settings → Secrets and
variables → Actions → Variables. Це публічний ключ; він вбудовується в браузерний
код. Домен і redirect URLs задані у workflow. `CLERK_SECRET_KEY` залишається
лише в `/opt/rkr-crm/.env.production`, а не в CI чи образі.

Образ і маніфест — публічні assets у Releases публічного репозиторію.
Спеціальний Docker ignore allowlist передає тільки готовий runtime:
робочі бази, backup, локальні env-файли та кеші до нього не потрапляють.
Якщо репозиторій стане приватним, перед цим потрібно змінити спосіб доставки.

Контролер `/usr/local/lib/paintauto/autodeploy.py` завантажує образ конкретного
commit, перевіряє його розмір і SHA256, після `docker load` перевіряє ARM64
та OCI revision label. Невідповідний образ не заміняє production.
Якщо `main` просунувся під час завантаження, застарілий commit пропускається.

Перед заміною контейнера виконується наявний S3 backup service та зберігаються
попередні образ і конфігурація. `.env.production`, SQLite у `data/`,
`backups/` і TLS volumes залишаються на сервері; змінюється лише `CRM_IMAGE`
та reviewed конфігурація. При помилці запуску/HTTPS перевірки повертаються
попередні образ і конфігурація. **База автоматично не відновлюється**:
міграції мають бути сумісними з попередньою версією. Несумісні міграції
потребують окремого плану оновлення та відновлення.

Залишаються три release-образи та два rollback-теги на EC2, включно з активними
образами. При менш ніж 3 GiB вільного місця новий деплой не починається.
На EC2 не встановлюється GitHub runner, SSH для GitHub не відкривається,
постійні AWS/GitHub access keys не потрібні. AWS Free plan не змінюється.
Стандартні Actions runners безкоштовні для public repositories; Releases
не мають загальної квоти обсягу чи трафіку, окремий asset має бути < 2 GiB.
Наш контролер додатково обмежує compressed image до 1 GiB.

### Діагностика та керування

Публічний endpoint повертає лише SHA, назви етапів, результати та тривалість:
`https://paintauto.pp.ua/.well-known/paintauto-release.json`.
Він не містить runtime-секретів чи клієнтських даних.

На сервері:

```bash
sudo systemctl list-timers paintauto-deploy.timer --no-pager
sudo journalctl -u paintauto-deploy.service -n 100 --no-pager
sudo cat /var/lib/paintauto-deploy/current-sha
```

Для першого встановлення на вже налаштований EC2: скопіювати reviewed checkout
без секретів в окремий каталог, перейти в нього та виконати
`sudo bash deploy/install-autodeploy.sh ПОТОЧНИЙ_GITHUB_MAIN_SHA`.
Аргумент пропускає старий main і не розгортає його поверх наявної CRM.

Невдалий commit записується в `/var/lib/paintauto-deploy/failed-sha`,
щоб не повторювати його автоматично кожні 20 секунд.
Новий виправлений push запускається звичайно. Для повторної спроби того самого
commit після усунення причини:

```bash
sudo rm -f /var/lib/paintauto-deploy/failed-sha
sudo systemctl start paintauto-deploy.service
```

Для паузи: `sudo systemctl stop paintauto-deploy.timer`. Це не перериває
запущений service і не зупиняє CRM. Відновлення: `sudo systemctl start
paintauto-deploy.timer`. Не запускайте паралельно ручне оновлення контейнерів.
Після зміни build-time налаштувань потрібен новий commit/release.

Джерела: [GitHub ARM64 runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[GitHub Releases quotas](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
[Next.js CI cache](https://nextjs.org/docs/app/guides/ci-build-caching),
[Docker-specific ignore files](https://docs.docker.com/build/concepts/context/#dockerignore-files).
