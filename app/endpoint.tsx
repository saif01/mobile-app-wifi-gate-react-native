import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';

import { PrimaryButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Body, Caption, Title } from '@/components/ui/Typography';
import { appendActivityLog } from '@/services/activityLog';
import { validateEndpointUrl } from '@/utils/endpoint';
import { useAppStore } from '@/store/appStore';

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
    <Screen scroll>
      <Title>Firewall endpoint</Title>
      <Body style={styles.desc}>Must be a valid http(s) URL to your captive portal.</Body>

      <Controller
        control={control}
        name="url"
        render={({ field, fieldState }) => (
          <View style={styles.field}>
            <Caption>URL</Caption>
            <TextInput
              value={field.value}
              onChangeText={field.onChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://10.64.4.253:8090"
              placeholderTextColor="#5c6b7d"
              style={styles.input}
            />
            {fieldState.error ? <Caption style={styles.err}>{fieldState.error.message}</Caption> : null}
          </View>
        )}
      />

      <PrimaryButton title="Save" onPress={onSubmit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  desc: { marginTop: 8, marginBottom: 16 },
  field: { marginBottom: 16 },
  input: {
    marginTop: 6,
    backgroundColor: '#111a24',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f2f5f9',
    borderWidth: 1,
    borderColor: '#2a3441',
  },
  err: { color: '#ff9b9b', marginTop: 6 },
});
