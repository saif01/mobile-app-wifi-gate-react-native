import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Caption, Subtitle } from '@/components/ui/Typography';
import { theme } from '@/constants/theme';

export function AppModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Subtitle style={styles.title}>{title}</Subtitle>
              {subtitle ? <Caption>{subtitle}</Caption> : null}
            </View>
            <Pressable onPress={onClose} style={styles.close}>
              <X color={theme.colors.textMuted} size={18} strokeWidth={2.2} />
            </Pressable>
          </View>
          {children}
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.overlay,
  },
  card: {
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 22,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
