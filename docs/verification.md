# Проверка application-scaffold

Дата: 25 октября 2026 года. Объём — [согласованный дизайн](development.md); команды воспроизведения — [development.md](development.md). Проверки категорий не заменяют друг друга.

## Фактически выполнено локально

Среда: Windows 10, build 19045, x64; Temurin 25.0.4.1+1, Maven 3.10.0 через Wrapper, Node 24.22.1, npm 11.19.1. WSL2, Docker и пользовательский VPS не использовались.

| Категория | Фактический результат |
| --- | --- |
| JVM build/unit | `mvnw.cmd --batch-mode --no-transfer-progress verify`: два executable JAR, 3 теста, 0 ошибок/пропусков |
| Frontend build | `npm run build`: typecheck и production assets успешны |
| Component tests | `npm test`: 8 успешных тестов; fetch подменяется только в этих компонентных тестах |
| Configuration/negative HTTP | 4 Node-теста: некорректный frontend-порт, credentials в proxy URL без утечки значения, занятый порт, ненулевой positive-check при недоступном backend |
| Повторяемая установка | Два `npm ci` оставили SHA-256 lockfile неизменным; npm ci отклонил отдельную временную копию с рассогласованными manifest/lockfile |
| Prerequisites | Старый установленный Node 22.14 и неверный JAVA_HOME отклонены; выбранный Wrapper запускается на Temurin 25 |
| Процессы / настоящий HTTP | `node tools/process-smoke.mjs`: worker bootstrap, корректное закрытие/код 0, отказ некорректной worker-конфигурации; настоящий backend liveness; отклонены занятый порт, неверный SERVER_PORT и публичный bind |
| UI / настоящий backend | Во встроенном браузере на Windows: нажата кнопка, получен реальный положительный HTTP-ответ; backend остановлен, повторная проверка показывает недоступность. Положительный ответ не подменялся |
| Отсутствие скрытой инфраструктуры | В backend JAR нет H2, PostgreSQL и Kafka-библиотек; нет доменных API, научной заглушки или обработчика заданий |

## Чистый checkout и CI

Проверен отдельный чистый локальный клон коммита `20e6ec4` на Windows 10: Wrapper verify, npm ci/build/test, четыре Node-теста, process smoke и проверка ссылок прошли. Рабочее дерево клона осталось чистым; WSL2/Docker/VPS не использовались.

[CI run 40211438477](https://github.com/Finnik723/terma/actions/runs/40211438477) для того же коммита завершился успешно:

| Job | Результат |
| --- | --- |
| Build and unit (ubuntu-24.04) | SUCCESS: JVM/frontend сборки и обычные тесты, configuration/negative HTTP tests, ссылки |
| Build and unit (windows-2022) | SUCCESS: тот же обязательный набор через Windows Wrapper/npm |
| Linux processes and real frontend/backend HTTP | SUCCESS: bootstrap JAR, настоящий liveness, отрицательные старты и 1 Playwright-тест реального frontend/backend HTTP |

Playwright сначала получил настоящий положительный ответ backend, затем подтвердил ошибку UI после остановки backend; `ECONNREFUSED` во второй части теста ожидаем и не является сбоем job. В runtime-логах JVM подтверждён Java 25.0.4.1. Установка Chromium заняла несколько минут, но не пропускалась. Тесты не используют VPS и Docker.

Итого критерии каркаса проверены; задачи реализации отмечены по этим результатам. Этот отчёт и отметки задач добавлены последующим документационным коммитом без изменения кода приложения. Актуальные проверки последующих коммитов видны в [PR №2](https://github.com/Finnik723/terma/pull/2). Самостоятельный merge не выполнялся.

## Уточнение ревью P2: изоляция E2E

В коммите `97bb704` тестовые адреса вынесены в единый `frontend/e2e/settings.ts`. Playwright baseURL и ожидание preview, `webServer.env`, адрес/порт JVM и liveness-проверка используют согласованные значения. Пользовательские env-файлы локально не изменялись.

[CI исправления 40213692665](https://github.com/Finnik723/terma/actions/runs/40213692665) завершился успешно: Windows/Ubuntu build-unit и Linux process/HTTP. Browser job выполнил два реальных прогона по одному тесту: обычный и регрессионный. Во втором окружение задавало frontend 5199, backend 8081 и SERVER_ADDRESS `::1`, а отдельный `.env.local` — frontend 5198 и backend 8082. Несмотря на эти пользовательские значения, тестовые preview/proxy/JVM согласованно использовали собственные 5173/8080 и loopback. Положительный HTTP-ответ не подменялся, отрицательный сценарий после остановки JVM также прошёл.

Локально повторно прошли typecheck/build, 8 компонентных тестов и загрузка списка Playwright-тестов; сам browser smoke на Windows 10 не запускался. Результаты E2E считались подтверждёнными только после CI исправления. Последующий коммит с этим отчётом меняет только документацию/прогресс; его CI виден в PR Checks.

## Исключённые проверки каркаса

PostgreSQL/Kafka availability и их интеграции: **NOT_CONFIGURED / NOT_RUN**. Это граница каркаса, не успешные или скрыто пропущенные проверки. Docker/Testcontainers, VPS и научная корректность не проверялись. Автоматический Playwright на Windows 10 не запускался: предусмотрен поддерживаемый Linux CI-путь; Windows UI проверен отдельно.
