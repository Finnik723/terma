# Проверка application-scaffold

Дата: 25 октября 2026 года. Объём — [согласованный дизайн](../openspec/changes/application-scaffold/design.md); команды воспроизведения — [development.md](development.md). Проверки категорий не заменяют друг друга. До ревью реализации изменение не архивируется.

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
| Build and unit (ubuntu-24.04) | SUCCESS: JVM/frontend сборки и обычные тесты, configuration/negative HTTP tests, ссылки и OpenSpec strict |
| Build and unit (windows-2022) | SUCCESS: тот же обязательный набор через Windows Wrapper/npm |
| Linux processes and real frontend/backend HTTP | SUCCESS: bootstrap JAR, настоящий liveness, отрицательные старты и 1 Playwright-тест реального frontend/backend HTTP |

Playwright сначала получил настоящий положительный ответ backend, затем подтвердил ошибку UI после остановки backend; `ECONNREFUSED` во второй части теста ожидаем и не является сбоем job. В runtime-логах JVM подтверждён Java 25.0.4.1. Установка Chromium заняла несколько минут, но не пропускалась. Тесты не используют VPS и Docker.

Итого критерии каркаса проверены; задачи реализации отмечены по этим результатам. Этот отчёт и отметки задач добавлены последующим документационным коммитом без изменения кода приложения. Актуальные проверки последующих коммитов видны в [PR №2](https://github.com/Finnik723/terma/pull/2). Самостоятельный merge и архивирование не выполнялись.

## Исключённые проверки

PostgreSQL/Kafka availability и их интеграции: **NOT_CONFIGURED / NOT_RUN**. Это граница каркаса, не успешные или скрыто пропущенные проверки. Docker/Testcontainers, VPS и научная корректность не проверялись. Автоматический Playwright на Windows 10 не запускался: предусмотрен поддерживаемый Linux CI-путь; Windows UI проверен отдельно.
