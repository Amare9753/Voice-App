# Core Capture

Privacy-first voice notes for academic bench scientists. You dictate while your hands are busy. The app keeps a timestamped transcript, suggests structure and scientific wording, and exports a record you have signed. You remain the author: nothing in the transcript, section tags, or label readings changes unless you accept or edit it.

There are two clients on the same notebook core:

- **iPhone, no Mac and no Apple Developer account:** the web app in `web/`. Install it from Safari to the home screen. It is a PWA hosted on GitHub Pages.
- **Android, or iOS with a Mac:** the Expo development build in the repository root.

Notes, audio, and photos stay on the device. There is no analytics. The web app’s only third-party request is the speech-model download, and it runs only after you tap **Download tiny English model**. The native app’s only network call is its own model download.

## Install on an iPhone

Expected site, after GitHub Pages is enabled and `main` has this app:

https://amare9753.github.io/Voice-App/

GitHub does not let this repository turn Pages on by itself. On the repo:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Merge the web app to `main`. The workflow `.github/workflows/pages.yml` tests the notebook, builds `web/`, and deploys it. You can also run that workflow with **Actions → Deploy GitHub Pages → Run workflow** after Pages is set to GitHub Actions.

On the iPhone:

1. Open the site in Safari (not Chrome).
2. Tap **Share → Add to Home Screen**.
3. Open **Core Capture** from the home screen. The first visit needs a network connection so Safari can load the app. After that, the service worker keeps it available offline.
4. Open **Speech model** and tap **Download tiny English model** once, on Wi-Fi. That downloads `Xenova/whisper-tiny.en` (q8) into the browser cache. Later transcription does not use the network. If the cache is missing, transcription refuses to fetch it again until you tap the button.
5. Allow the microphone when you tap the round Talk button. Allow notifications if you want a system alert when a timer ends. iOS shows notification alerts for a home-screen app; a normal Safari tab may only show the in-app banner. If the phone sleeps, the timer is caught up the next time you open the app.

The English tiny model is English-only, so the app does not send a language or task flag to it. A multilingual checkpoint still receives `language: en` and `task: transcribe`. Lab terms stay in the prompt token list, and the same unit and vocabulary suggestions appear after the transcript.

### Updating an iPhone that already has the app

The service worker checks for a new version when you open the app on Wi-Fi, then reloads once it is in control. iOS often keeps the previous copy until a second launch.

1. Connect to Wi-Fi.
2. Swipe Core Capture away in the app switcher so it is fully closed.
3. Open the home-screen icon and leave it in the foreground for a few seconds. The footer should read `0.2.0`.
4. If it still shows the old screen, close it again and open it once more.
5. If that still fails, open https://amare9753.github.io/Voice-App/ in Safari, pull down to refresh, then reopen the home-screen icon. Removing and re-adding the icon does not erase the notebook, as long as you do not clear Safari website data for that site.

Push-to-talk is tap to start and tap to stop (press-and-hold also works). Continuous listening runs only while the app is open. Photos use the camera file input. Lot and catalog numbers come from Tesseract in the browser and stay suggestions until you accept them. Export uses the share sheet when Safari allows file sharing, and otherwise downloads the file.

Local check, from a clone:

```bash
npm install
npm test
cd web
npm install
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/Voice-App/`. `npm run preview` serves the production build at that Pages path. `npm run dev` inside `web/` serves the same app at `/` for day-to-day work.

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

`npm test` covers the data model, section classification, unit and vocabulary normalization, voice commands, timers, SQLite and IndexedDB persistence, and all four exporters. The web build typechecks that same core inside the PWA.

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

- `npm test` (29 tests): data model, section classification, unit and vocabulary normalization, voice commands, WAV conversion, voice-activity splitting, SQLite and IndexedDB persistence, PDF, Markdown, DOCX, and ELN JSON.
- `npm run typecheck` and `cd web && npm run build`.
- `npx expo prebuild --platform android` followed by `./gradlew assembleDebug`. The debug APK compiled for `arm64-v8a` and `x86_64`, including the whisper.cpp native library and the ML Kit text-recognition module.

The PWA was also checked in headless Chromium against a local server that uses the GitHub Pages path `/Voice-App/`. That check loaded the home screen, registered the service worker at that scope, started the microphone with a fake audio device, saved a typed note, showed the suggestion `added 5 µL of DMSO`, accepted it, signed the record, and downloaded Markdown that kept the heard wording in provenance. A separate Chromium run loaded `Xenova/whisper-tiny.en` and transcribed the Kennedy sample to “And so my fellow Americans…” without sending `language` or `task`, then confirmed the vocabulary normalization `added five microliters of dmso` → `added 5 µL of DMSO`.

Not verified on a device or simulator, because this environment has no iOS toolchain, no iPhone, and no running Android emulator with a usable GUI session:

- Microphone capture and playback through `expo-audio`, and real iPhone Safari audio, Whisper inference, and Tesseract on a camera photo. The desktop check used a fake microphone and a typed note.
- The Hugging Face model download on a phone, and whether tiny.en stays within that phone’s memory.
- Notification alerts from an installed iOS home-screen app. The timer still records in the notebook and shows an in-app banner when the page is open.
- ML Kit / Vision OCR on a native image, and the iOS development build.

The speech, OCR, recording, notification, and share calls sit behind small modules (`src/services/speech`, `src/services/ocr`, `src/services/audio`, `src/services/notify`, `src/services/export`). The notebook rules those modules feed are the tested part. On a Mac or an Android device, the remaining check is: install the dev build, download the model, record a sentence such as “observation: five microliters, start timer 1 minute”, accept or reject the suggestion, sign, and share each format.

## Privacy

The native app stores SQLite in `core-capture.db` and keeps audio and photos in the app documents directory. The web app stores the same records in IndexedDB in the browser, and caches the app shell with a service worker. There is no account, no analytics SDK, and no background upload. Reopening a signed record is an explicit action and clears the signature so you must sign again before the next export.

The in-browser recognizer is `Xenova/whisper-tiny.en` at q8. It is small enough to run as single-thread WebAssembly on an iPhone. `base.en` is more accurate and is large enough that Safari often runs out of memory, so the PWA does not download it. Lab vocabulary is passed as Whisper `prompt_ids` when the tokenizer accepts it, and the same post-ASR suggestions (`five microliters` to `5 µL`) still require your acceptance.
