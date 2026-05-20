# Ajazz-AKP05E-Bitfocus-Companion-Bridge
Plugin for Ajazz AKP05E for correct Bitfocus Companion connection
English | Русский ниже

## English

A lightweight in-between “bridge” that mirrors Bitfocus Companion button design onto the Ajazz AKP05E (buttons + touch row + 4 encoders) and forwards inputs both ways.

Key features
- Pixel‑perfect design mirroring: COLOR/TEXT/ICONS/bitmap from Companion (144×144).
- Smart bitmap cache: dedup by content; instant restore on `willAppear` (no black frames).
- Quiet build: VERBOSE=false by default (only warnings/errors).
- Page navigation via “function button”: hold key `0/4` and rotate right encoder `3/3`.
  - Clockwise → triggers `0/5` (Page: Next) in Companion
  - Counter‑clockwise → triggers `1/5` (Page: Previous) in Companion
- Encoders, buttons, and touch row work as in Companion; only when `0/4` is held we intercept `3/3` rotation.

Requirements
- Bitfocus Companion 4.3.2
- Ajazz app: disable touchscreen slide handling (so it doesn’t steal gestures)

Install
1) Replace your plugin `index.js` with `plugin/index.js` from this repo.
2) Restart the host app / reload the plugin.
3) In Companion, assign:
   - ControlID `0/5` → Page: Next
   - ControlID `1/5` → Page: Previous

Config switches (top of index.js)
- `VERBOSE` — enable debug logs if needed.
- `FORWARD_FUNCTION_BUTTON` — if true, key `0/4` also triggers its own Companion action.
- `KEY_IMG_W/H` — bitmap size (must match layout’s bitmap manifest).
- `PING_INTERVAL_MS` — keep‑alive for Satellite.
- All other functionality is stable by default.

Troubleshooting
- If images don’t show on first page load: that’s expected only before the very first `KEY-STATE` — once it arrives, cache persists and restores instantly thereafter.
- If Ajazz app steals touch slides: keep “touchscreen slide handling” disabled.

Roadmap
- Optional “latch mode” for the function button (toggle paging mode on short press).
- Optional encoder acceleration (multi‑page step on fast rotation).
- Micro‑batching of image updates if needed.

---

## Русский

Лёгкий «бридж» между Bitfocus Companion и Ajazz AKP05E, который переносит дизайн кнопок Companion на устройство (кнопки + тач‑ряд + 4 энкодера) и перенаправляет события в обе стороны.

Ключевые возможности
- Точный перенос дизайна: цвет/текст/иконки/битмапы из Companion (144×144).
- Умный кэш битмапов: дедупликация по содержимому; мгновенное восстановление при `willAppear` (без чёрного кадра).
- Тихая сборка: VERBOSE=false (только предупреждения/ошибки).
- Навигация по страницам через «функциональную» кнопку: удерживайте `0/4` и вращайте правый энкодер `3/3`.
  - По часовой — триггер `0/5` (Page: Next) в Companion
  - Против часовой — триггер `1/5` (Page: Previous) в Companion
- Все энкодеры/кнопки/тач работают как в Companion; перехват вращения `3/3` — только при удержании `0/4`.

Требования
- Bitfocus Companion 4.3.2
- Приложение Ajazz: отключите обработку слайда тачскрина (чтобы не перехватывалось жестами).

Установка
1) Замените ваш `plugin/index.js` на версию из этого репозитория.
2) Перезапустите хост‑приложение / перезагрузите плагин.
3) В Companion назначьте:
   - ControlID `0/5` → Page: Next
   - ControlID `1/5` → Page: Previous

Настройки (вверху index.js)
- `VERBOSE` — включить отладочный лог при необходимости.
- `FORWARD_FUNCTION_BUTTON` — если true, нажатие `0/4` также выполнит свой экшен в Companion.
- `KEY_IMG_W/H` — размер битмапа (должен совпадать с манифестом в layout).
- `PING_INTERVAL_MS` — keep‑alive для Satellite.

Диагностика
- Если картинки не видны при самом первом запуске страницы — это ожидаемо до прихода первого `KEY-STATE`. Далее кэш сохраняется и восстанавливается мгновенно.
- Если приложение Ajazz «крадёт» свайпы — оставьте обработку слайда тачскрина выключенной.

Планы
- Опциональный «латч‑режим» для function‑кнопки (переключение режима пролистывания коротким нажатием).
- Опциональное ускорение энкодера (по 2–3 страницы за быстрый тик).
- Микробатчирование обновлений изображений при больших нагрузках.
