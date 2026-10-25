# Предлагаемая технологическая основа каркаса

Проверено 25 октября 2026 года по официальным источникам и метаданным издателей в npm registry. **Статус: предложение для просмотра**, детализация [ADR-0008](adr/0008-proposed-tooling-and-environment.md) и `PROP-TECH-001` из [основы проекта](project-foundation.md). Опубликованные требования совместимости проверены; сборки приложения ещё нет. Зависимости приложения сейчас не устанавливались.

## Точные версии и источники

| Инструмент | Предложенная версия | Основание и бесплатное использование |
| --- | --- | --- |
| Eclipse Temurin JDK | **25.0.5+8**, Java 25 LTS, без preview | [Стабильный релиз](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.5%2B8), [LTS](https://adoptium.net/support); [бесплатные бинарные сборки, GPLv2 с Classpath Exception](https://adoptium.net/docs/faq) |
| Spring Boot | **4.1.2** | [Релиз](https://github.com/spring-projects/spring-boot/releases/tag/v4.1.2), [требования](https://docs.spring.io/spring-boot/system-requirements.html): Java 17–27, Maven от 3.6.3; Java 25 подходит. [Apache-2.0](https://github.com/spring-projects/spring-boot/blob/v4.1.2/LICENSE.txt) |
| Maven | **3.10.0** | [Стабильная загрузка и Apache-2.0](https://maven.apache.org/download.cgi); не Maven 4 RC |
| Maven Wrapper | **3.3.4** | [Релиз](https://github.com/apache/maven-wrapper/releases/tag/maven-wrapper-3.3.4), [применение](https://maven.apache.org/wrapper/); закрепить Maven и контрольную сумму дистрибутива |
| Node.js | **24.22.1 LTS** | [Индекс версий](https://nodejs.org/dist/index.json), [LTS-статус](https://nodejs.org/en/about/previous-releases), [MIT и лицензии компонентов](https://github.com/nodejs/node/blob/v24.22.1/LICENSE) |
| npm | **11.19.1** | Версия в поставке Node 24.22.1 по официальному индексу; [метаданные, Artistic-2.0](https://registry.npmjs.org/npm/11.19.1) |
| React и React DOM | **19.3.1** для обоих | [Релиз](https://github.com/facebook/react/releases/tag/v19.3.1), [react](https://registry.npmjs.org/react/19.3.1) и [react-dom](https://registry.npmjs.org/react-dom/19.3.1): MIT; React DOM требует React `^19.3.1` |
| TypeScript | **7.0.2** | [Стабильный TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [метаданные](https://registry.npmjs.org/typescript/7.0.2): Apache-2.0, Node от 16.20. Использовать CLI `tsc`, без compiler API и preview-пакета |
| Vite | **8.3.5** | [Руководство](https://vite.dev/guide/), [метаданные](https://registry.npmjs.org/vite/8.3.5): MIT, Node `^20.19.0` или `>=22.12.0` |
| @vitejs/plugin-react | **6.1.2** | [Метаданные](https://registry.npmjs.org/@vitejs%2fplugin-react/6.1.2): MIT, Vite `^8.0.0`, тот же Node; React Compiler и дополнительные Babel-плагины — optional peers, каркасу не нужны |
| Vitest | **5.0.5** | [Метаданные](https://registry.npmjs.org/vitest/5.0.5): MIT; Node `^22.12.0` / `^24.0.0` / `>=26`, Vite включает `^8.0.0` |
| React Testing Library | **16.3.3** | [Метаданные](https://registry.npmjs.org/@testing-library%2freact/16.3.3): MIT, React/React DOM `^18` или `^19` |
| @testing-library/dom | **10.4.2** | [Метаданные](https://registry.npmjs.org/@testing-library%2fdom/10.4.2): MIT; обязательный peer RTL `^10.0.0` |
| jsdom | **30.1.3** | [Метаданные](https://registry.npmjs.org/jsdom/30.1.3): MIT, Node `^22.22.2` / `^24.15.0` / `>=26`; Node 24.22.1 подходит. Canvas не нужен |
| Playwright Test | **1.64.1** | [Метаданные](https://registry.npmjs.org/@playwright%2ftest/1.64.1): Apache-2.0; [требования](https://playwright.dev/docs/intro): Windows 11+, Ubuntu 24.04 поддерживается. Запускать браузерную проверку в Linux CI |

Типы frontend: `@types/react` **19.3.0**, `@types/react-dom` **19.3.0**, `@types/node` **24.19.2**; [React types](https://registry.npmjs.org/@types%2freact/19.3.0), [React DOM types](https://registry.npmjs.org/@types%2freact-dom/19.3.0), [Node types](https://registry.npmjs.org/@types%2fnode/24.19.2), MIT. Типы Node соответствуют ветке 24, а не latest для Node 26.

Точные версии закрепляются в будущих manifests/lockfile. Совместная сборка этой комбинации ещё должна быть проверена задачами реализации. Первичные загрузки из Maven/npm и загрузка браузера требуют сети; это не доступ к VPS и не требование Docker. Воспроизводимая установка означает фиксированное разрешение зависимостей, а не полностью автономную первую сборку или побитовую идентичность артефактов.

## Минимальные зависимости и отложенные инструменты

Backend: Spring Boot MVC, Actuator и тестовые средства. Worker: Spring Boot non-web bootstrap и тестовые средства, без web-сервера и потребителей Kafka. JUnit согласуется через BOM Spring Boot. Конкретные starter-артефакты сверяются с Boot 4.1.2 при реализации.

Frontend: React/React DOM, TypeScript, Vite/react plugin и типы; Vitest/RTL/jsdom для компонентных проверок; Playwright для небольшой браузерной проверки настоящей HTTP-связи в Linux CI. Минимальный экран — обычный CSS и native fetch.

**Отложены:** Hibernate/JPA, Liquibase, PostgreSQL JDBC, Spring Kafka, Spring Security, Ant Design, React Router, TanStack Query, Apache ECharts, генерация OpenAPI, Testcontainers и Docker Compose-конфигурация. Это не отказ от выбранных технологий: для технического каркаса без доменных данных, прав и интеграций они пока не нужны. При добавлении Hibernate и связанных зависимостей применяется [BOM Spring Boot](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html), без независимого закрепления несовместимых версий.

## Уточнения рекомендаций и среды

- Локальный Node **22.14.0** достаточен для OpenSpec (`>=20.19`), но не для предложенного jsdom 30.1.3. Для приложения предлагается Node 24.22.1 LTS; сейчас Node не обновлялся. [Node 24 поддерживает Windows 10 x64](https://github.com/nodejs/node/blob/v24.x/BUILDING.md); сборка Node из исходников не нужна.
- Playwright не заявляет поддержку Windows 10. Предлагается сохранить его для Ubuntu 24.04 CI, не требуя WSL2 или перехода домашнего компьютера на другую ОС. Ручная проверка UI в установленном браузере не объявляется автоматическим E2E.
- TypeScript 7 стабилен, но пока не предоставляет compiler API. Используются только `tsc` и Vite; зависимые от compiler API инструменты не добавляются. Их необходимость будет отдельным решением.
- [IDEA поддерживает Java 25](https://www.jetbrains.com/help/idea/supported-java-versions.html). [Бесплатная основа актуальной IDEA](https://lp.jetbrains.com/intellij-idea-unified-faq/) включает Java/Maven; расширенные Spring/web-возможности могут требовать подписки. Сборки и запуск через Wrapper/npm не зависят от Ultimate или пробного периода; смена IDE не требуется. Для frontend допустим текстовый редактор и CLI.

Это детализация ADR-0008, а не замена Java/Spring или React/TypeScript. Его статус остаётся «Предложено»; подтверждение внешних фактов не означает согласования всей комбинации и прохождения её тестов.

## Установленный OpenSpec

Фактически установлен **OpenSpec 1.15.0**, MIT, глобальный npm-пакет `@fission-ai/openspec@1.15.0`; версия и CLI help проверены. Официальный standalone-установщик проверил контрольную сумму загрузки, но файл не прошёл его проверку запуска. Выполнен поддерживаемый [официальной инструкцией](https://openspec.dev/docs/installation) npm-вариант; причина отказа standalone не установлена.

Штатная инициализация для Codex выполнена с параметрами `--tools codex --language Russian --profile core --no-animation`. Используются `spec-driven`, [проектная конфигурация](https://openspec.dev/docs/project-config) и [официальный CLI](https://openspec.dev/docs/cli). Это единственный установленный инструмент этапа; зависимости самого OpenSpec не являются зависимостями приложения.
