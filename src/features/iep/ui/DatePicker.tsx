/** A month calendar and a tappable date field that opens it, so dates are picked rather than typed. */

import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { humanDay, monthWeeks, startOfLocalDay } from '../application/reportingPeriod';
import { Sheet } from './primitives';
import { iepColors, iepStyles } from './theme';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CELL = 40;

/** One month of selectable days. Days before `minMs` or after `maxMs` cannot be chosen. */
export const Calendar: React.FC<{ valueMs: number; onChange: (ms: number) => void; minMs?: number; maxMs?: number }> = ({ valueMs, onChange, minMs, maxMs }) => {
  const selected = startOfLocalDay(valueMs);
  const [shown, setShown] = useState(() => ({ year: new Date(valueMs).getFullYear(), month: new Date(valueMs).getMonth() }));
  useEffect(() => {
    setShown({ year: new Date(selected).getFullYear(), month: new Date(selected).getMonth() });
  }, [selected]);

  const today = startOfLocalDay(Date.now());
  const min = minMs === undefined ? -Infinity : startOfLocalDay(minMs);
  const max = maxMs === undefined ? Infinity : startOfLocalDay(maxMs);
  const canGoBack = new Date(shown.year, shown.month, 0).getTime() >= min;
  const canGoForward = new Date(shown.year, shown.month + 1, 1).getTime() <= max;
  const move = (months: number) => {
    const d = new Date(shown.year, shown.month + months, 1);
    setShown({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <View style={{ alignSelf: 'center', gap: 6 }}>
      <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
        <MonthArrow label="‹" accessibilityLabel="Previous month" disabled={!canGoBack} onPress={() => move(-1)} />
        <Text style={iepStyles.headline} accessibilityRole="header">{MONTH_NAMES[shown.month]} {shown.year}</Text>
        <MonthArrow label="›" accessibilityLabel="Next month" disabled={!canGoForward} onPress={() => move(1)} />
      </View>
      <View style={iepStyles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={[iepStyles.captionStrong, { width: CELL, textAlign: 'center' }]}>{d}</Text>
        ))}
      </View>
      {monthWeeks(shown.year, shown.month).map((week, w) => (
        <View key={w} style={iepStyles.row}>
          {week.map((day, i) => {
            if (day === null) {
              return <View key={i} style={{ width: CELL, height: CELL }} />;
            }
            const ms = new Date(shown.year, shown.month, day).getTime();
            const disabled = ms < min || ms > max;
            const isSelected = ms === selected;
            return (
              <TouchableOpacity
                key={i}
                accessibilityRole="button"
                accessibilityLabel={humanDay(ms)}
                accessibilityState={{ selected: isSelected, disabled }}
                disabled={disabled}
                onPress={() => onChange(ms)}
                style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: CELL - 6, height: CELL - 6, borderRadius: (CELL - 6) / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? iepColors.blue : 'transparent', borderWidth: ms === today && !isSelected ? 1 : 0, borderColor: iepColors.blue }}>
                  <Text style={{ fontSize: 15, fontWeight: isSelected || ms === today ? '700' : '500', color: isSelected ? iepColors.white : disabled ? iepColors.border : iepColors.ink }}>{day}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const MonthArrow: React.FC<{ label: string; accessibilityLabel: string; disabled: boolean; onPress: () => void }> = ({ label, accessibilityLabel, disabled, onPress }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 24, fontWeight: '600', color: disabled ? iepColors.border : iepColors.blue }}>{label}</Text>
  </TouchableOpacity>
);

/** A labelled field showing a date; tapping it opens a calendar, and choosing a day closes it. */
export const DateField: React.FC<{ label: string; valueMs: number; onChange: (ms: number) => void; minMs?: number; maxMs?: number }> = ({ label, valueMs, onChange, minMs, maxMs }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, minWidth: 130 }}>
      <Text style={iepStyles.caption}>{label}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label} date, ${humanDay(valueMs)}`}
        accessibilityHint="Opens a calendar"
        onPress={() => setOpen(true)}
        style={[iepStyles.input, iepStyles.row, { justifyContent: 'space-between', gap: 8 }]}>
        <Text style={iepStyles.body}>{humanDay(valueMs)}</Text>
        <Text style={{ color: iepColors.muted, fontSize: 12 }}>▼</Text>
      </TouchableOpacity>
      <Sheet visible={open} title={`${label} date`} onClose={() => setOpen(false)} maxWidth={360}>
        <Calendar valueMs={valueMs} minMs={minMs} maxMs={maxMs} onChange={ms => { onChange(ms); setOpen(false); }} />
      </Sheet>
    </View>
  );
};
