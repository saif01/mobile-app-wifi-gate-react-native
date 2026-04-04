import { useFocusEffect } from '@react-navigation/native';
import { Globe, Pause, Pencil, Play, Plus, ShieldCheck, Trash2, Wifi, WifiOff, Zap } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

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

export default function WifiScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const sections = useMemo<WifiSection[]>(
    () => [
      {
        listKey: 'allowed',
        title: 'Portal Login',
        subtitle: 'Captive-portal networks — WiFiGate handles sign-in & gateway logout.',
        data: settings.allowedWifi.map((entry) => ({ listKind: 'allowed' as const, entry })),
      },
      {
        listKey: 'noLogin',
        title: 'No Portal',
        subtitle: 'Open networks — no captive portal; authentication steps are skipped.',
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
  const [detectingList, setDetectingList] = useState<WifiListKind | null>(null);
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

  async function openManualAdd(listKind: WifiListKind) {
    resetForm();
    setFeedback(null);
    // Silently pre-fill with the current network; falls back to empty form if unavailable
    try {
      const info = await getCurrentWifiInfo({ requestPermission: true });
      if (info.isConnected && info.isWifi) {
        const identifier = info.gateway ?? info.ip;
        setSsid(info.ssid ?? '');
        setIp(identifier ?? '');
      }
    } catch {
      // No WiFi or permission denied — user fills the form manually
    }
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
    setDetectingList(listKind);
    setFeedback(null);
    try {
      const info = await getCurrentWifiInfo({ requestPermission: true });
      if (!info.isConnected || !info.isWifi) {
        setFeedback({ kind: 'error', message: 'Not connected to WiFi. Connect to a network first.' });
        return;
      }

      const identifier = info.gateway ?? info.ip;
      if (!info.ssid && !identifier) {
        setFeedback({
          kind: 'error',
          message: info.permissionMessage ?? 'Unable to detect current WiFi details.',
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
          setFeedback({ kind: 'info', message: 'This network is already in this list.' });
        } else {
          setFeedback({
            kind: 'info',
            message: `Already saved in the ${conflict === 'allowed' ? 'Portal Login' : 'No Portal'} list.`,
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
      setDetectingList(null);
    }
  }

  async function persistEntry() {
    const nextSsid = ssid.trim();
    const nextIp = ip.trim();
    const nextRemarks = remarks.trim();

    if (!nextSsid && !nextIp) {
      setFeedback({ kind: 'error', message: 'Enter a network name or IP identifier to save.' });
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
        message: `This network is already in the ${modal.listKind === 'allowed' ? 'No Portal' : 'Portal Login'} list.`,
      });
      return;
    }

    const dupSame = findDuplicateAllowedWifi(
      currentList,
      { ssid: nextSsid, ip: nextIp || undefined },
      modal.mode === 'edit' ? modal.entryId : undefined
    );
    if (dupSame) {
      setFeedback({ kind: 'error', message: 'This network is already in this list.' });
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
        setFeedback({ kind: 'success', message: 'Entry updated successfully.' });
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
        setFeedback({ kind: 'success', message: 'Entry saved successfully.' });
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
    setFeedback({ kind: 'success', message: 'Entry deleted.' });
    setSnapshot(await getNetworkSnapshot());
  }

  function confirmRemove(listKind: WifiListKind, entry: AllowedWifiEntry) {
    const name = entry.ssid?.trim() || entry.ip?.trim() || 'this entry';
    Alert.alert(
      'Delete entry?',
      `Remove "${name}" from the ${listKind === 'allowed' ? 'Portal Login' : 'No Portal'} list? This cannot be undone.`,
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
    const PolicyIcon = portal ? ShieldCheck : Globe;
    const isActive = item.entry.isActive;
    const iconFg = isActive ? accent : theme.colors.textSoft;
    return (
      <>
        <View style={styles.itemTop}>
          <View style={[styles.itemIcon, { backgroundColor: `${accent}1a` }]}>
            {isActive ? (
              <PolicyIcon color={iconFg} size={18} strokeWidth={2.3} />
            ) : (
              <WifiOff color={iconFg} size={18} strokeWidth={2.3} />
            )}
          </View>
          <View style={styles.itemText}>
            <Body style={styles.itemTitle}>{item.entry.ssid || 'Unnamed network'}</Body>
            <Caption style={styles.itemMeta}>
              {item.entry.ip ? item.entry.ip : 'No identifier set'}
              {item.entry.remarks ? ` · ${item.entry.remarks}` : ''}
            </Caption>
          </View>
          <StatusBadge tone={isActive ? 'success' : 'neutral'} label={isActive ? 'Active' : 'Paused'} />
        </View>

        <View style={styles.actionRow}>
          <PrimaryButton
            title={isActive ? 'Pause' : 'Resume'}
            onPress={() => void toggleActive(item.listKind, item.entry.id, !isActive)}
            variant="ghost"
            icon={isActive ? Pause : Play}
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

        {/* Hero */}
        <View style={styles.hero}>
          <Eyebrow>Network Policy</Eyebrow>
          <Title style={styles.title}>WiFi Access</Title>
        </View>

        {/* Current network status */}
        <Card style={styles.currentCard}>
          <View style={styles.currentRow}>
            <View style={[styles.currentIconWrap, snapshot?.isWifi ? styles.currentIconOnline : styles.currentIconOffline]}>
              {snapshot?.isWifi
                ? <Wifi color={theme.colors.primary} size={18} strokeWidth={2.3} />
                : <WifiOff color={theme.colors.textSoft} size={18} strokeWidth={2.3} />
              }
            </View>
            <View style={styles.currentText}>
              <Caption style={styles.metaLabel}>Current network</Caption>
              <Body style={styles.currentValue}>
                {snapshot?.isWifi ? snapshot.ssid || 'WiFi connected' : 'No active WiFi'}
              </Body>
              <Caption style={styles.currentMeta}>
                {snapshot?.gatewayIp ? `Gateway · ${snapshot.gatewayIp}` : 'Connect to WiFi to detect the network'}
              </Caption>
            </View>
            <StatusBadge tone={currentBadge.tone} label={currentBadge.label} />
          </View>
        </Card>

        {/* Feedback */}
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

        {/* Network list sections — add buttons are embedded in each header */}
        {sections.map((section) => {
          const portal = section.listKey === 'allowed';
          const accent = portal ? theme.colors.wifiPortal : theme.colors.wifiNoPortal;
          const PolicyIcon = portal ? ShieldCheck : Globe;
          const tintBg = portal ? 'rgba(86, 194, 255, 0.06)' : 'rgba(61, 212, 192, 0.07)';
          const isDetectingThis = detectingList === section.listKey;
          return (
            <Card
              key={section.listKey}
              style={[
                styles.sectionGroup,
                {
                  borderTopWidth: 3,
                  borderTopColor: accent,
                  backgroundColor: tintBg,
                  borderColor: `${accent}30`,
                },
              ]}>
              {/* Header row: icon + title/subtitle + quick-add + manual-add + count */}
              <View style={styles.sectionGroupHeader}>
                <View style={[styles.sectionIconRing, { backgroundColor: `${accent}20`, borderColor: `${accent}38` }]}>
                  <PolicyIcon color={accent} size={20} strokeWidth={2.3} />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Body style={styles.sectionHeaderTitle}>{section.title}</Body>
                  <Caption style={styles.sectionHeaderSubtitle}>{section.subtitle}</Caption>
                </View>
                <View style={styles.sectionActions}>
                  {/* ⚡ Detect & add current network */}
                  <TouchableOpacity
                    style={[styles.sectionBtn, { backgroundColor: `${accent}18`, opacity: detecting ? 0.45 : 1 }]}
                    onPress={() => void openQuickAdd(section.listKey)}
                    disabled={detecting}
                    accessibilityLabel={`Detect and add current network to ${section.title}`}>
                    {isDetectingThis
                      ? <ActivityIndicator size={14} color={accent} />
                      : <Zap color={accent} size={14} strokeWidth={2.5} />
                    }
                  </TouchableOpacity>
                  {/* + Manual entry */}
                  <TouchableOpacity
                    style={[styles.sectionBtn, { backgroundColor: `${accent}18`, opacity: detecting ? 0.45 : 1 }]}
                    onPress={() => void openManualAdd(section.listKey)}
                    disabled={detecting}
                    accessibilityLabel={`Manually add a network to ${section.title}`}>
                    <Plus color={accent} size={14} strokeWidth={2.5} />
                  </TouchableOpacity>
                  {/* Entry count pill */}
                  <View style={[styles.sectionCountPill, { backgroundColor: `${accent}20` }]}>
                    <Caption style={[styles.sectionCountLabel, { color: accent }]}>{section.data.length}</Caption>
                  </View>
                </View>
              </View>

              {/* Empty state */}
              {section.data.length === 0 ? (
                <View style={[styles.sectionEmptyInner, { borderColor: `${accent}28` }]}>
                  <PolicyIcon color={accent} size={22} strokeWidth={1.8} style={{ opacity: 0.35 }} />
                  <Caption style={styles.sectionEmptyText}>
                    No {portal ? 'portal' : 'open'} networks yet.{'\n'}
                    Tap{' '}
                    <Caption style={{ color: accent }}>⚡</Caption>
                    {' '}to detect the current one, or{' '}
                    <Caption style={{ color: accent }}>+</Caption>
                    {' '}to enter manually.
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
        title={modal.mode === 'edit' ? 'Edit Network' : `Add to ${modal.listKind === 'allowed' ? 'Portal Login' : 'No Portal'}`}
        subtitle={
          modal.source === 'detected'
            ? 'Detected network — review the details and confirm.'
            : modal.listKind === 'allowed'
              ? 'Portal network — enter the WiFi name and/or gateway IP.'
              : 'Open network — enter the WiFi name and/or gateway IP.'
        }
        onClose={closeModal}>

        {/* Detected network summary */}
        {modal.source === 'detected' ? (
          <Card style={styles.detectedCard}>
            <View style={styles.detectedRow}>
              <Wifi color={theme.colors.primary} size={13} strokeWidth={2.3} />
              <Caption style={styles.detectedLabel}>SSID</Caption>
              <Caption style={styles.detectedValue}>{modal.originalSsid || 'Unavailable'}</Caption>
            </View>
            <View style={styles.detectedRow}>
              <ShieldCheck color={theme.colors.textSoft} size={13} strokeWidth={2.3} />
              <Caption style={styles.detectedLabel}>Gateway</Caption>
              <Caption style={styles.detectedValue}>{modal.originalIp || 'Unavailable'}</Caption>
            </View>
          </Card>
        ) : null}

        <InputField
          label="Network name (SSID)"
          value={ssid}
          onChangeText={setSsid}
          placeholder="e.g. Office-WiFi"
          icon={Wifi}
        />
        <InputField
          label="Gateway IP / Identifier"
          value={ip}
          onChangeText={setIp}
          placeholder="e.g. 192.168.1.1"
          icon={ShieldCheck}
          autoCapitalize="none"
        />
        <InputField
          label="Notes"
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Optional — location, purpose…"
          multiline
          icon={Pencil}
        />

        <View style={styles.modalActions}>
          <PrimaryButton title="Cancel" variant="ghost" onPress={closeModal} style={styles.modalButton} />
          <PrimaryButton
            title={modal.mode === 'edit' ? 'Save Changes' : 'Save'}
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
    paddingTop: theme.spacing.md,
    paddingBottom: 140,
  },
  hero: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.typography.hero,
  },

  // ── Current network card ──────────────────────────────────────────────────
  currentCard: {
    marginTop: theme.spacing.xs,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  currentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  currentIconOnline: {
    backgroundColor: 'rgba(86, 194, 255, 0.14)',
  },
  currentIconOffline: {
    backgroundColor: 'rgba(113, 130, 155, 0.14)',
  },
  currentText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  metaLabel: {
    color: theme.colors.cyan,
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  currentValue: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  currentMeta: {
    color: theme.colors.textMuted,
    marginTop: 1,
  },

  // ── Feedback banner ───────────────────────────────────────────────────────
  feedback: {
    marginTop: theme.spacing.sm,
  },
  feedbackText: {
    color: theme.colors.text,
    fontSize: 13,
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

  // ── Section cards ─────────────────────────────────────────────────────────
  sectionGroup: {
    marginTop: theme.spacing.lg,
  },
  sectionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sectionIconRing: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sectionHeaderSubtitle: {
    lineHeight: 16,
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  sectionBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountPill: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountLabel: {
    fontWeight: '800',
    fontSize: 12,
  },
  sectionEmptyInner: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sectionEmptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    lineHeight: 19,
  },
  sectionEntries: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },

  // ── Entry cards ───────────────────────────────────────────────────────────
  nestedEntry: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  itemMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  detectedCard: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceStrong,
    gap: 8,
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  detectedLabel: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 11,
    minWidth: 54,
  },
  detectedValue: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 12,
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
