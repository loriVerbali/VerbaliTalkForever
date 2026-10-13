/**
 * Session picker for the Evidence tab: every session as a chip in a strip that scrolls
 * sideways, between previous/next arrows sized as full touch targets.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Chip } from './primitives';
import { iepColors, iepStyles } from './theme';

export interface SessionPagerItem {
  id: string;
  label: string;
}

/** The smallest comfortable tap target. */
export const PAGER_ARROW_SIZE = 44;

const Arrow: React.FC<{ symbol: string; label: string; disabled: boolean; onPress: () => void }> = ({ symbol, label, disabled, onPress }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    style={{
      width: PAGER_ARROW_SIZE,
      height: PAGER_ARROW_SIZE,
      borderRadius: PAGER_ARROW_SIZE / 2,
      borderWidth: 1,
      borderColor: disabled ? iepColors.border : iepColors.blue,
      backgroundColor: iepColors.white,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
    <Text style={{ fontSize: 26, lineHeight: 30, color: disabled ? iepColors.border : iepColors.blue }}>{symbol}</Text>
  </TouchableOpacity>
);

export const SessionPager: React.FC<{ sessions: readonly SessionPagerItem[]; selectedId: string | null; onSelect: (id: string) => void }> = ({ sessions, selectedId, onSelect }) => {
  const strip = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const [stripWidth, setStripWidth] = useState(0);
  const index = sessions.findIndex(s => s.id === selectedId);

  /** Scrolls so the chip sits about a third of the way in, where the neighbours on both sides stay visible. */
  const reveal = useCallback(
    (id: string) => {
      const x = offsets.current[id];
      if (x !== undefined && strip.current) {
        strip.current.scrollTo({ x: Math.max(0, x - stripWidth / 3), animated: true });
      }
    },
    [stripWidth],
  );

  useEffect(() => {
    if (selectedId) {
      reveal(selectedId);
    }
  }, [selectedId, reveal]);

  if (sessions.length === 0) {
    return null;
  }
  return (
    <View style={[iepStyles.row, { gap: 8, flex: 1, minWidth: 260 }]}>
      <Arrow symbol="‹" label="Previous session" disabled={index <= 0} onPress={() => onSelect(sessions[index - 1].id)} />
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 6, alignItems: 'center', paddingVertical: 2 }}
        onLayout={e => setStripWidth(e.nativeEvent.layout.width)}>
        {sessions.map(s => (
          <View
            key={s.id}
            onLayout={e => {
              offsets.current[s.id] = e.nativeEvent.layout.x;
              if (s.id === selectedId) {
                reveal(s.id);
              }
            }}>
            <Chip label={s.label} selected={s.id === selectedId} onPress={() => onSelect(s.id)} />
          </View>
        ))}
      </ScrollView>
      <Arrow symbol="›" label="Next session" disabled={index < 0 || index >= sessions.length - 1} onPress={() => onSelect(sessions[index + 1].id)} />
    </View>
  );
};
