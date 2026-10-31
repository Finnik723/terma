# Вход и выход: заранее созданные учётные записи

Реализация [задачи №7](https://github.com/Finnik723/terma/issues/7) покрывает REQ-MVP-004 и серверную аутентификацию для REQ-MVP-002/REQ-ACCESS-001. Матрица проектных прав остаётся открытой: `ROLE_USER` означает только наличие учётной записи, не право на проекты или библиотеки. Регистрации, OAuth/SSO и восстановления пароля нет. Контракт REST — [OpenAPI](api/auth.openapi.json), результаты — [проверки](authentication-verification.md).

## Хранение и сессия

Миграция `002-accounts.xml` общего модуля `storage` создаёт `user_account`: UUID, уникальное регистрозависимое ASCII-имя, BCrypt hash (cost 12, salt создаёт encoder), enabled. Открытый пароль в БД не записывается. SQL использует параметры. Отключённая запись не проходит новый вход; уже выданная сессия действует до выхода/таймаута/перезапуска. Немедленный отзыв всех сессий администрацией пока не реализован; при появлении управления пользователями обязателен `REQ-ACCESS-002` из [основы проекта](project-foundation.md).

Spring Security **7.1.2** управляется BOM Spring Boot **4.1.2**, без override. Это стабильная бесплатная зависимость с [Apache-2.0](https://github.com/spring-projects/spring-security/blob/7.1.2/LICENSE.txt); выбранные средства подтверждены [документацией form login](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/form.html), [CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) и [PasswordEncoder](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html).

Сессии хранятся в памяти одного backend; неактивность 30 минут или перезапуск завершают сессию. Cookie `JSESSIONID`: HttpOnly, SameSite=Lax, Path=/, без Domain и постоянного Max-Age. Передача session ID через URL выключена; вход меняет session ID. Все маршруты, кроме получения CSRF-токена, обработки login, liveness и технического error-dispatch, требуют сессию. Отказ — 401 без перенаправления на HTML-форму; ошибочный CSRF — 403. Технический `/error` не содержит предметных данных, stack trace и параметры запроса по умолчанию не раскрываются. Изменяющие запросы любых API, включая login/logout, защищены CSRF.

`Secure=false` допустим только для существующего HTTP-разработческого запуска на loopback. Для HTTPS-окружения обязательна внешняя настройка `TERMA_SESSION_COOKIE_SECURE=true`; её эффект проверяет отдельный HTTP-тест. Доступ через сеть по-прежнему запрещён существующей проверкой SERVER_ADDRESS. Эта задача не развёртывает production: перед таким развёртыванием нужны HTTPS, same-origin маршрутизация `/api` и secure-cookie. Ограничение попыток входа пока **не реализовано**; `REQ-ENV-004` запрещает первое сетевое развёртывание до его реализации и отдельной проверки по [плану инфраструктуры](infrastructure-plan.md). Это обязательное условие, а не необязательное улучшение. Общая session store для нескольких backend пока отсутствует.

## REST и браузер

1. `GET /api/auth/session`: 200 с `{username}` или 401. Frontend выполняет при открытии/перезагрузке; сетевую ошибку отличает от отсутствия сессии.
2. `GET /api/auth/csrf`: 200 с `{headerName, token}` и при необходимости анонимной session cookie. Токен маскирован стандартным XOR-handler, серверный оригинал хранится в HttpSession. Ответы не кешируются.
3. `POST /api/auth/login`: публичная операция (`security: []` в OpenAPI), предварительная аутентификация не нужна. Обязательны cookie HTTP-сессии из предыдущего GET csrf (она может быть анонимной) и соответствующий заголовок `X-CSRF-TOKEN`; в `application/x-www-form-urlencoded` передаются `username`, `password`. HTTP-сессия для хранения CSRF сама по себе не означает вход пользователя. Успех 204; неверный пароль, неизвестный/отключённый аккаунт — одинаковый 401; отсутствующий/неверный токен либо cookie его сессии — 403. Публичность операции не отключает CSRF. Для logout аутентификация также не обязательна, но сохраняются требования cookie/CSRF.
4. После успеха frontend заново читает session. Перед каждой следующей mutation получает новый csrf: вход и выход инвалидируют прежний токен. 403 приводит к перечитыванию session и предложению повторить действие, без автоматической повторной отправки пароля.
5. `POST /api/auth/logout`: CSRF обязателен, успех 204, session инвалидируется, cookie удаляется. После выхода старый ID получает 401. GET не выполняет logout. Logout с действительным анонимным CSRF также допустим и идемпотентен по результату.

Cookie отправляется через `credentials: same-origin`, proxy Vite обслуживает `/api/` на том же origin. CORS не включён. Пароль, session ID и токены не сохраняются в localStorage/sessionStorage; поля пароля очищаются после попытки входа. Ошибка сети при выходе не выдаётся за успешный logout.

UI отдельно хранит состояние пользователя (`anonymous`, `authenticated`, `unknown`) и состояние операции (`pending`, `failed`, `idle`). Если ответ login/logout потерялся или чтение session после 204 не удалось, личность считается неизвестной. Повторная проверка выполняет только GET session: подтверждает реальный вход или его отсутствие и снимает ошибку операции. Она не повторяет POST и не отправляет пароль автоматически.

## Воспроизводимые demo-аккаунты

При обычном старте ни одного аккаунта автоматически не создаётся. После настройки PostgreSQL из [development.md](development.md) следующий запуск создаёт `demo1` и `demo2` в одной транзакции, после Liquibase и до успешного старта HTTP. Существующие записи сохраняются, включая hash и enabled: повторный запуск не сбрасывает пароль. Пароли различаются, каждый содержит от 12 символов и до 72 UTF-8 байтов (предел BCrypt). Невалидная конфигурация прерывает старт без вывода значений и без частичного создания записей.

Выполните из корня своей копии репозитория после настройки Java 25 и БД по [development.md](development.md). Команды используют установленный JAVA_HOME и не зависят от имени пользователя или каталога JDK:

```powershell
if (!(Test-Path '.\mvnw.cmd') -or !(Test-Path '.\pom.xml')) {
  throw 'Выполните пример из корня репозитория Terma.'
}
if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
  throw 'Настройте JAVA_HOME на JDK 25 согласно docs/development.md.'
}
$termaJava = Join-Path $env:JAVA_HOME 'bin\java.exe'
if (!(Test-Path -LiteralPath $termaJava)) { throw 'В JAVA_HOME не найден bin\java.exe.' }
try {
  $demoFirst = Read-Host 'Новый пароль demo1 (от 12 символов, до 72 UTF-8 байтов)' -AsSecureString
  $demoSecond = Read-Host 'Другой новый пароль demo2' -AsSecureString
  $env:TERMA_DEMO_PASSWORD_1 = [System.Net.NetworkCredential]::new('', $demoFirst).Password
  $env:TERMA_DEMO_PASSWORD_2 = [System.Net.NetworkCredential]::new('', $demoSecond).Password
  $env:TERMA_DEMO_ACCOUNTS_ENABLED = 'true'
  & $termaJava -jar .\backend\target\terma-backend.jar
} finally {
  Remove-Item Env:TERMA_DEMO_PASSWORD_1,Env:TERMA_DEMO_PASSWORD_2,Env:TERMA_DEMO_ACCOUNTS_ENABLED -ErrorAction SilentlyContinue
  Remove-Variable demoFirst,demoSecond -ErrorAction SilentlyContinue
}
```

После Ctrl+C окружение очищается. Для обычных запусков достаточно сохранённых аккаунтов: demo-флаг выключен. Не задавайте пароли в CLI-аргументах, JDBC URL, VITE-переменных, Git или переписке. HTTP login передаёт пароль только backend; вне loopback для этого требуется TLS.

## Сценарии задачи

| Сценарий | Проверка |
| --- | --- |
| SCN-AUTH-001 | Обе PostgreSQL-записи создаются атомарно, содержат BCrypt hash; повторный старт сохраняет hash и успешный вход |
| SCN-AUTH-002 | Без сессии session/защищённый API возвращают 401; неизвестный аккаунт, неверный пароль и disabled не проходят вход |
| SCN-AUTH-003 | Login меняет session ID; session GET возвращает только username; cookie HttpOnly/SameSite, HTTPS-настройка добавляет Secure |
| SCN-AUTH-004 | Login/logout/mutating API без корректного CSRF отклоняются; токен до входа не подходит для logout после входа |
| SCN-AUTH-005 | Logout инвалидирует session; прежний ID не даёт доступа; повторный вход возможен |
| SCN-AUTH-006 | UI восстанавливается после reload; ошибки credentials/CSRF/сети различимы; сетевой сбой logout не изображается выходом |

Это детализация технической приёмки issue №7, без новой матрицы предметных разрешений и изменений научного контракта.
