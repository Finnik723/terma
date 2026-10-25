# Сборка, запуск и проверки каркаса

Документ описывает только технический `application-scaffold`. Здесь нет расчётов, scientific stub, доменных API, БД, брокера, прав или обработки заданий. Адаптер и научные контракты будут отдельным изменением. Версии и источники — [technology-baseline.md](technology-baseline.md), согласованный объём — [design](../openspec/changes/application-scaffold/design.md).

## Windows 10: предпосылки

Нужны Temurin **25.0.4.1+1**, Node **24.22.1** с npm **11.19.1** и Git. Maven устанавливать не нужно: он загружается Wrapper с проверкой SHA-256. Первые сборки/установки требуют доступа к Maven Central/npm; WSL2, Docker, PostgreSQL, Kafka и VPS не нужны. Не требуется платная поддержка Spring в IDE.

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
node --test tools/runtime.test.mjs tools/frontend-config.test.mjs
node tools/check-doc-links.mjs
openspec.cmd validate --all --strict --no-interactive
```

JVM-сборка независима от frontend: корневой Maven reactor собирает `backend/target/terma-backend.jar` и `worker/target/terma-worker.jar`. Frontend независимо выпускает `frontend/dist/`. `npm ci` не обновляет lockfile; изменение зависимостей требует намеренного обновления manifest/lockfile. `.npmrc` и preinstall проверяют Node/npm.

JVM-тесты проверяют реальный локальный HTTP liveness и lifecycle worker context. Компонентные тесты подменяют fetch для контролируемых ответов/ошибок/таймаута и не называются HTTP-интеграцией. Node-тесты проверяют ошибки технической конфигурации, занятый frontend-порт и ненулевой результат положительного HTTP-check при недоступном backend.

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

Успех — маркер `WORKER_BOOTSTRAP_OK`, явные `infrastructure=NOT_CHECKED`, `jobProcessing=NOT_IMPLEMENTED` и код завершения 0. Context корректно закрывается. Потребителя Kafka и обработки задач нет.

Автоматическая проверка собранных JAR:

```powershell
Set-Location 'C:\Users\79067\source\repos\terma'
node tools/process-smoke.mjs
```

Она запускает/останавливает только свои дочерние JVM, ограничивает время ожидания, проверяет bootstrap worker, реальный backend HTTP, ошибки worker-конфигурации, порта и публичного bind. Backend в положительной проверке настоящий; mock не используется. Эта команда не проверяет браузер и инфраструктуру.

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

Весь environment в bundle не копируется. `TERMA_BACKEND_URL` не допускает credentials, произвольных внешних hosts, path/query/fragment. Серверные секреты не должны попадать и в `VITE_*`: эти значения публичны. На текущем каркасе никаких секретов не требуется.

## Linux/Windows CI и пределы проверок

[CI](../.github/workflows/ci.yml) имеет отдельные результаты:

| Проверка | Среда и смысл |
| --- | --- |
| Build and unit | Ubuntu 24.04 и Windows Server 2022: Wrapper, npm ci, typecheck/build, JVM/component/configuration tests, ссылки, OpenSpec strict |
| Linux processes and real frontend/backend HTTP | Ubuntu 24.04: собранные JAR, process smoke, Chromium и настоящий браузерный HTTP через Vite preview; проверяется также остановка backend |
| PostgreSQL/Kafka availability | Не настроено и не выполняется |
| PostgreSQL/Kafka integrations | Не реализовано и не выполняется; H2 и фиктивный брокер не используются |

Playwright на Windows 10 не является поддерживаемым локальным путём. На Linux после тех же сборок автоматический браузерный smoke выполняется из `frontend` командами `npx --no-install playwright install --with-deps chromium` и `npm run test:e2e`. Ему нужны настоящий backend JAR и Java, свободные локальные порты 8080/5173 и доступ для загрузки браузера. Docker и VPS не нужны. Все запущенные тестом процессы останавливаются; отсутствие обязательной зависимости не превращается в skip или успешный результат.

E2E использует собственные адреса из `frontend/e2e/settings.ts`: Playwright baseURL/ожидание preview, `webServer.env` и параметры JVM согласованы между собой. Пользовательские `TERMA_FRONTEND_PORT`, `TERMA_BACKEND_URL`, `SERVER_PORT`, `SERVER_ADDRESS` и локальные `.env` не выбирают адреса теста. Это не отменяет требование свободных тестовых портов. В Linux CI есть отдельный реальный E2E-прогон с отличающимися environment и `.env.local`; файл создаётся только в чистой CI-копии с проверкой отсутствия и удаляется после прогона.

Сборка не доказывает запуск, запуск не доказывает HTTP, HTTP не доказывает доступность БД/брокера или научную корректность. Матрица исходной приёмки — D-07 в design; фактические результаты и ссылки на CI — в [отчёте проверки](verification.md).

## Граница дальнейшего расширения

Сборочные зависимости backend и worker раздельны; общего доменного модуля нет. Будущий адаптер и доступ к научным данным добавляются в сторону worker после согласования контракта, без привязки backend к неизвестному формату HCh/Unitherm. Нынешний bootstrap этого контракта не реализует. Инфраструктура развивается по [отдельному плану](infrastructure-plan.md).
