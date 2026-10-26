# Сборка, запуск и проверки

Backend и worker используют PostgreSQL и общий Liquibase changelog из модуля `storage`. Предметных таблиц, доменных API, расчётов и Kafka-потребителя пока нет. Версии — [technology-baseline.md](technology-baseline.md), критерии хранения — [storage-foundation.md](storage-foundation.md).

## Windows 10: предпосылки

Нужны Temurin **25.0.4.1+1**, Node **24.22.1** с npm **11.19.1** и Git. Maven загружается Wrapper с проверкой SHA-256. Первые сборки/установки требуют доступа к Maven Central/npm; сборки и изолированные тесты не требуют WSL2, Docker, PostgreSQL, Kafka или VPS. Для штатного запуска backend/worker нужна доступная PostgreSQL, как описано ниже. Платная поддержка Spring в IDE не требуется.

На компьютере пользователя выбранный toolchain уже установлен отдельно от системного Node. Для каждого терминала ниже используется это окружение:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
$env:JAVA_HOME='C:\Users\79067\AppData\Local\Programs\terma-toolchain\jdk-25.0.4.1+1'
$env:Path='C:\Users\79067\AppData\Local\Programs\terma-toolchain\node-v24.22.1-win-x64;'+$env:JAVA_HOME+'\bin;'+$env:Path
java -version
node --version
npm.cmd --version
.\mvnw.cmd --version
```

Выбранные версии зафиксированы в `.java-version`, `.node-version`, Wrapper и frontend manifest/lockfile. На другой машине JDK/Node устанавливаются в её собственные каталоги; существующие команды выше соответствуют этому компьютеру. Системный Node 22.14 отклоняется frontend-проверкой. Maven Enforcer отклоняет Java вне ветки 25 и другой Maven.

## Сборка и обычные тесты

После настройки окружения:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
.\mvnw.cmd --batch-mode --no-transfer-progress verify
Set-Location 'C:\Users\79067\source\repos\terma\frontend'
npm.cmd ci --no-fund
npm.cmd run build
npm.cmd test
Set-Location 'C:\Users\79067\source\repos\terma'
node --test tools/runtime.test.mjs tools/frontend-config.test.mjs tools/storage-startup.test.mjs
node tools/check-doc-links.mjs
```

JVM-сборка независима от frontend: корневой Maven reactor собирает `backend/target/terma-backend.jar` и `worker/target/terma-worker.jar`. Frontend независимо выпускает `frontend/dist/`. `npm ci` не обновляет lockfile; изменение зависимостей требует намеренного обновления manifest/lockfile. `.npmrc` и preinstall проверяют Node/npm.

JVM-тесты проверяют конфигурацию хранения и изолированные HTTP/lifecycle-контексты: test-only конфигурации исключают datasource и не попадают в JAR. Они не доказывают подключение к PostgreSQL. Компонентные тесты подменяют fetch для контролируемых ошибок/таймаута. Node-тесты проверяют техническую конфигурацию и негативный HTTP-check.

## PostgreSQL: настройки до запуска JAR

Для штатного запуска обоих приложений нужна доступная PostgreSQL и роль с правами подключения и миграции в выбранной схеме. Установку БД и доступ к VPS эта задача не выполняет. В каждом терминале JVM задайте внешнюю конфигурацию; реальные значения не записывайте в Git и не отправляйте в чат:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
$env:SPRING_DATASOURCE_URL = Read-Host 'JDBC URL доступной PostgreSQL без credentials'
$env:SPRING_DATASOURCE_USERNAME = Read-Host 'Имя пользователя БД'
$dbPassword = Read-Host 'Пароль БД' -AsSecureString
$env:SPRING_DATASOURCE_PASSWORD = [System.Net.NetworkCredential]::new('', $dbPassword).Password
Remove-Variable dbPassword
```

Безопасная форма URL показана в [.env.example](../.env.example). Spring Boot не загружает этот файл автоматически. Вместо переменных допустим отдельный защищённый Spring configuration file вне Git; пароль не передаётся в аргументах JVM, URL или `VITE_*`.

`StorageConfiguration` требует все три datasource-поля и PostgreSQL URL. Hikari pool: максимум 4 соединения, получение соединения до 10 секунд; JDBC connect/login/socket timeout — 10 секунд. Liquibase применяет master XML до успешного старта. Лимит advisory lock начальной инициализации — 45 секунд, штатного Liquibase lock — 1 минута. Нет H2, Hibernate DDL, SQL-init, автоматического сброса checksum/lock или успешного режима без БД. Базовый changeset создаёт только историю Liquibase; предметные таблицы добавляются другими задачами.

Отсутствующее поле, ошибка соединения/аутентификации или миграции завершают старт ненулевым кодом. Обрыв уже работающего приложения и восстановление заданий не являются поведением этой инфраструктурной задачи. Параметры `spring.liquibase.enabled` не отключают явно подключённую общую конфигурацию. При необходимости внешнего master используется `spring.liquibase.change-log`, но обычный запуск использует ресурс из `storage`.

## Запуск backend

В первом терминале с указанным окружением:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
java -jar backend/target/terma-backend.jar
```

Во втором терминале:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/actuator/health/liveness'
```

Ожидается `status: UP`. Это только ответ живого процесса. БД, Kafka, worker и научная подсистема им не проверяются. Остановка — `Ctrl+C` в терминале backend. Занятый порт или недопустимое значение дают ошибку, не ложный успех.

## Запуск frontend и ручная HTTP-проверка

В отдельном терминале с выбранным Node/npm:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma\frontend'
npm.cmd run dev
```

Открыть [локальный экран](http://127.0.0.1:5173) и нажать «Проверить связь». При работающем backend ожидается «Backend ответил на технический HTTP-запрос». После остановки backend повторная проверка показывает недоступность; предыдущий успех не сохраняется как актуальный. PostgreSQL/Kafka и worker остаются явно не проверенными.

Для просмотра уже собранного frontend вместо dev используется отдельная команда:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma\frontend'
npm.cmd run preview
```

Dev и preview используют порт 5173 с `strictPort` и ограниченным proxy только для `/actuator/health/liveness`. При занятом порте запуск завершается ошибкой, без автоматического перехода на другой порт. Preview предназначен для технической проверки, не для production hosting. По завершении — `Ctrl+C`.

## Worker и smoke отдельных процессов

Worker первого каркаса — конечная проверка bootstrap, не постоянный daemon:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
java -jar worker/target/terma-worker.jar
```

Успех — `WORKER_BOOTSTRAP_OK; postgresql=MIGRATED`, `kafka=NOT_IMPLEMENTED`, `jobProcessing=NOT_IMPLEMENTED` и код 0. Контекст и пул соединений закрываются. При ошибке БД/миграции успешный маркер не печатается. Worker остаётся конечной проверкой bootstrap, а не потребителем Kafka.

Автоматическая проверка собранных JAR:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
node tools/process-smoke.mjs
```

Команда требует тех же datasource-переменных, запускает/останавливает свои JVM и проверяет bootstrap с миграциями, реальный HTTP, ошибки конфигурации, порта и bind. Отдельные глубокие проверки хранения выполняет интеграционный профиль ниже. Kafka и научные вычисления отсутствуют.

## Конфигурация через окружение

Корневой `.env.example` — инструкция, а не автоматически читаемый Spring Boot файл. Например, альтернативный локальный порт backend задаётся в его терминале:

```powershell
$env:SERVER_ADDRESS='127.0.0.1'
$env:SERVER_PORT='8081'
Set-Location 'C:\Users\79067\source\repos\terma'
java -jar backend/target/terma-backend.jar
```

В терминале frontend ему соответствует:

```powershell
$env:TERMA_BACKEND_URL='http://127.0.0.1:8081'
$env:TERMA_FRONTEND_PORT='5173'
Set-Location 'C:\Users\79067\source\repos\terma\frontend'
npm.cmd run dev
```

Vite явно читает allowlist `TERMA_*` для своего proxy/порта. Их также можно задать в локальном `frontend/.env.local`, ориентируясь на `frontend/.env.example`; после изменения конфигурации процесс перезапускается. Примеры не содержат серверных адресов и секретов. Backend принимает только loopback; `SERVER_PORT=0` предназначен для технической проверки с автоматически выбранным свободным портом. В обычном запуске — 8080 или явно выбранный порт.

Весь environment в bundle не копируется. `TERMA_BACKEND_URL` не допускает credentials, произвольных внешних hosts, path/query/fragment. Серверные секреты не должны попадать в `VITE_*`: эти значения публичны. Datasource-параметры принадлежат JVM и не добавляются в frontend configuration.

## Linux/Windows CI и пределы проверок

[CI](../.github/workflows/ci.yml) имеет отдельные результаты:

| Проверка | Среда и смысл |
| --- | --- |
| Build and unit | Ubuntu 24.04 и Windows Server 2022: Wrapper, npm ci, typecheck/build, JVM/component/configuration tests, ссылки |
| Linux processes and real frontend/backend HTTP | Ubuntu 24.04: собранные JAR, process smoke, Chromium и настоящий браузерный HTTP через Vite preview; проверяется также остановка backend |
| PostgreSQL migrations and startup failures | Ubuntu 24.04 и отдельная PostgreSQL 18.6 service container: оба JAR, миграции, повторный/конкурентный старт, сохранность технической записи и негативные старты |
| Kafka availability/integration | Не реализовано и не выполняется |

Playwright на Windows 10 не является поддерживаемым локальным путём. На Linux после сборок browser smoke выполняется из `frontend` командами `npx --no-install playwright install --with-deps chromium` и `npm run test:e2e`. Нужны backend JAR, Java, настроенная доступная PostgreSQL, свободные порты 8080/5173 и загрузка браузера. CI использует свою изолированную БД, без VPS. Все дочерние процессы останавливаются; отсутствие обязательной зависимости не превращается в skip.

## Настоящая PostgreSQL-интеграция

Профиль создаёт и удаляет только свои случайные `terma_it_*` схемы в заданной БД. Используйте выделенную тестовую БД, а не рабочие данные. Нужны права CREATE SCHEMA и подключения к ней. Без PostgreSQL/обязательных переменных профиль падает, а не пропускается. Подготовив datasource-переменные выше, на Windows выполните:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
.\mvnw.cmd --batch-mode --no-transfer-progress -Ppostgresql-it verify
```

В Linux CI из корня выполняется `./mvnw --batch-mode --no-transfer-progress -Ppostgresql-it verify`. Модуль `storage-integration` запускает настоящие backend/worker JAR, проверяет PostgreSQL metadata, единственную историю/checksum, техническую запись после рестарта, конкурентную инициализацию, неполную конфигурацию, недоступность, неверный пароль, ошибочный changeset, checksum mismatch, обрыв соединения при старте и занятый lock. БД в CI поднимается из закреплённого digest; рабочие данные/VPS не используются. На локальном Windows без БД выполняется обычный `verify`, а интеграция считается `NOT_RUN`.

E2E использует собственные адреса из `frontend/e2e/settings.ts`: Playwright baseURL/ожидание preview, `webServer.env` и параметры JVM согласованы между собой. Пользовательские `TERMA_FRONTEND_PORT`, `TERMA_BACKEND_URL`, `SERVER_PORT`, `SERVER_ADDRESS` и локальные `.env` не выбирают адреса теста. Это не отменяет требование свободных тестовых портов. В Linux CI есть отдельный реальный E2E-прогон с отличающимися environment и `.env.local`; файл создаётся только в чистой CI-копии с проверкой отсутствия и удаляется после прогона.

Сборка не доказывает запуск, запуск не доказывает HTTP, HTTP не доказывает доступность БД/брокера или научную корректность. Исходные критерии — в [технических требованиях](technical-requirements.md); фактические результаты и ссылки на CI — в [отчёте проверки](verification.md).

## Граница дальнейшего расширения

Сборочные зависимости backend и worker раздельны; общего доменного модуля нет. Будущий адаптер и доступ к научным данным добавляются в сторону worker после согласования контракта, без привязки backend к неизвестному формату HCh/Unitherm. Нынешний bootstrap этого контракта не реализует. Инфраструктура развивается по [отдельному плану](infrastructure-plan.md).
