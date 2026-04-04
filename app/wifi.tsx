import { useFocusEffect } from '@react-navigation/native';
import { Pencil, Plus, ShieldCheck, Trash2, Wifi, WifiOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

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
  findWifiListConflict,
  getCurrentWifiInfo,
  getNetworkSnapshot,
} from '@/services/networkService';
import type { AllowedWifiEntry, NetworkSnapshot } from '@/types/models';
import { useAppStore } from '@/store/appStore';

type FeedbackState = {
  kind: 'success' | 'error' | 'info';
  message: string;
} | null;

type WifiListKind = 'allowed' | 'noLogin';

type ModalState = {
  visible: boolean;
  mode: 'create' | 'edit';
  source: 'manual' | 'detected';
  listKind: WifiListKind;
  entryId?: string;
  originalSsid?: string;
  originalIp?: string;
};

type SectionRow = { listKind: WifiListKind; entry: AllowedWifiEntry };

function newId() {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function listSettingsKey(kind: WifiListKind): 'allowedWifi' | 'noLoginWifi' {
  return kind === 'allowed' ? 'allowedWifi' : 'noLoginWifi';
}

export default function WifiScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const sections = useMemo(
    () =>
      [
        {
          title: 'No portal (no login/logout)',
          data: settings.noLoginWifi.map((entry) => ({ listKind: 'noLogin' as const, entry })),
        },
        {
          title: 'Portal login required',
          data: settings.allowedWifi.map((entry) => ({ listKind: 'allowed' as const, entry })),
        },
      ] as { title: string; data: SectionRow[] }[],
    [settings.allowedWifi, settings.noLoginWifi]
  );

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
    listKind: 'allowed',
  });

  const access = useMemo(
    () =>
      snapshot ? evaluateWifiAccess(snapshot, settings.allowedWifi, settings.noLoginWifi) : null,
    [settings.allowedWifi, settings.noLoginWifi, snapshot]
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

  function openManualAdd(listKind: WifiListKind) {
    resetForm();
    setFeedback(null);
    setModal({ visible: true, mode: 'create', source: 'manual', listKind });
  }

  function openEdit(entry: AllowedWifiEntry, listKind: WifiListKind) {
    setFeedback(null);
    setSsid(entry.ssid);
    setIp(entry.ip ?? '');
    setRemarks(entry.remarks ?? '');
    setModal({
      visible: true,
      mode: 'edit',
      source: 'manual',
      listKind,
      entryId: entry.id,
      originalSsid: entry.ssid,
      originalIp: entry.ip,
    });
  }

  function closeModal() {
    setModal((current) => ({ ...current, visible: false }));
    resetForm();
  }

  async function openQuickAdd(listKind: WifiListKind) {
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

      const conflict = findWifiListConflict(
        { ssid: info.ssid ?? '', ip: identifier },
        settings.allowedWifi,
        settings.noLoginWifi
      );
      if (conflict) {
        if (conflict === listKind) {
          setFeedback({ kind: 'info', message: 'This WiFi network is already in this list.' });
        } else {
          setFeedback({
            kind: 'info',
            message: `This network is already in the ${conflict === 'allowed' ? 'portal login' : 'no-portal'} list.`,
          });
        }
        return;
      }

      setSsid(info.ssid ?? '');
      setIp(identifier ?? '');
      setRemarks('');
      setModal({
        visible: true,
        mode: 'create',
        source: 'detected',
        listKind,
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

    const key = listSettingsKey(modal.listKind);
    const currentList = settings[key];
    const otherKey = listSettingsKey(modal.listKind === 'allowed' ? 'noLogin' : 'allowed');
    const otherList = settings[otherKey];

    const dupOther = findDuplicateAllowedWifi(otherList, { ssid: nextSsid, ip: nextIp || undefined });
    if (dupOther) {
      setFeedback({
        kind: 'error',
        message: `This network is already in the ${modal.listKind === 'allowed' ? 'no-portal' : 'portal login'} list.`,
      });
      return;
    }

    const dupSame = findDuplicateAllowedWifi(
      currentList,
      { ssid: nextSsid, ip: nextIp || undefined },
      modal.mode === 'edit' ? modal.entryId : undefined
    );
    if (dupSame) {
      setFeedback({ kind: 'error', message: 'This WiFi network is already in this list.' });
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === 'edit' && modal.entryId) {
        const updated = currentList.map((entry) =>
          entry.id === modal.entryId
            ? { ...entry, ssid: nextSsid, ip: nextIp || undefined, remarks: nextRemarks || undefined }
            : entry
        );
        await setSettings({ [key]: updated });
        const label = modal.listKind === 'allowed' ? 'Allowed WiFi entry updated' : 'No-portal WiFi entry updated';
        await appendActivityLog('info', label, { id: modal.entryId });
        setFeedback({ kind: 'success', message: 'WiFi entry updated successfully.' });
      } else {
        const next: AllowedWifiEntry = {
          id: newId(),
          ssid: nextSsid,
          ip: nextIp || undefined,
          remarks: nextRemarks || undefined,
          isActive: true,
        };
        await setSettings({ [key]: [...currentList, next] });
        const label = modal.listKind === 'allowed' ? 'Allowed WiFi entry added' : 'No-portal WiFi entry added';
        await appendActivityLog('success', label, { id: next.id });
        setFeedback({ kind: 'success', message: 'WiFi entry saved successfully.' });
      }
      closeModal();
      setSnapshot(await getNetworkSnapshot());
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(listKind: WifiListKind, id: string, isActive: boolean) {
    const key = listSettingsKey(listKind);
    const list = settings[key].map((entry) => (entry.id === id ? { ...entry, isActive } : entry));
    await setSettings({ [key]: list });
    await appendActivityLog('info', 'WiFi entry toggled', { id, isActive, list: key });
    setSnapshot(await getNetworkSnapshot());
  }

  async function remove(listKind: WifiListKind, id: string) {
    const key = listSettingsKey(listKind);
    const list = settings[key].filter((entry) => entry.id !== id);
    await setSettings({ [key]: list });
    await appendActivityLog('warn', 'WiFi entry removed', { id, list: key });
    setFeedback({ kind: 'success', message: 'WiFi entry deleted successfully.' });
    setSnapshot(await getNetworkSnapshot());
  }

  const currentBadge = !snapshot?.isWifi
    ? { tone: 'neutral' as const, label: 'Offline' }
    : access?.skipPortalAuth
      ? { tone: 'success' as const, label: 'No portal' }
      : access?.match
        ? { tone: 'success' as const, label: 'Authorized' }
        : access?.noRestriction
          ? { tone: 'warning' as const, label: 'Open mode' }
          : { tone: 'error' as const, label: 'Blocked' };

  return (
    <Screen contentStyle={styles.content}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.listKind}-${item.entry.id}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title } }) => <SectionHeader title={title} />}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <Card style={styles.emptySectionCard}>
              <Caption>No entries yet.</Caption>
            </Card>
          ) : null
        }
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Eyebrow>Network Policy</Eyebrow>
              <Title style={styles.title}>WiFi access</Title>
              <Subtitle>No-portal networks skip firewall login and server logout. Portal lists keep the previous behavior.</Subtitle>
            </View>

            <Card style={styles.currentCard}>
              <View style={styles.currentHeader}>
                <View>
                  <Caption style={styles.metaLabel}>Current network</Caption>
                  <Body style={styles.currentValue}>
                    {snapshot?.isWifi ? snapshot.ssid || 'WiFi connected' : 'No active WiFi'}
                  </Body>
                </View>
                <StatusBadge tone={currentBadge.tone} label={currentBadge.label} />
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
                title="Add current — portal login"
                onPress={() => void openQuickAdd('allowed')}
                loading={detecting}
                disabled={detecting}
                icon={Plus}
                trailingArrow
              />
              <PrimaryButton
                title="Add current — no portal"
                onPress={() => void openQuickAdd('noLogin')}
                loading={detecting}
                disabled={detecting}
                variant="secondary"
                icon={Wifi}
                trailingArrow
              />
              <PrimaryButton title="Add manually — portal" onPress={() => openManualAdd('allowed')} variant="secondary" icon={ShieldCheck} />
              <PrimaryButton title="Add manually — no portal" onPress={() => openManualAdd('noLogin')} variant="ghost" icon={WifiOff} />
            </View>
          </>
        }
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={styles.itemTop}>
                <View style={styles.itemIcon}>
                  {item.entry.isActive ? (
                    <Wifi color={theme.colors.primary} size={18} strokeWidth={2.2} />
                  ) : (
                    <WifiOff color={theme.colors.textSoft} size={18} strokeWidth={2.2} />
                  )}
                </View>
                <View style={styles.itemText}>
                  <Body style={styles.itemTitle}>{item.entry.ssid || 'Unnamed WiFi entry'}</Body>
                  <Caption>{item.entry.ip ? `Identifier ${item.entry.ip}` : 'Identifier not set'}</Caption>
                </View>
              </View>
              <View style={styles.itemBadges}>
                <StatusBadge tone="neutral" label={item.listKind === 'noLogin' ? 'No portal' : 'Portal'} />
                <StatusBadge tone={item.entry.isActive ? 'success' : 'neutral'} label={item.entry.isActive ? 'Active' : 'Paused'} />
              </View>
            </View>

            {item.entry.remarks ? <Caption style={styles.remarks}>{item.entry.remarks}</Caption> : null}

            <View style={styles.actionRow}>
              <PrimaryButton
                title={item.entry.isActive ? 'Pause' : 'Activate'}
                onPress={() => void toggleActive(item.listKind, item.entry.id, !item.entry.isActive)}
                variant="ghost"
                icon={ShieldCheck}
                style={styles.actionButton}
              />
              <PrimaryButton
                title="Edit"
                onPress={() => openEdit(item.entry, item.listKind)}
                variant="secondary"
                icon={Pencil}
                style={styles.actionButton}
              />
              <PrimaryButton
                title="Delete"
                onPress={() => void remove(item.listKind, item.entry.id)}
                variant="danger"
                icon={Trash2}
                style={styles.actionButton}
              />
            </View>
          </Card>
        )}
      />

      <AppModal
        visible={modal.visible}
        title={modal.mode === 'edit' ? 'Edit WiFi Entry' : 'Add WiFi Entry'}
        subtitle={
          modal.listKind === 'noLogin'
            ? modal.source === 'detected'
              ? 'No portal — review before save.'
              : 'No portal — enter WiFi details.'
            : modal.source === 'detected'
              ? 'Portal login — review before save.'
              : 'Portal login — enter WiFi details.'
        }
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
    marginTop: theme.spacing.sm,
  },
  currentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
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
    marginTop: theme.spacing.sm,
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
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  emptySectionCard: {
    marginBottom: theme.spacing.sm,
  },
  itemCard: {
    marginBottom: theme.spacing.sm,
  },
  itemHeader: {
    gap: theme.spacing.sm,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
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
  itemBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  remarks: {
    marginTop: theme.spacing.sm,
  },
  actionRow: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  actionButton: {
    width: '100%',
  },
  detectedCard: {
    marginBottom: theme.spacing.md,
    padding: 10,
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
