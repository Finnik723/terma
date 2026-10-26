# Проверка PostgreSQL/Liquibase

Дата: 26 октября 2026 года. Объём — инфраструктурная [задача №6](https://github.com/Finnik723/terma/issues/6), без предметных таблиц и научных вычислений. Сценарии — [storage-foundation.md](storage-foundation.md), команды — [development.md](development.md).

Локально на Windows 10 без Docker/WSL2/VPS:

- `mvnw.cmd --batch-mode --no-transfer-progress verify`: модули storage/backend/worker собраны; 6 JVM-тестов без ошибок и пропусков. Проверены обязательные параметры, исключение credentials из URL и конечные таймауты; HTTP/lifecycle изолированы от БД.
- `mvnw.cmd --batch-mode --no-transfer-progress -Ppostgresql-it -DskipITs verify`: интеграционный harness компилируется. Это только проверка сборки harness, **не прохождение PostgreSQL-интеграции**.
- `node --test tools/runtime.test.mjs tools/frontend-config.test.mjs tools/storage-startup.test.mjs`: 5 успешных проверок, включая ненулевой код обоих настоящих JAR без datasource.
- Frontend typecheck/build и 8 компонентных тестов прошли на закреплённом Node 24.22.1. Проверка ссылок: 244 локальные цели; 27 тестов контракта прошли отдельно.
- Локальная PostgreSQL-интеграция: **NOT_RUN**, доступной БД/Docker нет. H2 и фиктивная БД не используются.

Обязательный Linux CI job `PostgreSQL migrations and startup failures` поднимает PostgreSQL 18.6 из закреплённого digest и запускает профиль без skip. Проверяются оба настоящих JAR: миграции на чистой схеме, повторный/конкурентный старт, checksum и сохранность технической записи, отсутствующие параметры, недоступная БД, неверный пароль, ошибочный changeset, checksum mismatch, обрыв соединения на старте и занятый lock. Перед стартом тест подтверждает database metadata PostgreSQL; отсутствие сервиса — ошибка job.

Linux process/HTTP/E2E использует отдельный PostgreSQL service container. Liveness не объявляется научной или инфраструктурной приёмкой. Kafka, задания и сохранение предметных объектов не реализованы. Итог и ссылка на CI добавляются после фактического прогона.
