# ElevenLabs Text-to-Speech

Преобразование текста в речь через [ElevenLabs API](https://elevenlabs.io/docs/api-reference/text-to-speech).

## Настройка

1. Скопировать конфиг и добавить ключ:
   ```bash
   cp .env.example .env
   # Вписать ELEVENLABS_API_KEY в .env (ключ: https://elevenlabs.io/app/settings/api-keys)
   ```

2. Опционально в `.env`:
   - `VOICE_ID` — ID голоса (по умолчанию Rachel).
   - `MODEL_ID` — модель (по умолчанию `eleven_multilingual_v2`).

## Использование

```bash
# Текст аргументом
npm run tts -- "Привет, это синтез речи."

# Вывод в файл
npm run tts -- "Hello world" -o hello.mp3

# Текст из stdin
echo "Текст из стандартного ввода" | npm run tts -- -o out.mp3
```

Результат — MP3 (44.1 kHz, 128 kbps). Без `-o` по умолчанию сохраняется в `output.mp3`.

### Пакетная генерация из config.json

В `src/config.json` задаётся массив промптов `{ "id": "имя-файла", "text": "фраза" }`. Запуск:

```bash
npm run tts:batch
```

Файлы сохраняются в `output/` как `{id}.mp3` (например `welcome.mp3`, `instruction.mp3`).
