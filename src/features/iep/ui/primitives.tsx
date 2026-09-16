/** Small shared pieces: AI tag, status badge, chips, buttons, section headers, modals. */

import React from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View, ViewStyle, TextStyle } from 'react-native';
import { GOAL_STATUS_LABEL, GOAL_STATUS_SYMBOL, GoalUiStatus } from '../application/goalProgress';
import { iepColors, iepStyles, statusColor } from './theme';

export const AiTag: React.FC = () => (
  <View accessibilityLabel="This place uses AI" style={{ backgroundColor: '#E8F0FD', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
    <Text style={{ color: iepColors.blue, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>✦ This place uses AI</Text>
  </View>
);

export const StatusBadge: React.FC<{ status: GoalUiStatus; size?: number }> = ({ status, size = 44 }) => (
  <View
    accessibilityLabel={GOAL_STATUS_LABEL[status]}
    style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: statusColor(status), alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: iepColors.white, fontWeight: '800', fontSize: size * 0.42 }}>{GOAL_STATUS_SYMBOL[status]}</Text>
  </View>
);

export const StatusLabel: React.FC<{ status: GoalUiStatus; style?: TextStyle }> = ({ status, style }) => (
  <Text style={[{ color: statusColor(status), fontWeight: '700', fontSize: 14 }, style]}>
    {GOAL_STATUS_SYMBOL[status]} {GOAL_STATUS_LABEL[status]}
  </Text>
);

export const Chip: React.FC<{ label: string; selected?: boolean; onPress?: () => void; accessibilityLabel?: string; trailing?: React.ReactNode }> = ({ label, selected, onPress, accessibilityLabel, trailing }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ selected: !!selected }}
    accessibilityLabel={accessibilityLabel ?? label}
    onPress={onPress}
    style={[iepStyles.chip, selected && iepStyles.chipSelected, iepStyles.row, { gap: 6 }]}>
    <Text style={[iepStyles.chipText, selected && iepStyles.chipTextSelected]}>{selected ? '✓ ' : ''}{label}</Text>
    {trailing}
  </TouchableOpacity>
);

export const Segmented: React.FC<{ options: Array<{ key: string; label: string }>; value: string; onChange: (key: string) => void; accessibilityLabel?: string }> = ({ options, value, onChange, accessibilityLabel }) => (
  <View accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', backgroundColor: '#E6EDF5', borderRadius: 10, padding: 3 }}>
    {options.map(o => {
      const selected = o.key === value;
      return (
        <TouchableOpacity
          key={o.key}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => onChange(o.key)}
          style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, backgroundColor: selected ? iepColors.white : 'transparent', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? iepColors.ink : iepColors.muted }} numberOfLines={1}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

export const PrimaryButton: React.FC<{ label: string; onPress: () => void; disabled?: boolean; style?: ViewStyle; danger?: boolean; accessibilityLabel?: string }> = ({ label, onPress, disabled, style, danger, accessibilityLabel }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[danger ? iepStyles.buttonDanger : iepStyles.buttonPrimary, disabled && { opacity: 0.55 }, style]}>
    <Text style={iepStyles.buttonPrimaryText}>{label}</Text>
  </TouchableOpacity>
);

export const SecondaryButton: React.FC<{ label: string; onPress: () => void; disabled?: boolean; style?: ViewStyle; accessibilityLabel?: string }> = ({ label, onPress, disabled, style, accessibilityLabel }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[iepStyles.buttonSecondary, disabled && { opacity: 0.55 }, style]}>
    <Text style={iepStyles.buttonSecondaryText}>{label}</Text>
  </TouchableOpacity>
);

export const SectionHeader: React.FC<{ title: string; usesAi?: boolean; trailing?: React.ReactNode }> = ({ title, usesAi, trailing }) => (
  <View style={[iepStyles.row, { justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }]}>
    <View style={[iepStyles.row, { gap: 10, flexShrink: 1 }]}>
      <Text style={iepStyles.sectionTitle}>{title}</Text>
      {usesAi ? <AiTag /> : null}
    </View>
    {trailing}
  </View>
);

export const LabeledRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={[iepStyles.row, { justifyContent: 'space-between', paddingVertical: 8, gap: 12 }]}>
    <Text style={[iepStyles.body, { flexShrink: 1 }]}>{label}</Text>
    <Text style={[iepStyles.subtle, { fontWeight: '600', textAlign: 'right' }]}>{value}</Text>
  </View>
);

/** A landscape-safe sheet with a title bar, close action and scrolling body. */
export const Sheet: React.FC<{ visible: boolean; title: string; onClose: () => void; closeLabel?: string; trailing?: React.ReactNode; children: React.ReactNode; maxWidth?: number }> = ({ visible, title, onClose, closeLabel = 'Cancel', trailing, children, maxWidth = 820 }) => (
  <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right', 'portrait']} onRequestClose={onClose}>
    <Pressable style={{ flex: 1, backgroundColor: 'rgba(16,25,38,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={onClose}>
      <Pressable style={{ backgroundColor: iepColors.canvas, borderRadius: 20, width: '100%', maxWidth, maxHeight: '92%', overflow: 'hidden' }} onPress={e => e.stopPropagation()}>
        <View style={[iepStyles.row, { justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: iepColors.border, backgroundColor: iepColors.white }]}>
          <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={{ color: iepColors.blue, fontSize: 16, fontWeight: '600' }}>{closeLabel}</Text></TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: iepColors.ink }} numberOfLines={1}>{title}</Text>
          <View style={{ minWidth: 60, alignItems: 'flex-end' }}>{trailing}</View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
);

/** A two-button confirmation. */
export const ConfirmDialog: React.FC<{ visible: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }> = ({ visible, title, message, confirmLabel, onConfirm, onCancel }) => (
  <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right', 'portrait']} onRequestClose={onCancel}>
    <View style={{ flex: 1, backgroundColor: 'rgba(16,25,38,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <View style={{ backgroundColor: iepColors.white, borderRadius: 18, padding: 22, width: '100%', maxWidth: 420, gap: 12 }}>
        <Text style={iepStyles.headline}>{title}</Text>
        <Text style={iepStyles.subtle}>{message}</Text>
        <View style={[iepStyles.row, { justifyContent: 'flex-end', gap: 10, marginTop: 6 }]}>
          <SecondaryButton label="Cancel" onPress={onCancel} />
          <PrimaryButton label={confirmLabel} onPress={onConfirm} danger />
        </View>
      </View>
    </View>
  </Modal>
);

/** A simple option menu rendered as a sheet. */
export const OptionMenu: React.FC<{ visible: boolean; title: string; options: Array<{ key: string; label: string; selected?: boolean; destructive?: boolean }>; onSelect: (key: string) => void; onClose: () => void }> = ({ visible, title, options, onSelect, onClose }) => (
  <Sheet visible={visible} title={title} onClose={onClose} closeLabel="Close" maxWidth={420}>
    {options.map(o => (
      <TouchableOpacity key={o.key} accessibilityRole="button" accessibilityState={{ selected: !!o.selected }} onPress={() => onSelect(o.key)} style={[iepStyles.innerCard, iepStyles.row, { justifyContent: 'space-between' }]}>
        <Text style={[iepStyles.body, o.destructive && { color: iepColors.red }]}>{o.label}</Text>
        {o.selected ? <Text style={{ color: iepColors.blue, fontWeight: '700' }}>✓</Text> : null}
      </TouchableOpacity>
    ))}
  </Sheet>
);

export const Checkbox: React.FC<{ checked: boolean; label: string; subtitle?: string; onToggle: () => void; trailing?: React.ReactNode }> = ({ checked, label, subtitle, onToggle, trailing }) => (
  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={[iepStyles.row, { gap: 12, paddingVertical: 8 }]}>
    <Text style={{ fontSize: 20, color: checked ? iepColors.blue : iepColors.muted }}>{checked ? '☑' : '☐'}</Text>
    <View style={{ flex: 1 }}>
      <View style={[iepStyles.row, { gap: 8 }]}>
        <Text style={iepStyles.body}>{label}</Text>
        {trailing}
      </View>
      {subtitle ? <Text style={iepStyles.caption} numberOfLines={2}>{subtitle}</Text> : null}
    </View>
  </TouchableOpacity>
);
