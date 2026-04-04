import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Globe, Save } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { z } from 'zod';

import { PrimaryButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InputField } from '@/components/ui/InputField';
import { Screen } from '@/components/ui/Screen';
import { Body, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import { useAppStore } from '@/store/appStore';
import { validateEndpointUrl } from '@/utils/endpoint';

const schema = z.object({
  url: z.string().min(1, 'URL is required'),
});

type Form = z.infer<typeof schema>;

export default function EndpointScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const { control, handleSubmit, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { url: settings.firewallEndpoint },
  });

  const onSubmit = handleSubmit(async (values) => {
    const v = validateEndpointUrl(values.url);
    if (!v.ok) {
      setError('url', { message: v.error });
      return;
    }
    await setSettings({ firewallEndpoint: v.value });
    await appendActivityLog('success', 'Firewall endpoint updated', { url: v.value });
    router.back();
  });

  return (
    <Screen scroll contentStyle={styles.content}>
      <Eyebrow>Editor</Eyebrow>
      <Title style={styles.title}>Firewall endpoint</Title>
      <Subtitle>View, edit, and validate the captive portal URL used for direct firewall login.</Subtitle>

      <Card style={styles.card}>
        <Controller
          control={control}
          name="url"
          render={({ field, fieldState }) => (
            <InputField
              label="Portal URL"
              value={field.value}
              onChangeText={field.onChange}
              placeholder="http://10.64.4.253:8090"
              icon={Globe}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        />

        <Body style={styles.help}>
          Use the firewall portal base URL. WiFiGate will derive the direct login request from this endpoint.
        </Body>

        <PrimaryButton title="Save Endpoint" onPress={onSubmit} icon={Save} trailingArrow />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.xl,
  },
  title: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  card: {
    marginTop: theme.spacing.xl,
  },
  help: {
    marginBottom: theme.spacing.lg,
  },
});
