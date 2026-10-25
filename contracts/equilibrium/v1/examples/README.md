# Синтетические примеры контракта

Все данные подготовлены вручную для проверки формы и баланса. `DEMONSTRATION`, `no-engine-hand-authored` и диагностическое сообщение прямо обозначают отсутствие запущенного ядра. Даже `status: CONVERGED` здесь — пример конверта гипотетического успеха, не утверждение о найденном минимуме или готовой реализации.

| Файл | Схема / ожидаемый исход проверки |
| --- | --- |
| [request.json](request.json) | request: проходит; H=2, O=1 моль атомов, T=310 K, P=100000 Pa |
| [chemical-system-pure.json](chemical-system-pure.json) | chemical-system: проходит; одна чистая фаза и один species |
| [result-converged.json](result-converged.json) | result: проходит; 1 моль H2O, общий/фазовый/стехиометрический баланс H=2, O=1 |
| [request-invalid-input.json](request-invalid-input.json) | request: **ожидаемо не проходит** из-за H=-2; отрицательная фикстура, не допустимый запрос |
| [result-invalid-input.json](result-invalid-input.json) | result: проходит; корреляция с отрицательной фикстурой, поле solution отсутствует, неприменённые ссылки и ядро — null |
| [capabilities.json](capabilities.json) | capabilities: проходит; гипотетический пример только pure-phase, не ответ существующего движка |
| [chemical-system-multicomponent.json](chemical-system-multicomponent.json) | chemical-system: проходит; структура смеси, не поддержка модели временным ядром |
| [request-multicomponent.json](request-multicomponent.json) | request: проходит по форме; другой chemicalSystemRef |
| [result-multicomponent.json](result-multicomponent.json) | result: проходит; два экземпляра GAS одного определения, первая фаза содержит три species |

В многокомпонентном примере первая фаза: H=1.5, O=0.75; вторая: H=0.5, O=0.25 моль атомов. Сумма H=2, O=1 совпадает с запросом и итогом. Все species нейтральны по синтетическому определению. Отсутствующие элементы считаются нулём, дополнительные научные свойства не выдуманы. Допуски — поля примеров для проверки структуры, не выбранные значения будущего метода.

Capabilities pure-phase **не поддерживают** запрос многокомпонентной модели: future calculate должен дать UNSUPPORTED, а не скрыто рассчитать его другим ядром. Успешный многокомпонентный конверт иллюстрирует общий формат для иной возможной реализации. Значения phaseType не закрепляют вычислительную поддержку всех категорий. thermodynamicDataRef `demo-data/v1` — синтетический идентификатор, не реально подключённая Unitherm или научная база; разрешимость данных этими фикстурами не доказана.

Фактическая проверка схем, примеров и балансов описана в [отчёте](../../../../docs/solver-contract-verification.md). Ни одна из этих проверок не выполняет SCN-SOLVER-001–SCN-SOLVER-003.
