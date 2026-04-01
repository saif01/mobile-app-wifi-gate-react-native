import { useFocusEffect } from '@react-navigation/native';
import { Pencil, Plus, ShieldCheck, Trash2, Wifi, WifiOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { AppModal } from '@/components/ui/AppModal';
import { Card } from '@/components/ui/Card';
import { InputField } from '@/components/ui/InputField';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Subtitle, Title } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';
import { appendActivityLog } from '@/services/activityLog';
import {
  evaluateWifiAccess,
  findDuplicateAllowedWifi,
  getCurrentWifiInfo,
  getNetworkSnapshot,
} from '@/services/networkService';
import type { AllowedWifiEntry, NetworkSnapshot } from '@/types/models';
import { useAppStore } from '@/store/appStore';

type FeedbackState = {
  kind: 'success' | 'error' | 'info';
  message: string;
} | null;

type ModalState = {
  visible: boolean;
  mode: 'create' | 'edit';
  source: 'manual' | 'detected';
  entryId?: string;
  originalSsid?: string;
  originalIp?: string;
};

function newId() {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WifiScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const list = useMemo(() => settings.allowedWifi, [settings.allowedWifi]);

  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
  const [ssid, setSsid] = useState('');
  const [ip, setIp] = useState('');
  const [remarks, setRemarks] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    mode: 'create',
    source: 'manual',
  });

  const access = useMemo(
    () => (snapshot ? evaluateWifiAccess(snapshot, settings.allowedWifi) : null),
    [settings.allowedWifi, snapshot]
  );

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setSnapshot(await getNetworkSnapshot());
      })();
    }, [])
  );

  function resetForm() {
    setSsid('');
    setIp('');
    setRemarks('');
  }

  function openManualAdd() {
    resetForm();
    setFeedback(null);
    setModal({ visible: true, mode: 'create', source: 'manual' });
  }

  function openEdit(entry: AllowedWifiEntry) {
    setFeedback(null);
    setSsid(entry.ssid);
    setIp(entry.ip ?? '');
    setRemarks(entry.remarks ?? '');
    setModal({
      visible: true,
      mode: 'edit',
      source: 'manual',
      entryId: entry.id,
      originalSsid: entry.ssid,
      originalIp: entry.ip,
    });
  }

  function closeModal() {
    setModal((current) => ({ ...current, visible: false }));
    resetForm();
  }

  async function openQuickAdd() {
    setDetecting(true);
    setFeedback(null);
    try {
      const info = await getCurrentWifiInfo({ requestPermission: true });
      if (!info.isConnected || !info.isWifi) {
        setFeedback({ kind: 'error', message: 'No WiFi connected. Connect to WiFi first.' });
        return;
      }

      const identifier = info.gateway ?? info.ip;
      if (!info.ssid && !identifier) {
        setFeedback({
          kind: 'error',
          message: info.permissionMessage ?? 'Unable to detect the current WiFi details.',
        });
        return;
      }

      const duplicate = findDuplicateAllowedWifi(settings.allowedWifi, {
        ssid: info.ssid ?? '',
        ip: identifier,
      });
      if (duplicate) {
        setFeedback({ kind: 'info', message: 'This WiFi network is already in the allowed list.' });
        return;
      }

      setSsid(info.ssid ?? '');
      setIp(identifier ?? '');
      setRemarks('');
      setModal({
        visible: true,
        mode: 'create',
        source: 'detected',
        originalSsid: info.ssid,
        originalIp: identifier,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to detect WiFi details.',
      });
    } finally {
      setDetecting(false);
    }
  }

  async function persistEntry() {
    const nextSsid = ssid.trim();
    const nextIp = ip.trim();
    const nextRemarks = remarks.trim();

    if (!nextSsid && !nextIp) {
      setFeedback({ kind: 'error', message: 'WiFi name or identifier is required before saving.' });
      return;
    }

    const duplicate = findDuplicateAllowedWifi(
      settings.allowedWifi,
      { ssid: nextSsid, ip: nextIp || undefined },
      modal.mode === 'edit' ? modal.entryId : undefined
    );
    if (duplicate) {
      setFeedback({ kind: 'error', message: 'This WiFi network is already in the allowed list.' });
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === 'edit' && modal.entryId) {
        const allowedWifi = settings.allowedWifi.map((entry) =>
          entry.id === modal.entryId
            ? { ...entry, ssid: nextSsid, ip: nextIp || undefined, remarks: nextRemarks || undefined }
            : entry
        );
        await setSettings({ allowedWifi });
        await appendActivityLog('info', 'Allowed WiFi entry updated', { id: modal.entryId });
        setFeedback({ kind: 'success', message: 'WiFi entry updated successfully.' });
      } else {
        const next: AllowedWifiEntry = {
          id: newId(),
          ssid: nextSsid,
          ip: nextIp || undefined,
          remarks: nextRemarks || undefined,
          isActive: true,
        };
        await setSettings({ allowedWifi: [...settings.allowedWifi, next] });
        await appendActivityLog('success', 'Allowed WiFi entry added', { id: next.id });
        setFeedback({ kind: 'success', message: 'WiFi added to allowed list successfully.' });
      }
      closeModal();
      setSnapshot(await getNetworkSnapshot());
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const allowedWifi = settings.allowedWifi.map((entry) => (entry.id === id ? { ...entry, isActive } : entry));
    await setSettings({ allowedWifi });
    await appendActivityLog('info', 'Allowed WiFi entry toggled', { id, isActive });
    setSnapshot(await getNetworkSnapshot());
  }

  async function remove(id: string) {
    const allowedWifi = settings.allowedWifi.filter((entry) => entry.id !== id);
    await setSettings({ allowedWifi });
    await appendActivityLog('warn', 'Allowed WiFi entry removed', { id });
    setFeedback({ kind: 'success', message: 'WiFi entry deleted successfully.' });
    setSnapshot(await getNetworkSnapshot());
  }

  return (
    <Screen contentStyle={styles.content}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Eyebrow>Network Policy</Eyebrow>
              <Title style={styles.title}>WiFi access</Title>
              <Subtitle>Manage allowed networks.</Subtitle>
            </View>

            <Card style={styles.currentCard}>
              <View style={styles.currentHeader}>
                <View>
                  <Caption style={styles.metaLabel}>Current network</Caption>
                  <Body style={styles.currentValue}>
                    {snapshot?.isWifi ? snapshot.ssid || 'WiFi connected' : 'No active WiFi'}
                  </Body>
                </View>
                <StatusBadge
                  tone={access?.match ? 'success' : access?.noRestriction ? 'warning' : snapshot?.isWifi ? 'error' : 'neutral'}
                  label={access?.match ? 'Authorized' : access?.noRestriction ? 'Open Mode' : snapshot?.isWifi ? 'Blocked' : 'Offline'}
                />
              </View>
              <Caption>{snapshot?.gatewayIp ? `Gateway ${snapshot.gatewayIp}` : 'Connect to WiFi.'}</Caption>
            </Card>

            {feedback ? (
              <Card
                style={[
                  styles.feedback,
                  feedback.kind === 'error'
                    ? styles.feedbackError
                    : feedback.kind === 'success'
                      ? styles.feedbackSuccess
                      : styles.feedbackInfo,
                ]}>
                <Body style={styles.feedbackText}>{feedback.message}</Body>
              </Card>
            ) : null}

            <View style={styles.ctaStack}>
              <PrimaryButton
                title="Add Current WiFi"
                onPress={openQuickAdd}
                loading={detecting}
                disabled={detecting}
                icon={Plus}
                trailingArrow
              />
              <PrimaryButton title="Add Manually" onPress={openManualAdd} variant="secondary" icon={Wifi} />
            </View>

            <SectionHeader title="Allowed WiFi" />
          </>
        }
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.itemTop}>
                <View style={styles.itemIcon}>
                  {item.isActive ? (
                    <Wifi color={theme.colors.primary} size={18} strokeWidth={2.2} />
                  ) : (
                    <WifiOff color={theme.colors.textSoft} size={18} strokeWidth={2.2} />
                  )}
                </View>
                <View style={styles.itemText}>
                  <Body style={styles.itemTitle}>{item.ssid || 'Unnamed WiFi entry'}</Body>
                  <Caption>{item.ip ? `Identifier ${item.ip}` : 'Identifier not set'}</Caption>
                </View>
              </View>
              <StatusBadge tone={item.isActive ? 'success' : 'neutral'} label={item.isActive ? 'Active' : 'Paused'} />
            </View>

            {item.remarks ? <Caption style={styles.remarks}>{item.remarks}</Caption> : null}

            <View style={styles.actionRow}>
              <PrimaryButton
                title={item.isActive ? 'Pause' : 'Activate'}
                onPress={() => void toggleActive(item.id, !item.isActive)}
                variant="ghost"
                icon={ShieldCheck}
                style={styles.actionButton}
              />
              <PrimaryButton
                title="Edit"
                onPress={() => openEdit(item)}
                variant="secondary"
                icon={Pencil}
                style={styles.actionButton}
              />
              <PrimaryButton
                title="Delete"
                onPress={() => void remove(item.id)}
                variant="danger"
                icon={Trash2}
                style={styles.actionButton}
              />
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Body style={styles.emptyTitle}>No WiFi entries yet</Body>
            <Caption>Add current WiFi or create one manually.</Caption>
          </Card>
        }
      />

      <AppModal
        visible={modal.visible}
        title={modal.mode === 'edit' ? 'Edit WiFi Entry' : 'Add WiFi Entry'}
        subtitle={modal.source === 'detected' ? 'Review before save.' : 'Enter WiFi details.'}
        onClose={closeModal}>
        {modal.source === 'detected' ? (
          <Card style={styles.detectedCard}>
            <Caption>Detected SSID: {modal.originalSsid || 'Unavailable'}</Caption>
            <Caption>Detected identifier: {modal.originalIp || 'Unavailable'}</Caption>
          </Card>
        ) : null}

        <InputField label="SSID / Name" value={ssid} onChangeText={setSsid} placeholder="Office WiFi" icon={Wifi} />
        <InputField label="IP / Identifier" value={ip} onChangeText={setIp} placeholder="192.168.1.1" icon={ShieldCheck} autoCapitalize="none" />
        <InputField
          label="Remarks"
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Optional notes"
          multiline
          icon={Pencil}
        />

        <View style={styles.modalActions}>
          <PrimaryButton title="Cancel" variant="ghost" onPress={closeModal} style={styles.modalButton} />
          <PrimaryButton
            title={modal.mode === 'edit' ? 'Save Changes' : 'Save Entry'}
            onPress={() => void persistEntry()}
            disabled={saving}
            loading={saving}
            style={styles.modalButton}
          />
        </View>

        {saving ? <ActivityIndicator color={theme.colors.primary} style={styles.spinner} /> : null}
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: 140,
  },
  hero: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.hero,
  },
  currentCard: {
    marginTop: theme.spacing.md,
  },
  currentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  metaLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
  },
  currentValue: {
    color: theme.colors.text,
    marginTop: 6,
  },
  feedback: {
    marginTop: theme.spacing.md,
  },
  feedbackText: {
    color: theme.colors.text,
  },
  feedbackError: {
    backgroundColor: 'rgba(120, 23, 35, 0.46)',
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(13, 77, 56, 0.44)',
  },
  feedbackInfo: {
    backgroundColor: 'rgba(34, 60, 96, 0.4)',
  },
  ctaStack: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  itemCard: {
    marginBottom: theme.spacing.md,
  },
  itemHeader: {
    gap: theme.spacing.md,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(86, 194, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  remarks: {
    marginTop: theme.spacing.md,
  },
  actionRow: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  actionButton: {
    width: '100%',
  },
  emptyCard: {
    marginTop: theme.spacing.sm,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  detectedCard: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
  spinner: {
    marginTop: theme.spacing.md,
  },
});
