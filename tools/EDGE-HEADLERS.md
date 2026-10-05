## Почему окно всё равно появилось — две причины, обе лечатся без кодера

**Причина 1.** В применённом скрипте (строки 22–29 на скрине) **нет строки `--headless=new`** — ArgumentList уходит в Edge без headless-флага.

**Причина 2 (коварнее).** Даже с флагом Edge игнорирует `--headless`, если уже живёт видимый экземпляр с тем же профилем/портом: новый запуск просто прицепляется к старому окну. Ваш отладочный Edge (вкладка about:blank + ОБД) как раз такой старожил.

## Правки руками (две операции)

**Операция 1. Убить только отладочный Edge** (основной браузер не тронет — фильтр по порту в командной строке):

```powershell
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
  Where-Object { $_.CommandLine -like '*--remote-debugging-port=9226*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**Операция 2. В `tools/run-edge-obd.ps1` заменить блок строк 22–29 на:**

```powershell
Start-Process -FilePath $edge -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=`"$ProfileDir`"",
    "--headless=new",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "about:blank"
)
```

Добавлены три строки: `--headless=new`, `--disable-gpu`, `--window-size=1920,1080` (headless-окну нужен виртуальный размер, чтобы страницы рендерились как в реальном вьюпорте — парсеру это важно).

## Порядок и проверка

1. Выполнить Операцию 1 (убить старожила).
2. Сохранить правку из Операции 2.
3. `.\tools\run-edge-obd.ps1`
4. Проверка: **окна Edge в панели задач нет**, а CDP жив:

```powershell
(Invoke-RestMethod http://127.0.0.1:9226/json/version).Browser
```

Выведет версию Edge — значит headless работает. Если окно всё же появилось — повторить Операцию 1: значит остался ещё один экземпляр с этим профилем.

Коммит ваш: `fix: headless-флаги в run-edge-obd.ps1 — Edge без окна`.

## Бонус со скрина

Карточка на экране — **Чудаков Фёдор Федорович, ID 551843137, «скф 826 полк 398 див.», первичное захоронение: с. Корпечь** — это идеальное тестовое зерно для `attachObject`: и часть из `units_registry` (826 сп 398 сд), и прямое «с. Корпечь» в primary_burial. После полного прогона и нормализации проверьте по нему привязку к `obj-korpech` и расшифровку части — две птицы одним выстрелом.
