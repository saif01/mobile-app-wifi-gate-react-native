import { useFocusEffect } from '@react-navigation/native';
import { Pencil, Plus, ShieldCheck, Trash2, Unplug, Wifi, WifiOff } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/Button';
import { AppModal } from '@/components/ui/AppModal';
import { Card } from '@/components/ui/Card';
import { InputField } from '@/components/ui/InputField';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Typography';
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

type WifiSection = {
  listKey: WifiListKind;
  title: string;
  subtitle: string;
  data: SectionRow[];
};

function newId() {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function listSettingsKey(kind: WifiListKind): 'allowedWifi' | 'noLoginWifi' {
  return kind === 'allowed' ? 'allowedWifi' : 'noLoginWifi';
}

/** Shown under each add button so portal vs no-portal choice is obvious. */
const ADD_HINT_PORTAL =
  'Portal login — for Wi‑Fi with a captive/firewall portal. WiFiGate signs you in and can log you out on the gateway.';
const ADD_HINT_NO_PORTAL =
  'No portal — for open Wi‑Fi without a captive portal. Firewall login and server logout are not used.';

export default function WifiScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const sections = useMemo<WifiSection[]>(
    () => [
      {
        listKey: 'allowed',
        title: 'Portal login',
        subtitle: 'Wi‑Fi with a captive portal — firewall sign-in and gateway logout apply.',
        data: settings.allowedWifi.map((entry) => ({ listKind: 'allowed' as const, entry })),
      },
      {
        listKey: 'noLogin',
        title: 'No portal',
        subtitle: 'Open Wi‑Fi — no captive portal; firewall login and logout are skipped.',
        data: settings.noLoginWifi.map((entry) => ({ listKind: 'noLogin' as const, entry })),
      },
    ],
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

  function confirmRemove(listKind: WifiListKind, entry: AllowedWifiEntry) {
    const listLabel = listKind === 'allowed' ? 'portal allowlist' : 'no-portal list';
    const name = entry.ssid?.trim() || entry.ip?.trim() || 'this entry';
    Alert.alert(
      'Delete Wi‑Fi entry?',
      `Remove “${name}” from the ${listLabel}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void remove(listKind, entry.id),
        },
      ]
    );
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

  function renderWifiEntry(item: SectionRow) {
    const portal = item.listKind === 'allowed';
    const accent = portal ? theme.colors.wifiPortal : theme.colors.wifiNoPortal;
    const PolicyIcon = portal ? ShieldCheck : Unplug;
    const iconFg = item.entry.isActive ? accent : theme.colors.textSoft;
    return (
      <>
        <View style={styles.itemHeader}>
          <View style={styles.itemTop}>
            <View style={[styles.itemIcon, { backgroundColor: `${accent}20` }]}>
              {item.entry.isActive ? (
                <PolicyIcon color={iconFg} size={20} strokeWidth={2.3} />
              ) : (
                <WifiOff color={iconFg} size={20} strokeWidth={2.3} />
              )}
            </View>
            <View style={styles.itemText}>
              <Body style={styles.itemTitle}>{item.entry.ssid || 'Unnamed WiFi entry'}</Body>
              <Caption>{item.entry.ip ? `Identifier ${item.entry.ip}` : 'Identifier not set'}</Caption>
            </View>
          </View>
          <View style={styles.itemBadges}>
            <StatusBadge
              tone={portal ? 'success' : 'warning'}
              label={portal ? 'Portal login' : 'No portal'}
            />
            <StatusBadge tone={item.entry.isActive ? 'success' : 'neutral'} label={item.entry.isActive ? 'Active' : 'Paused'} />
          </View>
        </View>

        {item.entry.remarks ? <Caption style={styles.remarks}>{item.entry.remarks}</Caption> : null}

        <View style={styles.actionRow}>
          <PrimaryButton
            title={item.entry.isActive ? 'Pause' : 'Resume'}
            onPress={() => void toggleActive(item.listKind, item.entry.id, !item.entry.isActive)}
            variant="ghost"
            icon={ShieldCheck}
            compact
            style={styles.actionButton}
          />
          <PrimaryButton
            title="Edit"
            onPress={() => openEdit(item.entry, item.listKind)}
            variant="secondary"
            icon={Pencil}
            compact
            style={styles.actionButton}
          />
          <PrimaryButton
            title="Delete"
            onPress={() => confirmRemove(item.listKind, item.entry)}
            variant="danger"
            icon={Trash2}
            compact
            style={styles.actionButton}
          />
        </View>
      </>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Eyebrow>Network Policy</Eyebrow>
          <Title style={styles.title}>WiFi access</Title>
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
          <View style={styles.ctaBlock}>
            <PrimaryButton
              title="Add current — portal login"
              onPress={() => void openQuickAdd('allowed')}
              loading={detecting}
              disabled={detecting}
              icon={Plus}
              trailingArrow
            />
            <Caption style={[styles.ctaHint, styles.ctaHintPortal]}>{ADD_HINT_PORTAL}</Caption>
          </View>
          <View style={styles.ctaBlock}>
            <PrimaryButton
              title="Add current — no portal"
              onPress={() => void openQuickAdd('noLogin')}
              loading={detecting}
              disabled={detecting}
              variant="secondary"
              icon={Unplug}
              trailingArrow
            />
            <Caption style={[styles.ctaHint, styles.ctaHintNoPortal]}>{ADD_HINT_NO_PORTAL}</Caption>
          </View>
          <View style={styles.ctaBlock}>
            <PrimaryButton title="Add manually — portal" onPress={() => openManualAdd('allowed')} variant="secondary" icon={ShieldCheck} />
            <Caption style={[styles.ctaHint, styles.ctaHintPortal]}>{ADD_HINT_PORTAL}</Caption>
          </View>
          <View style={styles.ctaBlock}>
            <PrimaryButton title="Add manually — no portal" onPress={() => openManualAdd('noLogin')} variant="ghost" icon={WifiOff} />
            <Caption style={[styles.ctaHint, styles.ctaHintNoPortal]}>{ADD_HINT_NO_PORTAL}</Caption>
          </View>
        </View>

        {sections.map((section) => {
          const portal = section.listKey === 'allowed';
          const accent = portal ? theme.colors.wifiPortal : theme.colors.wifiNoPortal;
          const PolicyIcon = portal ? ShieldCheck : Unplug;
          const tintBg = portal ? 'rgba(86, 194, 255, 0.07)' : 'rgba(61, 212, 192, 0.08)';
          return (
            <Card
              key={section.listKey}
              style={[
                styles.sectionGroup,
                {
                  borderTopWidth: 4,
                  borderTopColor: accent,
                  backgroundColor: tintBg,
                  borderColor: `${accent}38`,
                },
              ]}>
              <View style={styles.sectionGroupHeader}>
                <View style={[styles.sectionIconRing, { backgroundColor: `${accent}22`, borderColor: `${accent}40` }]}>
                  <PolicyIcon color={accent} size={22} strokeWidth={2.3} />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Body style={styles.sectionHeaderTitle}>{section.title}</Body>
                  <Caption style={styles.sectionHeaderSubtitle}>{section.subtitle}</Caption>
                </View>
                <View style={[styles.sectionCountPill, { backgroundColor: `${accent}20` }]}>
                  <Caption style={[styles.sectionCountLabel, { color: accent }]}>{section.data.length}</Caption>
                </View>
              </View>

              {section.data.length === 0 ? (
                <View style={[styles.sectionEmptyInner, { borderColor: `${accent}30` }]}>
                  <Caption style={styles.sectionEmptyText}>
                    No networks here yet — use the matching “portal” or “no portal” buttons above.
                  </Caption>
                </View>
              ) : (
                <View style={styles.sectionEntries}>
                  {section.data.map((row) => (
                    <View key={`${row.listKind}-${row.entry.id}`} style={styles.nestedEntry}>
                      {renderWifiEntry(row)}
                    </View>
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>

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
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  ctaBlock: {
    gap: 6,
  },
  ctaHint: {
    lineHeight: 17,
    paddingHorizontal: 2,
  },
  ctaHintPortal: {
    color: theme.colors.wifiPortal,
    opacity: 0.92,
  },
  ctaHintNoPortal: {
    color: theme.colors.wifiNoPortal,
    opacity: 0.92,
  },
  sectionGroup: {
    marginTop: theme.spacing.lg,
  },
  sectionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  sectionIconRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sectionHeaderSubtitle: {
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  sectionCountPill: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountLabel: {
    fontWeight: '800',
    fontSize: 13,
  },
  sectionEmptyInner: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  sectionEmptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  sectionEntries: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  nestedEntry: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    width: 40,
    height: 40,
    borderRadius: 14,
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
    flexDirection: 'row',
    gap: 6,
    marginTop: theme.spacing.sm,
    alignItems: 'stretch',
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
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
