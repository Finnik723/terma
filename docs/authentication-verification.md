# Проверка аутентификации

Дата: 26 октября 2026 года. Объём и сценарии — [authentication.md](authentication.md), REST — [OpenAPI](api/auth.openapi.json).

Локально Windows 10: `mvnw.cmd verify` пройден (**10 JVM-тестов**, включая 6 backend); frontend build/typecheck и **15 компонентных тестов пройдены**, также пройдены **5 Node-проверок** конфигурации/негативного старта JAR. Компиляция PostgreSQL-профиля с `-Ppostgresql-it -DskipTests package` успешна, но это не прогон интеграции. Настоящий HTTP с тестовым account store проверяет CSRF, session fixation, старую cookie после logout, отказ неизвестным/disabled аккаунтам и cookie flags. Эта изолированная проверка не выдаётся за подключение к PostgreSQL.

PostgreSQL-профиль расширен проверкой двух аккаунтов, BCrypt hash, повторного старта без сброса пароля, disabled/SQL injection, отказа невалидному provisioning без частичных записей. Браузерный тест использует настоящий backend и PostgreSQL, проверяет вход, reload, выход, вторую запись и cookie. CI создаёт случайные временные пароли один раз на job и повторно использует их для проверки конфигурационной изоляции. Локальная PostgreSQL и браузерные проверки не выполнялись: они запускаются обязательными Linux CI jobs. Фактический итог CI будет добавлен после выполнения.

Команды обычных сборок остаются в [development.md](development.md). Проверка PostgreSQL — `./mvnw --batch-mode --no-transfer-progress -Ppostgresql-it verify` в изолированном CI-сервисе с внешними SPRING_DATASOURCE_URL/USERNAME/PASSWORD. Сессии не переживают restart, матрица проектных прав и научная приёмка в объём проверки не входят.
