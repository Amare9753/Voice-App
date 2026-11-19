import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Banner, BigButton, Screen } from '../ui/components';
import { theme } from '../ui/theme';
import { deleteSpeechModel, downloadSpeechModel, MODEL_URL, speechModelStatus } from '../services/model/speechModel';

export default function ModelScreen() {
  const [status, setStatus] = useState(speechModelStatus());
  const [message, setMessage] = useState('The speech model stays on this device. Core Capture does not download it unless you tap the button.');
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setMessage('Downloading the base English model. This is the only network request in the app, and you asked for it.');
    try {
      await downloadSpeechModel(true);
      setStatus(speechModelStatus());
      setMessage('Model saved on this device. You can record offline now.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Download failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <BigButton label="Back" color={theme.ink} onPress={() => router.back()} />
        <Text style={styles.title}>Speech model</Text>
        <Banner text={status.installed ? `Installed at ${status.uri}` : 'No model installed yet.'} tone={status.installed ? 'info' : 'warn'} />
        <Text style={styles.lead}>{message}</Text>
        <Text style={styles.lead}>
          Manual copy: download {MODEL_URL} on a computer and place ggml-base.en.bin in the app documents models folder shown above. See the README for the adb command.
        </Text>
        <BigButton label={busy ? 'Downloading…' : 'Download base English model'} disabled={busy} onPress={() => void download()} />
        <BigButton
          label="Remove model"
          color={theme.danger}
          disabled={!status.installed || busy}
          onPress={() => {
            deleteSpeechModel();
            setStatus(speechModelStatus());
            setMessage('Model removed from this device.');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  title: { fontSize: 32, fontWeight: '800', color: theme.ink },
  lead: { fontSize: 18, lineHeight: 26, color: theme.ink },
});
