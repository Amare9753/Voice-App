# Core Capture

Privacy-first voice notes for academic bench scientists. You dictate while your hands are busy. The app keeps a timestamped transcript, suggests structure and scientific wording, and exports a record you have signed. You remain the author: nothing in the transcript, section tags, or label readings changes unless you accept or edit it.

Notes, audio, and photos stay in a SQLite database and files on the device. The app does not send analytics. The only network call is the speech-model download, and it runs only after you tap **Download base English model**.

## Stack

React Native with Expo SDK 58 and TypeScript, using a development build (Expo Router, `expo-sqlite`, `expo-audio`, `expo-camera`, `expo-notifications`, `expo-sharing`). Expo Go cannot run this app because speech and OCR use native modules.

On-device speech is [whisper.cpp](https://github.com/ggml-org/whisper.cpp) through [`whisper.rn`](https://github.com/mybigday/whisper.rn). The model file is not bundled. Recording uses `expo-audio` PCM capture and writes 16 kHz mono WAV clips (resampled in app code when the hardware rate differs) so Whisper can read them and so you can replay a span. Label OCR uses [`expo-text-extractor`](https://github.com/pchalupa/expo-text-extractor): ML Kit on Android and Apple Vision on iOS. Lot and catalog numbers parsed from that text are suggestions.

Expo is a practical fit here because one TypeScript codebase targets iOS and Android, the notebook logic stays pure and testable, and the native pieces (microphone, camera, SQLite, notifications, share sheet, Whisper, OCR) plug in behind small interfaces.

## What you can do

- Push-to-talk (tap to start and stop, or press and hold) and continuous listening, with large controls.
- Tag a section by button or by voice: Observation, Deviation, Material, Result, Procedure, or Note. Say `observation` to switch, or `observation: the pellet is white` to tag that utterance. If you leave the section on Auto, keyword classification suggests a section you can override.
- Every utterance stores a start and end time. Continuous listening splits after silence, or when you tap a section.
- Timers from the buttons or from `start timer 5 minutes`, `timer 90 seconds`, `start timer 1 hour 30 minutes lysis`, `stop timer`, and `cancel timer`. A local notification fires when a timer ends, and the event is stored on the session.
- Photos of gels, plates, screens, and labels. Accepted lot and catalog suggestions are included in the export. Pending ones are not treated as fact.
- Review screen: edit text, highlight low-confidence lines (confidence under 0.75 when the recognizer reports one), accept or reject wording suggestions, retag, reorder within a section, replay the audio span when a clip exists, and sign before export.
- Export PDF, Markdown, DOCX, or ELN JSON (`core-capture.eln.v1`) through the system share sheet. Turn on **Include raw audio** to share a zip that also contains the clips and photos.

Wording such as `five microliters` and `degrees C` is offered as `5 µL` and `°C`. Your custom vocabulary biases the Whisper prompt and suggests canonical spellings (`etoh` to `ethanol`). The stored text stays what was heard until you accept or edit it.

## Run the tests

```bash
npm install
npm test
npm run typecheck
```

`npm test` covers the data model, section classification, unit and vocabulary normalization, voice commands, timers, SQLite persistence, and all four exporters.

## Run on a device or simulator

You need Node 22, a development build, and the speech model below. iOS builds require macOS with Xcode. Android builds require the Android SDK.

```bash
npm install
npx expo prebuild
```

Android, with a device or emulator connected:

```bash
npm run android
```

iOS, on macOS:

```bash
npm run ios
```

`npm run android` and `npm run ios` compile a development build and install it. After that, `npm start` serves the JavaScript bundle to that build. Do not open this project in Expo Go.

Grant microphone, camera, and notification permissions when asked. Notifications are local timer alerts, not push notifications.

### Speech model

The default file is `ggml-base.en.bin` (about 150 MB), from the whisper.cpp Hugging Face repo:

https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

In the app, open **Speech model** and tap **Download base English model**. That is an explicit download. Until the file is present, recording still saves audio and you can type the note or transcribe the clip later.

To copy a model without the in-app download, put `ggml-base.en.bin` in the documents `models` directory. Open **Speech model** and use the URI printed there. On a debuggable Android build, after the app has launched once:

```bash
adb push ggml-base.en.bin /data/local/tmp/ggml-base.en.bin
adb shell run-as dev.corecapture.app mkdir -p files/models
adb shell run-as dev.corecapture.app cp /data/local/tmp/ggml-base.en.bin files/models/ggml-base.en.bin
```

`tiny.en` is smaller and less accurate on chemical names. `small.en` is more accurate and heavier. The app looks specifically for `ggml-base.en.bin`.

## ELN JSON

Signed exports use schema `core-capture.eln.v1`. Sections map to common notebook roles: procedure to methods, material to materials, observation to observations, result to results, deviation to deviations, and note to notes. Each entry includes the authored text, the raw utterance, whether a normalization was accepted, the section source, timestamps, and the source utterance id. Audio attachments are named `audio/<utterance id>.wav` when you include raw audio.

## What was verified here

This environment is Linux, so an iOS binary was not built.

Verified in this Linux environment:

- `npm test` (28 tests): data model, section classification, unit and vocabulary normalization, voice commands, WAV conversion, voice-activity splitting, SQLite persistence, PDF, Markdown, DOCX, and ELN JSON.
- `npm run typecheck`.
- `npx expo prebuild --platform android` followed by `./gradlew assembleDebug`. The debug APK compiled for `arm64-v8a` and `x86_64`, including the whisper.cpp native library and the ML Kit text-recognition module.

Not verified on a device or simulator, because this environment has no iOS toolchain and no running Android emulator with a usable GUI session:

- Microphone capture and playback through `expo-audio`.
- Whisper inference and the model download.
- ML Kit / Vision OCR on a real image.
- Timer notifications and the system share sheet.
- The iOS development build.

The speech, OCR, recording, notification, and share calls sit behind small modules (`src/services/speech`, `src/services/ocr`, `src/services/audio`, `src/services/notify`, `src/services/export`). The notebook rules those modules feed are the tested part. On a Mac or an Android device, the remaining check is: install the dev build, download the model, record a sentence such as “observation: five microliters, start timer 1 minute”, accept or reject the suggestion, sign, and share each format.

## Privacy

SQLite file: `core-capture.db` in the app’s database directory. Audio and photos are files under the app documents directory. There is no account, no analytics SDK, and no background upload. Reopening a signed record is an explicit action and clears the signature so you must sign again before the next export.
