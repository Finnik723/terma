# Проверка PostgreSQL/Liquibase

Дата: 26 октября 2026 года. Объём — инфраструктурная [задача №6](https://github.com/Finnik723/terma/issues/6), без предметных таблиц и научных вычислений. Сценарии — [storage-foundation.md](storage-foundation.md), команды — [development.md](development.md).

Локально на Windows 10 без Docker/WSL2/VPS:

- `mvnw.cmd --batch-mode --no-transfer-progress verify`: модули storage/backend/worker собраны; 6 JVM-тестов без ошибок и пропусков. Проверены обязательные параметры, исключение credentials из URL и конечные таймауты; HTTP/lifecycle изолированы от БД.
- `mvnw.cmd --batch-mode --no-transfer-progress -Ppostgresql-it -DskipITs verify`: интеграционный harness компилируется. Это только проверка сборки harness, **не прохождение PostgreSQL-интеграции**.
- `node --test tools/runtime.test.mjs tools/frontend-config.test.mjs tools/storage-startup.test.mjs`: 5 успешных проверок, включая ненулевой код обоих настоящих JAR без datasource.
- Frontend typecheck/build и 8 компонентных тестов прошли на закреплённом Node 24.22.1. Итоговая проверка ссылок: 246 локальных целей; 27 тестов контракта прошли отдельно.
- Локальная PostgreSQL-интеграция: **NOT_RUN**, доступной БД/Docker нет. H2 и фиктивная БД не используются.

Обязательный Linux CI job `PostgreSQL migrations and startup failures` поднимает PostgreSQL 18.6 из закреплённого digest и запускает профиль без skip. Проверяются оба настоящих JAR: миграции на чистой схеме, повторный/конкурентный старт, checksum и сохранность технической записи, отсутствующие параметры, недоступная БД, неверный пароль, ошибочный changeset, checksum mismatch, обрыв соединения на старте и занятый lock. Перед стартом тест подтверждает database metadata PostgreSQL; отсутствие сервиса — ошибка job.

## Фактический PostgreSQL CI

[Прогон b6e894a](https://github.com/Finnik723/terma/actions/runs/40350200799) подтвердил SUCCESS Windows/Linux build-unit и [PostgreSQL job](https://github.com/Finnik723/terma/actions/runs/40350200799/job/121668798214). Все **6 PostgreSqlIT-тестов** прошли: 0 ошибок, 0 пропусков, 206 секунд. Внутри тестов проверены оба JAR и все перечисленные выше положительные/отрицательные случаи. При timeout сохраняются locked=true, исходный владелец и история; для этого тест подготавливает корректную lock-строку с timestamp и отдельный ожидающий changeset. Простая блокировка уже актуальной БД не используется как доказательство ожидания: Liquibase может пройти без новой миграции.

[Process/HTTP/E2E первого прогона 65d297f](https://github.com/Finnik723/terma/actions/runs/40347726572/job/121660082721) завершился SUCCESS с реальной PostgreSQL: worker bootstrap/миграции, backend liveness, отрицательные старты и два настоящих browser-прогона, включая изоляцию окружения. После этого runtime-код и changelog не менялись; исправления касались только тестовых условий и документации. Актуальный статус повторных browser jobs и документационных коммитов виден в [Checks PR №36](https://github.com/Finnik723/terma/pull/36/checks).

Linux process/HTTP/E2E использует отдельный PostgreSQL service container. Liveness не объявляется научной или инфраструктурной приёмкой. Kafka, задания и сохранение предметных объектов не реализованы.
